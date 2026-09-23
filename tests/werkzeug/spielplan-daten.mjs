// Der Spielplan als JSON für die Datenbank: daten/spielplan.json.
//
//   node tests/werkzeug/spielplan-daten.mjs
//
// Die Mitteilungen zur Wunschliste entstehen in der Datenbank
// (supabase/migrations/spielplan_mitteilungen_migration.sql). Sie holt sich
// jeden Morgen diese Datei von der Website und vergleicht sie mit dem Stand,
// den sie schon kennt. Titel, Haus und Stadt stehen mit drin, weil die
// Datenbank operas.js und operaHouses.js nicht kennt.
//
// spielplan-uebernehmen.mjs ruft das selbst auf. tests/checks/spielplanDaten.test.js
// merkt, wenn die Datei nicht mehr zu src/data/spielplan.js passt.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { operas } from '../../src/data/operas.js';
import { operaHouses } from '../../src/data/operaHouses.js';
import { zusatzWerkeFuer } from './datenbank-werke.mjs';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const DATEN_DATEI = path.join(WURZEL, 'daten/spielplan.json');

/** Der Inhalt der Datei. Werke, deren Titel niemand kennt, fehlen. */
export function spielplanDaten(zeilen, stand, zusatz = []) {
    const werke = [...operas, ...zusatz];
    const eintraege = [];
    for (const z of zeilen) {
        const werk = werke.find(o => o.id === z.werk);
        const haus = operaHouses.find(h => h.id === z.haus);
        if (!werk || !haus) continue;
        eintraege.push({ werk: z.werk, titel: werk.title, haus: z.haus, hausName: haus.name, stadt: haus.city, termine: z.termine });
    }
    return { stand, eintraege };
}

/** Eine Zeile je Eintrag – damit ein Lauf im Diff lesbar bleibt. */
export function alsText(daten) {
    return `{"stand":${JSON.stringify(daten.stand)},"eintraege":[\n`
        + daten.eintraege.map(e => JSON.stringify(e)).join(',\n')
        + '\n]}\n';
}

export async function spielplanDatenSchreiben(zeilen, stand) {
    const daten = spielplanDaten(zeilen, stand, await zusatzWerkeFuer(zeilen));
    fs.mkdirSync(path.dirname(DATEN_DATEI), { recursive: true });
    fs.writeFileSync(DATEN_DATEI, alsText(daten));
    return daten.eintraege.length;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const { spielplan, SPIELPLAN_STAND } = await import(pathToFileURL(path.join(WURZEL, 'src/data/spielplan.js')).href);
    console.log(`${await spielplanDatenSchreiben(spielplan, SPIELPLAN_STAND)} Einträge in daten/spielplan.json.`);
}
