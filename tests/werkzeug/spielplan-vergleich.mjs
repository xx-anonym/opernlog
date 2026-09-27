// Vergleicht einen Lauf von spielplaene-lesen.mjs mit dem, was in der App
// steht (src/data/spielplan.js), und schreibt auf, was sich geändert hat.
//
//   node tests/werkzeug/spielplan-vergleich.mjs lauf.json [bericht.md] [uebernahme.json]
//
// Gedacht für den monatlichen Lauf (.github/workflows/spielplan-monatlich.yml):
// zwischen dem großen Lauf im September und dem im Januar veralten die
// Termine – Zusatzvorstellungen, Umbesetzungen, verschobene Premieren. Der
// Lauf liest alle Häuser, dieses Werkzeug macht daraus einen Bericht fürs
// Issue. Übernommen wird nichts von selbst: jede Änderung geht vorher durch
// die Durchsicht von Hand, wie bei jedem Lauf.
//
// Verglichen wird mit dem, was die App nach der Übernahme zeigte: der Lauf
// durch uebernehmen() (mit den Korrekturen) und dazunehmen() für die
// gelesenen Häuser – so bleiben etwa Uhrzeiten, die der Lauf nur verpasst
// hat. Vergangene Termine zählen nicht: dass der Oktober im November fehlt,
// ist keine Änderung.
//
// Ein Haus, dessen Seiten sich gar nicht laden ließen (gesperrt, Ausfall),
// gilt als nicht gelesen. Seine Einträge bleiben, wie sie sind, und es steht
// nicht in uebernahme.json – sonst verschwände es beim Übernehmen.
//
// uebernahme.json ist der Lauf, beschränkt auf die gelesenen Häuser mit
// Änderungen. Ausgenommen sind Häuser, bei denen Seiten nicht luden und
// Einträge oder Termine wegfielen: dort ist "weg" eher ein Ladefehler als
// ein Befund (Theater Kiel, September 2026). Die stehen im Bericht zum
// erneuten Lesen. Übernehmen mit
//   node tests/werkzeug/spielplan-uebernehmen.mjs uebernahme.json --dazu
// ersetzt dann genau deren Einträge.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { operas } from '../../src/data/operas.js';
import { operaHouses } from '../../src/data/operaHouses.js';
import { uebernehmen, dazunehmen } from './spielplan-uebernehmen.mjs';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// GitHub nimmt höchstens 65 536 Zeichen je Issue; Luft für die Fußzeile.
const HOECHSTLAENGE = 60000;

/** Ließ sich wenigstens eine Seite des Hauses laden? */
export function gelesen(eintrag) {
    return (eintrag?.besucht || []).some(b => b.status >= 200 && b.status < 400);
}

const schluessel = z => `${z.werk}|${z.haus}`;

/**
 * @param {{werk, haus, url, termine, zeiten?}[]} alt  was in der App steht
 * @param {{werk, haus, url, termine, zeiten?}[]} neu  was nach der Übernahme stünde
 * @param {object} o
 * @param {string} o.heute  Tag des Laufs; nur spätere Termine zählen
 * @returns {{neu: object[], weg: object[], geaendert: object[], uhrzeiten: object[]}}
 *          geaendert: Termine dazu oder entfallen; uhrzeiten: nur Uhrzeiten anders
 */
export function vergleichen(alt, neu, { heute }) {
    const kuenftig = z => ({ ...z, termine: z.termine.filter(t => t > heute) });
    const nachSchluessel = zeilen => new Map(zeilen.map(kuenftig).filter(z => z.termine.length).map(z => [schluessel(z), z]));
    const vorher = nachSchluessel(alt);
    const nachher = nachSchluessel(neu);

    const ergebnis = { neu: [], weg: [], geaendert: [], uhrzeiten: [] };

    for (const [k, z] of nachher) {
        if (!vorher.has(k)) ergebnis.neu.push(z);
    }
    for (const [k, z] of vorher) {
        const danach = nachher.get(k);
        if (!danach) {
            ergebnis.weg.push(z);
            continue;
        }
        const dazu = danach.termine.filter(t => !z.termine.includes(t));
        const entfallen = z.termine.filter(t => !danach.termine.includes(t));
        const zeiten = danach.termine
            .filter(t => z.termine.includes(t) && (z.zeiten?.[t] || '') !== (danach.zeiten?.[t] || ''))
            .map(t => ({ termin: t, vorher: z.zeiten?.[t] || '', nachher: danach.zeiten?.[t] || '' }));
        if (dazu.length || entfallen.length) ergebnis.geaendert.push({ ...danach, dazu, entfallen, zeiten });
        else if (zeiten.length) ergebnis.uhrzeiten.push({ ...danach, dazu, entfallen, zeiten });
    }
    const ordnen = (a, b) => a.werk.localeCompare(b.werk) || a.haus.localeCompare(b.haus);
    for (const liste of Object.values(ergebnis)) liste.sort(ordnen);
    return ergebnis;
}

