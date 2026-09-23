// Macht aus einem durchgesehenen Lauf von spielplaene-lesen.mjs die Datei
// src/data/spielplan.js.
//
//   node tests/werkzeug/spielplan-uebernehmen.mjs vorschlag.json
//   node tests/werkzeug/spielplan-uebernehmen.mjs nachtrag.json --dazu
//
// Mit --dazu (nach einem Lauf mit --werke) ändern sich nur die Einträge der
// gesuchten Werke; alles andere in src/data/spielplan.js bleibt, wie es ist.
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
// Zuletzt entstehen die Kalenderdateien unter kalender/ neu
// (kalender-dateien.mjs).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { operas } from '../../src/data/operas.js';
import { operaHouses } from '../../src/data/operaHouses.js';
import { kalenderOrdnerSchreiben } from './kalender-dateien.mjs';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const KORREKTUREN = JSON.parse(fs.readFileSync(path.join(WURZEL, 'tests/werkzeug/spielplan-korrekturen.json'), 'utf8'));

const ausRepo = new Set(operas.map(o => o.id));
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
    // Katalog: operas.js und die Werke aus der Datenbank, die der Lauf kannte.
    const werkIds = new Set([...ausRepo, ...(vorschlag._werke || []).map(w => w.id)]);
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
            zeilen.push(mitZeiten({ werk, haus, url, termine }, w.zeiten));
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
        if (da) {
            // Was die Seite sagt, geht vor; das Heft füllt Lücken.
            const zusammen = mitZeiten({ ...da, termine: [...new Set([...da.termine, ...termine])].sort() }, { ...(e.zeiten || {}), ...(da.zeiten || {}) });
            zeilen[zeilen.indexOf(da)] = zusammen;
        } else {
            zeilen.push(mitZeiten({ werk: e.werk, haus: e.haus, url: e.url, termine: [...termine].sort() }, e.zeiten));
        }
    }
    zeilen.sort((a, b) => a.werk.localeCompare(b.werk) || a.haus.localeCompare(b.haus));
    return { zeilen, weggelassen, stand, zusatzwerke: zusatzwerke(zeilen) };
}

// Die Zeile mit den Zeiten ihrer Termine, soweit gültig – ohne leeres Feld.
const ZEIT = /^([01]\d|2[0-3]):[0-5]\d(-([01]\d|2[0-3]):[0-5]\d)?$/;
function mitZeiten(zeile, zeiten = {}) {
    const { zeiten: _alt, ...ohne } = zeile;
    const aus = {};
    for (const t of zeile.termine) if (ZEIT.test(zeiten?.[t] || '')) aus[t] = zeiten[t];
    return Object.keys(aus).length ? { ...ohne, zeiten: aus } : ohne;
}

// Werke aus der Datenbank, die in den Zeilen vorkommen – damit die Prüfung
// ohne Netz weiß, dass es sie gibt.
const zusatzwerke = zeilen => [...new Set(zeilen.map(z => z.werk).filter(w => !ausRepo.has(w)))].sort();

/**
 * Ein Nachtrag für einzelne Werke (Lauf mit --werke): deren Einträge
 * ersetzen, alle anderen behalten. Der Stand bleibt der ältere – er sagt,
 * wie alt die Daten höchstens sind.
 */
export function dazunehmen(bestehend, nachtrag, suche) {
    const gesucht = new Set(suche);
    const zeilen = [...bestehend.zeilen.filter(z => !gesucht.has(z.werk)), ...nachtrag.zeilen.filter(z => gesucht.has(z.werk))];
    zeilen.sort((a, b) => a.werk.localeCompare(b.werk) || a.haus.localeCompare(b.haus));
    const stand = [bestehend.stand, nachtrag.stand].filter(Boolean).sort()[0] || '';
    return { zeilen, stand, zusatzwerke: zusatzwerke(zeilen) };
}

export function alsModul({ zeilen, stand, zusatzwerke = [] }) {
    const kopf = fs.readFileSync(path.join(WURZEL, 'src/data/spielplan.js'), 'utf8').split('export const SPIELPLAN_STAND')[0];
    const zeitenText = z => {
        const paare = Object.entries(z.zeiten || {});
        return paare.length ? `,\n      zeiten: { ${paare.map(([t, h]) => `'${t}': '${h}'`).join(', ')} }` : '';
    };
    const eintraege = zeilen.map(z => `    { werk: '${z.werk}', haus: '${z.haus}', url: ${JSON.stringify(z.url)},\n      termine: [${z.termine.map(t => `'${t}'`).join(', ')}]${zeitenText(z)} },`).join('\n');
    return `${kopf}export const SPIELPLAN_STAND = '${stand}';\n\n`
        + `// Werke aus der Datenbank (vom Admin angelegt), die nicht in operas.js stehen.\n`
        + `export const SPIELPLAN_ZUSATZWERKE = [${zusatzwerke.map(w => `'${w}'`).join(', ')}];\n\n`
        + `export const spielplan = [\n${eintraege}\n];\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const vorschlag = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
    let erg = uebernehmen(vorschlag);
    if (process.argv.includes('--dazu')) {
        if (!vorschlag._suche?.length) { console.error('--dazu braucht einen Lauf mit --werke'); process.exit(1); }
        const alt = await import(pathToFileURL(path.join(WURZEL, 'src/data/spielplan.js')).href);
        erg = { ...dazunehmen({ zeilen: alt.spielplan, stand: alt.SPIELPLAN_STAND }, erg, vorschlag._suche), weggelassen: erg.weggelassen };
        console.log(`Nachtrag für ${vorschlag._suche.join(', ')}.`);
    }
    fs.writeFileSync(path.join(WURZEL, 'src/data/spielplan.js'), alsModul(erg));
    console.log(`${kalenderOrdnerSchreiben(erg.zeilen, erg.stand)} Kalenderdateien in kalender/.`);
    const haeuser = new Set(erg.zeilen.map(z => z.haus));
    console.log(`${erg.zeilen.length} Einträge an ${haeuser.size} Häusern übernommen, ${erg.zeilen.reduce((s, z) => s + z.termine.length, 0)} Termine.`);
    const gruende = {};
    erg.weggelassen.forEach(w => { gruende[w.grund] = (gruende[w.grund] || 0) + 1; });
    console.log('Weggelassen:', gruende);
}
