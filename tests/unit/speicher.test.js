// Ab wann Admins den Hinweis bekommen, dass der Speicher bei Supabase fast
// voll ist (src/data/speicher.js) – und was darin steht.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { speicherWarnungen, groesse, GRENZEN, WARNEN_AB } from '../../src/data/speicher.js';

test('Grenzen des kostenlosen Plans, gewarnt wird ab 90 %', () => {
    assert.deepEqual(GRENZEN, { dateien: 1e9, datenbank: 500e6 });
    assert.equal(WARNEN_AB, 0.9);
});

test('unter 90 % kein Hinweis', () => {
    assert.deepEqual(speicherWarnungen({ dateien: 899e6, datenbank: 449e6 }), []);
    assert.deepEqual(speicherWarnungen({ dateien: 0, datenbank: 0 }), []);
});

test('ab 90 % Fotospeicher: ein Hinweis mit Anteil und Größen', () => {
    const [w, ...rest] = speicherWarnungen({ dateien: 900e6, datenbank: 15e6 });
    assert.deepEqual(rest, []);
    assert.equal(w.art, 'dateien');
    assert.equal(w.text, 'Fotospeicher zu 90 % voll – 900 MB von 1 GB');
});

test('beide fast voll: zwei Hinweise', () => {
    const texte = speicherWarnungen({ dateien: 1.2e9, datenbank: 461e6 }).map(w => w.text);
    assert.deepEqual(texte, [
        'Fotospeicher zu 120 % voll – 1,2 GB von 1 GB',
        'Datenbank zu 92 % voll – 461 MB von 500 MB',
    ]);
});

test('Größen grob: MB ganz, GB mit einer Stelle', () => {
    assert.equal(groesse(912_345_678), '912 MB');
    assert.equal(groesse(1e9), '1 GB');
    assert.equal(groesse(1_250_000_000), '1,3 GB');
});
