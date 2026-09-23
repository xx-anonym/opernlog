// Macht aus einem durchgesehenen Lauf von spielplaene-lesen.mjs die Datei
// src/data/spielplan.js.
//
//   node tests/werkzeug/spielplan-uebernehmen.mjs vorschlag.json
//
// Übernommen wird ein Werk an einem Haus nur, wenn
//   - auf der Seite der Komponist steht (sonst ist "Faust" Goethe),
//   - mindestens ein Termin gefunden wurde,
//   - es in spielplan-korrekturen.json nicht ausgeschlossen ist.
// Vorher fallen Termine weg, die zur Seite gehören und nicht zum Stück
// (siehe seitenrahmen), und der Tag des Laufs selbst: Kalender auf den
// Seiten zeigen oft das heutige Datum, und bis die Datei live ist, ist
// der Tag ohnehin vorbei.
// Dazu kommen Termine aus Spielzeitheften (ergaenzen in den Korrekturen).
// Was die Durchsicht von Hand ergibt, gehört in spielplan-korrekturen.json,
// nicht in die erzeugte Datei – sonst ist es beim nächsten Lauf weg.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { operas } from '../../src/data/operas.js';
import { operaHouses } from '../../src/data/operaHouses.js';
import { ZUSATZ } from './spielplaene-lesen.mjs';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const KORREKTUREN = JSON.parse(fs.readFileSync(path.join(WURZEL, 'tests/werkzeug/spielplan-korrekturen.json'), 'utf8'));

const werkIds = new Set([...operas, ...ZUSATZ].map(o => o.id));
const hausIds = new Set(operaHouses.map(h => h.id));
const passt = (k, haus, werk) => k.haus === haus && (k.werk === werk || k.werk === '*');

/**
 * Termine, die auf den Seiten vieler Stücke eines Hauses stehen, gehören zur
 * Seite, nicht zum Stück: die Datumsleiste der Bayerischen Staatsoper, das
 * heutige Datum im Kalender des Gärtnerplatztheaters. Gezählt wird je Seite,
 * damit ein Doppelabend wie Cavalleria/Pagliacci auf einer Seite nicht
 * mitzählt. Termine aus Kalenderlisten stehen dort am Titel und bleiben.
 */
export function seitenrahmen(werke) {
    const seiten = new Map();
    for (const w of Object.values(werke || {})) if (w.url && w.ausSeite?.length) seiten.set(w.url, new Set(w.ausSeite));
    const zahl = new Map();
    for (const termine of seiten.values()) for (const t of termine) zahl.set(t, (zahl.get(t) || 0) + 1);
    return new Set([...zahl].filter(([, n]) => n >= 3 && n * 2 >= seiten.size).map(([t]) => t));
}

export function uebernehmen(vorschlag, korrekturen = KORREKTUREN) {
    const zeilen = [];
    const weggelassen = [];
    let stand = '';
    for (const [haus, erg] of Object.entries(vorschlag)) {
        if (!hausIds.has(haus)) continue;
        stand = erg.stand > stand ? erg.stand : stand;
        const rahmen = seitenrahmen(erg.werke);
        for (const [werk, w0] of Object.entries(erg.werke || {})) {
            const w = { ...w0, termine: w0.termine.filter(t => t > (erg.stand || '') && (!rahmen.has(t) || w0.ausListe?.includes(t))) };
            const grund = !werkIds.has(werk) ? 'nicht im Katalog'
                : (korrekturen.ausschliessen || []).find(k => passt(k, haus, werk))?.grund
                ?? (!w.komponistGenannt && !(korrekturen.aufnehmen || []).some(k => passt(k, haus, werk)) ? 'Komponist nicht genannt'
                    : !w.termine.length ? 'keine Termine' : null);
            if (grund) { weggelassen.push({ haus, werk, grund }); continue; }
            const entfernen = new Set((korrekturen.termineEntfernen || []).filter(k => passt(k, haus, werk)).flatMap(k => k.termine));
            const termine = w.termine.filter(t => !entfernen.has(t));
            if (!termine.length) { weggelassen.push({ haus, werk, grund: 'alle Termine entfernt' }); continue; }
            const url = (korrekturen.adressen || []).find(k => passt(k, haus, werk))?.url || w.url || erg.start?.[0];
            zeilen.push({ werk, haus, url, termine });
        }
    }
    // Termine aus Quellen, die das Werkzeug nicht lesen kann – Spielzeithefte
    // von Häusern, die Programme aussperren (Karlsruhe, Basel). Sie kommen zu
    // dem hinzu, was der Lauf gefunden hat, und veralten von selbst: es zählen
    // nur Termine nach dem Stand und in der Spielzeit.
    const bis = stand ? `${Number(stand.slice(0, 4)) + 1}-09-30` : '9999';
    for (const e of korrekturen.ergaenzen || []) {
        if (!werkIds.has(e.werk) || !hausIds.has(e.haus)) { weggelassen.push({ haus: e.haus, werk: e.werk, grund: 'nicht im Katalog' }); continue; }
        const termine = e.termine.filter(t => t > stand && t <= bis);
        if (!termine.length) continue;
        const da = zeilen.find(z => z.haus === e.haus && z.werk === e.werk);
        if (da) da.termine = [...new Set([...da.termine, ...termine])].sort();
        else zeilen.push({ werk: e.werk, haus: e.haus, url: e.url, termine: [...termine].sort() });
    }
    zeilen.sort((a, b) => a.werk.localeCompare(b.werk) || a.haus.localeCompare(b.haus));
    return { zeilen, weggelassen, stand };
}

export function alsModul({ zeilen, stand }) {
    const kopf = fs.readFileSync(path.join(WURZEL, 'src/data/spielplan.js'), 'utf8').split('export const SPIELPLAN_STAND')[0];
    const eintraege = zeilen.map(z => `    { werk: '${z.werk}', haus: '${z.haus}', url: ${JSON.stringify(z.url)},\n      termine: [${z.termine.map(t => `'${t}'`).join(', ')}] },`).join('\n');
    return `${kopf}export const SPIELPLAN_STAND = '${stand}';\n\nexport const spielplan = [\n${eintraege}\n];\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const vorschlag = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    const erg = uebernehmen(vorschlag);
    fs.writeFileSync(path.join(WURZEL, 'src/data/spielplan.js'), alsModul(erg));
    const haeuser = new Set(erg.zeilen.map(z => z.haus));
    console.log(`${erg.zeilen.length} Einträge an ${haeuser.size} Häusern übernommen, ${erg.zeilen.reduce((s, z) => s + z.termine.length, 0)} Termine.`);
    const gruende = {};
    erg.weggelassen.forEach(w => { gruende[w.grund] = (gruende[w.grund] || 0) + 1; });
    console.log('Weggelassen:', gruende);
}
