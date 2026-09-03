// Prüft, ob jede Bildadresse im Katalog tatsächlich etwas liefert.
//
// Nicht als Test unter tests/: die Prüfung braucht Netz und dauert. Sie läuft
// in einem eigenen Arbeitsablauf (.github/workflows/bilder-pruefen.yml), weil
// die Adressen von außen kommen und dort unabhängig von diesem Projekt
// verschwinden oder umbenannt werden können.
//
// Aufruf:  node tests/werkzeug/bilder-pruefen.mjs [--json]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DATEIEN = ['src/data/operas.js', 'src/data/operaHouses.js'];
const GLEICHZEITIG = 8;

function adressen() {
    const gefunden = [];
    for (const datei of DATEIEN) {
        const text = fs.readFileSync(path.join(WURZEL, datei), 'utf8');
        const zeilen = text.split('\n');
        zeilen.forEach((zeile, i) => {
            const id = (zeile.match(/id: '([^']+)'/) || [])[1] || '?';
            for (const m of zeile.matchAll(/(?:image|imageUrl): '(https?:[^']+)'/g)) {
                gefunden.push({ datei, zeile: i + 1, id, url: m[1] });
            }
        });
    }
    return gefunden;
}

async function pruefe(eintrag) {
    // HEAD reicht und lädt keine Megabytes. Wikimedia antwortet darauf sauber.
    try {
        const antwort = await fetch(eintrag.url, {
            method: 'HEAD',
            redirect: 'follow',
            headers: { 'User-Agent': 'OpernLog-Bildpruefung/1.0 (https://opernlog.vercel.app)' },
            signal: AbortSignal.timeout(20000),
        });
        return { ...eintrag, status: antwort.status, ok: antwort.ok };
    } catch (e) {
        return { ...eintrag, status: 0, ok: false, fehler: String(e.message || e).slice(0, 80) };
    }
}

const alle = adressen();
const ergebnisse = [];

// In Häppchen, damit Wikimedia nicht 175 Anfragen auf einmal bekommt.
for (let i = 0; i < alle.length; i += GLEICHZEITIG) {
    ergebnisse.push(...await Promise.all(alle.slice(i, i + GLEICHZEITIG).map(pruefe)));
}

const kaputt = ergebnisse.filter(e => !e.ok);

if (process.argv.includes('--json')) {
    console.log(JSON.stringify(kaputt, null, 2));
} else {
    console.log(`${alle.length} Bildadressen geprüft, ${kaputt.length} ohne Antwort.\n`);
    for (const e of kaputt) {
        console.log(`  ${e.datei}:${e.zeile}  ${e.id}`);
        console.log(`    HTTP ${e.status}${e.fehler ? ` – ${e.fehler}` : ''}`);
        console.log(`    ${e.url}\n`);
    }
}

process.exit(kaputt.length ? 1 : 0);
