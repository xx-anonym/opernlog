// Der Versions-Wächter (tests/werkzeug/version-pruefen.mjs) läuft nur bei
// Pushes auf main – ein Fehler in ihm fällt also erst nach dem Merge auf,
// wenn es zu spät ist. Deshalb hier sein Urteil an den Fällen, die es
// gegeben hat oder geben wird.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { urteil, ausgelieferteDateien, versionAus } from '../werkzeug/version-pruefen.mjs';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lies = (datei) => fs.readFileSync(path.join(WURZEL, datei), 'utf8');
const ausgeliefert = ausgelieferteDateien(lies('sw.js'));

test('am 2. geschrieben, am 3. gemergt: die erhöhte Version reicht (#11)', () => {
    // Der Merge hob die Version von 2026.10.31 auf 2026.11.02, der Cache
    // bekam also einen neuen Namen. Der Wächter hielt ihn trotzdem an, weil
    // der Squash-Commit vom 3. war.
    const u = urteil({
        geaendert: ['src/pages/Profile.js', 'src/version.js', 'sw.js'],
        ausgeliefert, vorher: '2026.10.31', jetzt: '2026.11.02', commitTag: '2026.11.03',
    });
    assert.equal(u.ok, true);
    assert.equal(u.grund, 'erhöht');
});

test('vier Commits am 12., Version vom 11., keiner hebt sie: angehalten', () => {
    // Der Fall, der den Wächter veranlasst hat. Er muss weiter auffallen.
    const u = urteil({
        geaendert: ['src/pages/Profile.js'],
        ausgeliefert, vorher: '2026.10.11', jetzt: '2026.10.11', commitTag: '2026.10.12',
    });
    assert.equal(u.ok, false);
    assert.deepEqual(u.betroffen, ['src/pages/Profile.js']);
});

test('zwei Zweige tragen denselben Tag ein: beim zweiten Merge am Folgetag angehalten', () => {
    // Der erste Merge setzte 2026.11.02, der zweite bringt nichts Neues mit –
    // der Cache hieße wie vorher.
    const u = urteil({
        geaendert: ['src/store/supabase.js'],
        ausgeliefert, vorher: '2026.11.02', jetzt: '2026.11.02', commitTag: '2026.11.03',
    });
    assert.equal(u.ok, false);
});

test('mehrere Pushes am selben Tag: die Version muss nicht jedes Mal steigen', () => {
    const u = urteil({
        geaendert: ['src/store/supabase.js'],
        ausgeliefert, vorher: '2026.11.03', jetzt: '2026.11.03', commitTag: '2026.11.03',
    });
    assert.equal(u.ok, true);
    assert.equal(u.grund, 'aktuell');
});

test('nur Tests, README oder Werkzeug geändert: die Version darf stehen', () => {
    const u = urteil({
        geaendert: ['README.md', 'tests/werkzeug/version-pruefen.mjs', '.github/workflows/tests.yml'],
        ausgeliefert, vorher: '2026.11.02', jetzt: '2026.11.02', commitTag: '2026.11.03',
    });
    assert.equal(u.ok, true);
    assert.equal(u.grund, 'nichts ausgeliefert');
});

test('ausgeliefert ist der App-Shell aus sw.js samt sw.js selbst', () => {
    assert.ok(ausgeliefert.has('sw.js'));
    assert.ok(ausgeliefert.has('src/version.js'));
    assert.ok(ausgeliefert.has('src/pages/Profile.js'));
    assert.ok(!ausgeliefert.has('README.md'));
    assert.ok(![...ausgeliefert].some(d => d.startsWith('./') || d === '/'));
});

test('die Version wird aus src/version.js gelesen, ohne Datei leer', () => {
    assert.match(versionAus(lies('src/version.js')), /^\d{4}\.\d{2}\.\d{2}$/);
    assert.equal(versionAus(''), '');
    // Ein Commit ohne version.js gilt damit als "vorher nichts": erhöht.
    const u = urteil({
        geaendert: ['sw.js'], ausgeliefert, vorher: '', jetzt: '2026.01.01', commitTag: '2026.01.05',
    });
    assert.equal(u.ok, true);
});
