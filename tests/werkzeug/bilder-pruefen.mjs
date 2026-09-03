// Prüft, ob jede Bildadresse im Katalog tatsächlich etwas liefert.
//
// Nicht als Test unter tests/unit oder tests/checks: die Prüfung braucht Netz
// und dauert. Sie läuft in einem eigenen Arbeitsablauf, weil die Adressen von
// außen kommen und dort umbenannt oder gelöscht werden können, ohne dass hier
// jemand etwas davon merkt. In der App bleibt die Kachel dann beim farbigen
// Verlauf – das sieht nicht kaputt aus und fällt deshalb niemandem auf.
//
// Aufruf:  node tests/werkzeug/bilder-pruefen.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { holen } from './commons.mjs';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DATEIEN = ['src/data/operas.js', 'src/data/operaHouses.js'];

function adressen() {
    const gefunden = [];
    for (const datei of DATEIEN) {
        fs.readFileSync(path.join(WURZEL, datei), 'utf8').split('\n').forEach((zeile, i) => {
            const id = (zeile.match(/id: '([^']+)'/) || [])[1] || '?';
            for (const m of zeile.matchAll(/(?:image|imageUrl): '(https?:[^']+)'/g)) {
                gefunden.push({ datei, zeile: i + 1, id, url: m[1] });
            }
        });
    }
    return gefunden;
}

const alle = adressen();
const kaputt = [];

// Nacheinander, nicht gleichzeitig: holen() hält den Abstand ein, und
// parallele Anfragen würden ihn nur umgehen.
for (const eintrag of alle) {
    const { status, ok, fehler } = await holen(eintrag.url);
    if (!ok) kaputt.push({ ...eintrag, status, fehler });
}

console.log(`${alle.length} Bildadressen geprüft, ${kaputt.length} ohne Antwort.\n`);
for (const e of kaputt) {
    console.log(`  ${e.datei}:${e.zeile}  ${e.id}`);
    console.log(`    HTTP ${e.status}${e.fehler ? ` – ${e.fehler}` : ''}`);
    console.log(`    ${e.url}\n`);
}

process.exit(kaputt.length ? 1 : 0);
