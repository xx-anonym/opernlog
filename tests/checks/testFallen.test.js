// Fallen in den Browser-Tests selbst.
//
// Ein ElementHandle darf nie mit einem Wert verglichen werden:
//
//     assert.equal(await p.$('.fenster'), null)
//
// Solange das Element fehlt, geht das gut. Ist es da, scheitert die
// Zusicherung – und Node schreibt für die Meldung das ganze Handle aus, samt
// Seite, Browser und Verbindung. Am 9.11.2026 wuchs ein Testprozess dabei auf
// über 150 GB und legte den Rechner lahm. Stattdessen einen Wahrheitswert
// vergleichen: !!(await p.$(…)) oder p.$$eval(…, es => es.length > 0).
// assert.ok(await p.$(…)) ist ungefährlich: scheitert es, ist der Wert null.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ORDNER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../browser');
export const HANDLE_VERGLICHEN = /assert\.(equal|strictEqual|deepEqual|deepStrictEqual|notEqual|notStrictEqual)\(\s*await\s+[\w.]+\.\$\(/;

test('kein Browser-Test vergleicht ein ElementHandle mit einem Wert', () => {
    const funde = [];
    for (const datei of fs.readdirSync(ORDNER).filter(d => d.endsWith('.test.js'))) {
        fs.readFileSync(path.join(ORDNER, datei), 'utf8').split('\n').forEach((zeile, i) => {
            if (HANDLE_VERGLICHEN.test(zeile)) funde.push(`${datei}:${i + 1}`);
        });
    }
    assert.deepEqual(funde, []);
});

test('das Muster erkennt die Falle und lässt das Ungefährliche durch', () => {
    assert.ok(HANDLE_VERGLICHEN.test("assert.equal(await p.$('.auth-page'), null);"));
    assert.ok(HANDLE_VERGLICHEN.test("assert.strictEqual(await seite.$('#x'), null, 'da');"));
    assert.ok(!HANDLE_VERGLICHEN.test("assert.ok(await p.$('.main-nav'), 'fehlt');"));
    assert.ok(!HANDLE_VERGLICHEN.test("assert.equal(!!(await p.$('.auth-page')), false);"));
    assert.ok(!HANDLE_VERGLICHEN.test("assert.equal(await p.$eval('.x', e => e.textContent), 'a');"));
});
