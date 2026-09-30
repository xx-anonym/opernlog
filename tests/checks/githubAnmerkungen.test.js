// Der Berichter tests/werkzeug/github-anmerkungen.mjs macht aus jedem
// gescheiterten Test eine Anmerkung am Lauf auf GitHub. Geprüft an einer
// Probe mit einem Test, der gelingt, und einem, der scheitert: genau eine
// Anmerkung, mit Datei, Zeile und Namen, und die Sonderzeichen so kodiert,
// dass GitHub die Zeile nicht zerschneidet.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PROBE = 'tests/werkzeug/anmerkungen-probe.mjs';

function lauf() {
    // Ohne NODE_TEST_CONTEXT: diese Prüfung läuft selbst unter node --test,
    // und mit der geerbten Variable hielte sich der innere Lauf für einen
    // Teil davon und schriebe keinen Bericht.
    const { NODE_TEST_CONTEXT, ...umgebung } = process.env;
    const ergebnis = spawnSync(process.execPath, [
        '--test', '--test-reporter=./tests/werkzeug/github-anmerkungen.mjs', '--test-reporter-destination=stdout', PROBE,
    ], { cwd: WURZEL, encoding: 'utf8', env: umgebung });
    return { code: ergebnis.status, zeilen: ergebnis.stdout.split('\n').filter(Boolean) };
}

test('ein gescheiterter Test wird zu genau einer Anmerkung mit Ort und Namen', () => {
    const { code, zeilen } = lauf();
    assert.notEqual(code, 0, 'die Probe soll scheitern');
    assert.equal(zeilen.length, 1, `erwartet eine Zeile, bekommen:\n${zeilen.join('\n')}`);
    const zeile = zeilen[0];
    const probeZeile = fs.readFileSync(path.join(WURZEL, PROBE), 'utf8').split('\n')
        .findIndex(z => z.startsWith("test('scheitert")) + 1;
    assert.match(zeile, new RegExp(String.raw`^::error file=tests/werkzeug/anmerkungen-probe\.mjs,line=${probeZeile},title=`));
    // Doppelpunkt und Komma im Namen trennten sonst die Eigenschaften.
    assert.match(zeile, /title=scheitert%3A mit Komma%2C Doppelpunkt und 100 %25::/);
});

test('die Fehlermeldung steht mehrzeilig, aber in einer Zeile kodiert', () => {
    const [zeile] = lauf().zeilen;
    const meldung = zeile.split('::').slice(2).join('::');
    assert.match(meldung, /Expected values to be strictly equal/);
    assert.match(meldung, /%0A/, 'Zeilenumbrüche als %0A');
    assert.match(meldung, /erste Zeile/);
});