/** 2026-11-12 -> 12.11.2026 */
const datum = t => `${t.slice(8, 10)}.${t.slice(5, 7)}.${t.slice(0, 4)}`;
const mitZeit = (t, zeiten) => (zeiten?.[t] ? `${datum(t)} (${zeiten[t]})` : datum(t));

/**
 * Der Bericht in Markdown, fürs Issue.
 * @param {object} namen  werk(id) und haus(id) → Anzeigename
 */
export function bericht(v, { heute, stand, namen, fehlerJeHaus = {}, nichtGelesen = [], fuss = '' }) {
    const titel = z => `**${namen.werk(z.werk)}** – ${namen.haus(z.haus)}`;
    const link = z => (z.url ? ` · [Seite](${z.url})` : '');
    const ladefehler = z => (fehlerJeHaus[z.haus] ? ` · _${fehlerJeHaus[z.haus]} Seiten des Hauses ließen sich nicht laden_` : '');
    const teile = [
        `Lauf vom ${datum(heute)}, verglichen mit dem Stand in der App (${datum(stand)}). Vergangene Termine zählen nicht.`,
        '',
        `**${zusammenfassung(v)}**`,
    ];
    if (v.neu.length) {
        teile.push('', '### Neu im Spielplan', '');
        for (const z of v.neu) teile.push(`- ${titel(z)}: ${z.termine.map(t => mitZeit(t, z.zeiten)).join(', ')}${link(z)}`);
    }
    const aenderung = z => [
        ...z.dazu.map(t => `+${mitZeit(t, z.zeiten)}`),
        ...z.entfallen.map(t => `−${datum(t)}`),
        ...z.zeiten.map(({ termin, vorher, nachher }) => `${datum(termin)}: ${vorher || 'ohne Uhrzeit'} → ${nachher}`),
    ].join(', ');
    if (v.geaendert.length) {
        teile.push('', '### Termine geändert', '');
        for (const z of v.geaendert) teile.push(`- ${titel(z)}: ${aenderung(z)}${link(z)}${z.entfallen.length ? ladefehler(z) : ''}`);
    }
    if (v.weg.length) {
        teile.push('', '### Nicht mehr gefunden', '');
        for (const z of v.weg) teile.push(`- ${titel(z)}: ${z.termine.map(datum).join(', ')}${link(z)}${ladefehler(z)}`);
    }
    if (v.uhrzeiten.length) {
        teile.push('', '### Nur Uhrzeiten', '');
        for (const z of v.uhrzeiten) teile.push(`- ${titel(z)}: ${aenderung(z)}`);
    }
    if (nichtGelesen.length) {
        teile.push('', '### Nicht gelesen', '',
            `Von diesen Häusern ließ sich keine Seite laden. Ihre Einträge bleiben, wie sie sind: ${nichtGelesen.map(namen.haus).join(', ')}.`);
    }
    let text = teile.join('\n');
    if (text.length > HOECHSTLAENGE) {
        text = `${text.slice(0, HOECHSTLAENGE).replace(/\n[^\n]*$/, '')}\n\n_… gekürzt. Der ganze Bericht liegt als bericht.md im Artefakt des Laufs._`;
    }
    return fuss ? `${text}\n\n${fuss}` : text;
}

export function zusammenfassung(v) {
    const teile = [];
    const zahl = (n, eins, mehr) => `${n} ${n === 1 ? eins : mehr}`;
    if (v.neu.length) teile.push(zahl(v.neu.length, 'Produktion neu', 'Produktionen neu'));
    if (v.geaendert.length) teile.push(zahl(v.geaendert.length, 'mit geänderten Terminen', 'mit geänderten Terminen'));
    if (v.weg.length) teile.push(zahl(v.weg.length, 'nicht mehr gefunden', 'nicht mehr gefunden'));
    if (v.uhrzeiten.length) teile.push(zahl(v.uhrzeiten.length, 'nur mit anderen Uhrzeiten', 'nur mit anderen Uhrzeiten'));
    return teile.length ? teile.join(', ') : 'Keine Änderungen';
}

/** Die Häuser, deren Einträge sich ändern würden – nur gelesene. */
export function geaenderteHaeuser(v) {
    return [...new Set([...v.neu, ...v.weg, ...v.geaendert, ...v.uhrzeiten].map(z => z.haus))].sort();
}

/** Häuser mit Ladefehlern, bei denen etwas wegfiele – nicht übernehmen, neu lesen. */
export function unsichereHaeuser(v, fehlerJeHaus) {
    const verlieren = [...v.weg, ...v.geaendert.filter(z => z.entfallen.length)].map(z => z.haus);
    return [...new Set(verlieren)].filter(h => fehlerJeHaus[h]).sort();
}

/** Der Lauf, beschränkt auf diese Häuser, bereit für uebernehmen … --dazu. */
export function uebernahmeLauf(lauf, haeuser) {
    const nur = Object.fromEntries(haeuser.filter(h => lauf[h]).map(h => [h, lauf[h]]));
    return { _werke: lauf._werke || [], _haeuserKatalog: lauf._haeuserKatalog || [], _haeuser: haeuser, ...nur };
}

