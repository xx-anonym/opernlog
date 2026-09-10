// Der Name einer Edge Function steht an zwei Stellen: im Aufruf in src/ und als
// Verzeichnisname unter supabase/functions/.
//
// Laufen die auseinander, merkt es niemand. Der Leak-Abgleich lässt bei einem
// Ausfall bewusst durch – ein Tippfehler im Namen sähe für den Nutzer also
// genauso aus wie ein guter Tag: die Registrierung geht durch, nur eben
// ungeprüft. Kein Fehler, keine Meldung, kein Schutz.
//
// Deshalb wird der Name hier zusammengehalten.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FUNKTIONEN = path.join(WURZEL, 'supabase/functions');

/** Alle .js-Dateien unter src/, relativ zur Wurzel. */
function quellDateien(verzeichnis = 'src') {
    return fs.readdirSync(path.join(WURZEL, verzeichnis), { withFileTypes: true })
        .flatMap(e => e.isDirectory()
            ? quellDateien(path.posix.join(verzeichnis, e.name))
            : (e.name.endsWith('.js') ? [path.posix.join(verzeichnis, e.name)] : []));
}

/** Jeder functions.invoke('…')-Aufruf in src/, mit Fundstelle. */
function aufrufe() {
    return quellDateien().flatMap(datei => {
        const text = fs.readFileSync(path.join(WURZEL, datei), 'utf8');
        return [...text.matchAll(/functions\.invoke\(\s*'([^']+)'/g)]
            .map(m => ({ name: m[1], datei }));
    });
}

test('jede aufgerufene Edge Function liegt auch im Projekt', () => {
    const gefunden = aufrufe();
    assert.ok(gefunden.length > 0,
        'kein einziger functions.invoke-Aufruf gefunden – prüft dieser Test noch, was er soll?');

    const fehlend = gefunden.filter(a =>
        !fs.existsSync(path.join(FUNKTIONEN, a.name, 'index.ts')));

    assert.deepEqual(fehlend, [],
        'Diese Edge Functions werden aufgerufen, liegen aber nicht unter '
        + `supabase/functions/:\n  ${fehlend.map(a => `${a.name} (aus ${a.datei})`).join('\n  ')}`);
});

test('der Passwort-Abgleich nimmt serverseitig nur ein fünfstelliges Präfix an', () => {
    // Die ganze Begründung, warum der Abgleich stattfinden darf, hängt daran:
    // aus fünf Zeichen eines SHA-1 lässt sich kein Passwort rekonstruieren.
    // Nähme die Funktion mehr entgegen, läge irgendwann der volle Hash auf
    // einem fremden Rechner – und ohne diese Prüfung wäre sie zusätzlich ein
    // offener Weiterleiter zu HaveIBeenPwned.
    const quelle = fs.readFileSync(path.join(FUNKTIONEN, 'passwort-pruefen/index.ts'), 'utf8');
    const muster = quelle.match(/const PRAEFIX = \/([^/]+)\/;/);
    assert.ok(muster, 'PRAEFIX-Muster nicht gefunden');

    const regex = new RegExp(muster[1]);
    assert.ok(regex.test('5BAA6'), 'ein gültiges Präfix wird abgelehnt');
    assert.ok(!regex.test('5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8'), 'der volle Hash käme durch');
    assert.ok(!regex.test('5BAA6X'), 'sechs Zeichen kämen durch');
    assert.ok(!regex.test('5baa6'), 'Kleinschreibung käme durch');
    assert.ok(!regex.test('../../etc'), 'ein Pfad käme durch');

    assert.match(quelle, /Add-Padding/,
        'ohne Polsterung verrät schon die Länge der Antwort die Zahl der Treffer');
});
