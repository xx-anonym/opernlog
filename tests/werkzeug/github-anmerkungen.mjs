// Ein zusätzlicher Berichter für node --test: jeder gescheiterte Test als
// Anmerkung am Lauf auf GitHub (::error …), mit Datei, Zeile, Name und
// Fehlermeldung.
//
// Das Protokoll eines Laufs lässt sich nur angemeldet lesen, die Anmerkungen
// auch ohne (über die Schnittstelle der Check-Runs). Vorher stand dort nur
// "Process completed with exit code 1", und welcher Test gewackelt hatte,
// musste Jonas per Screenshot aus dem Protokoll holen.
//
// Eingebunden in .github/workflows/tests.yml neben dem üblichen Bericht:
//   node --test --test-reporter=spec --test-reporter-destination=stdout \
//     --test-reporter=./tests/werkzeug/github-anmerkungen.mjs --test-reporter-destination=stdout …
// Geprüft von tests/checks/githubAnmerkungen.test.js.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

// So viele Zeilen der Fehlermeldung; bei einem Vergleich stehen dort Soll und
// Ist, bei Playwright das Protokoll des Wartens.
const ZEILEN = 20;

/** Für den Text hinter "::": nur %, CR und LF sind besonders. */
const text = s => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

/** Für Eigenschaften wie title=…: zusätzlich : und , */
const eigenschaft = s => text(s).replace(/:/g, '%3A').replace(/,/g, '%2C');

function datei(ort) {
    if (!ort) return null;
    const absolut = ort.startsWith('file:') ? fileURLToPath(ort) : ort;
    return path.relative(process.cwd(), absolut).split(path.sep).join('/');
}

export default async function* githubAnmerkungen(quelle) {
    for await (const ereignis of quelle) {
        if (ereignis.type !== 'test:fail') continue;
        const { name, details, file, line } = ereignis.data;
        // Eine Gruppe scheitert, weil ein Test darin scheitert – der hat
        // schon seine eigene Anmerkung.
        if (details?.type === 'suite') continue;

        const fehler = details?.error?.cause ?? details?.error;
        const meldung = String(fehler?.message ?? fehler ?? 'unbekannter Fehler')
            .split('\n').slice(0, ZEILEN).join('\n');
        const ort = datei(file);
        const eigenschaften = [
            ort && `file=${eigenschaft(ort)}`,
            ort && line && `line=${line}`,
            `title=${eigenschaft(name)}`,
        ].filter(Boolean).join(',');
        yield `::error ${eigenschaften}::${text(meldung)}\n`;
    }
}