async function main() {
    const [laufDatei, berichtDatei = 'bericht.md', uebernahmeDatei = 'uebernahme.json'] = process.argv.slice(2);
    if (!laufDatei) { console.error('Aufruf: spielplan-vergleich.mjs lauf.json [bericht.md] [uebernahme.json]'); process.exit(1); }
    const lauf = JSON.parse(fs.readFileSync(laufDatei, 'utf8'));
    const live = await import(pathToFileURL(path.join(WURZEL, 'src/data/spielplan.js')).href);

    const haeuser = Object.keys(lauf).filter(k => !k.startsWith('_'));
    const lesbar = new Set(haeuser.filter(h => gelesen(lauf[h])));
    const heute = haeuser.map(h => lauf[h].stand).filter(Boolean).sort().at(-1) || new Date().toISOString().slice(0, 10);
    const nachtrag = uebernehmen(lauf);
    const nachher = dazunehmen({ zeilen: live.spielplan, stand: live.SPIELPLAN_STAND }, nachtrag, { haeuser: [...lesbar] });
    const v = vergleichen(live.spielplan, nachher.zeilen, { heute });
    const nichtGelesen = [...new Set(live.spielplan.filter(z => !lesbar.has(z.haus) && z.termine.some(t => t > heute)).map(z => z.haus))].sort();

    const werkNamen = new Map([...operas.map(o => [o.id, o.title]), ...(lauf._werke || []).map(w => [w.id, w.title])]);
    const hausNamen = new Map([...operaHouses.map(h => [h.id, h.name]), ...(lauf._haeuserKatalog || []).map(h => [h.id, h.name])]);
    const namen = { werk: id => werkNamen.get(id) || id, haus: id => hausNamen.get(id) || id };
    const fehlerJeHaus = Object.fromEntries(haeuser.filter(h => lauf[h].fehler?.length).map(h => [h, lauf[h].fehler.length]));

    const unsicher = unsichereHaeuser(v, fehlerJeHaus);
    const aenderungen = geaenderteHaeuser(v).filter(h => !unsicher.includes(h));
    const lauflink = process.env.GITHUB_RUN_ID
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null;
    const uebernahme = aenderungen.length ? [
        'Vor dem Übernehmen jede Zeile gegen ihre Seite prüfen – der Lauf schlägt vor, er entscheidet nicht. '
            + 'Was nicht stimmt, gehört in `tests/werkzeug/spielplan-korrekturen.json`. '
            + `Dann das Artefakt „spielplan-lauf“ ${lauflink ? `von der [Seite des Laufs](${lauflink}) ` : ''}laden, nach \`lauf/\` entpacken und:`,
        '```',
        'node tests/werkzeug/spielplan-uebernehmen.mjs lauf/uebernahme.json --dazu',
        '```',
        `Das ersetzt nur die Einträge ${aenderungen.length === 1 ? 'dieses einen Hauses' : `dieser ${aenderungen.length} Häuser`}; alle anderen bleiben unberührt.`,
    ] : [];
    const neuLesen = unsicher.length ? [
        `Nicht in der Übernahme, weil Seiten nicht luden und dabei etwas wegfiele: ${unsicher.map(namen.haus).join(', ')}. `
            + 'Einzeln neu lesen und das Ergebnis prüfen:',
        '```',
        `node tests/werkzeug/spielplaene-lesen.mjs nachlese.json ${unsicher.join(' ')}`,
        'node tests/werkzeug/spielplan-uebernehmen.mjs nachlese.json --dazu',
        '```',
    ] : [];
    const fuss = [
        ...(uebernahme.length || neuLesen.length ? ['---'] : []),
        uebernahme.join('\n'),
        neuLesen.join('\n'),
        lauflink ? `<sub>Automatisch erstellt von \`.github/workflows/spielplan-monatlich.yml\` – [Lauf](${lauflink}).</sub>` : '',
    ].filter(Boolean).join('\n\n');

    fs.writeFileSync(berichtDatei, bericht(v, { heute, stand: live.SPIELPLAN_STAND, namen, fehlerJeHaus, nichtGelesen, fuss }));
    fs.writeFileSync(uebernahmeDatei, JSON.stringify(uebernahmeLauf(lauf, aenderungen), null, 1));

    const anzahl = v.neu.length + v.weg.length + v.geaendert.length + v.uhrzeiten.length;
    console.log(`${zusammenfassung(v)}. ${lesbar.size} von ${haeuser.length} Häusern gelesen.`);
    if (process.env.GITHUB_OUTPUT) {
        fs.appendFileSync(process.env.GITHUB_OUTPUT,
            `anzahl=${anzahl}\nzusammenfassung=${zusammenfassung(v)}\ngelesen=${lesbar.size}\nhaeuser=${haeuser.length}\n`);
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    await main();
}
