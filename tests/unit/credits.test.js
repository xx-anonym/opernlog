// visitCredits – die einzige Stelle, die beide Schreibweisen kennt.
//
// Besuche kommen aus der Cloud in snake_case und aus dem lokalen Speicher in
// camelCase. Genau diese Doppelung hat dafür gesorgt, dass die Mitwirkenden
// auf drei von vier Seiten fehlten.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { visitCredits, besetzungKurz, BESETZUNG_EINKLAPPEN_AB } from '../../src/utils.js';

test('camelCase aus dem lokalen Speicher', () => {
    const c = visitCredits({ conductor: 'Kirill Petrenko', director: 'Barrie Kosky', castList: 'Diana Damrau' });
    assert.equal(c.conductor, 'Kirill Petrenko');
    assert.equal(c.director, 'Barrie Kosky');
    assert.equal(c.castList, 'Diana Damrau');
    assert.equal(c.any, true);
});

test('snake_case aus der Cloud', () => {
    const c = visitCredits({ conductor: 'Simone Young', cast_list: 'Jonas Kaufmann' });
    assert.equal(c.castList, 'Jonas Kaufmann');
    assert.equal(c.any, true);
});

test('camelCase gewinnt, wenn beide dastehen', () => {
    const c = visitCredits({ castList: 'aktuell', cast_list: 'alt' });
    assert.equal(c.castList, 'aktuell');
});

test('alle drei Felder dürfen leer bleiben', () => {
    const c = visitCredits({});
    assert.deepEqual(c, { conductor: '', director: '', castList: '', any: false });
    assert.equal(visitCredits().any, false);
});

test('Leerzeichen allein sind keine Angabe', () => {
    const c = visitCredits({ conductor: '   ', director: '\n', castList: '' });
    assert.equal(c.any, false);
    assert.equal(c.conductor, '');
});

test('ein einziges gefülltes Feld genügt für any', () => {
    assert.equal(visitCredits({ director: 'Christof Loy' }).any, true);
    assert.equal(visitCredits({ cast_list: 'Ensemble' }).any, true);
});

test('null und undefined werden nicht zu den Wörtern "null" und "undefined"', () => {
    const c = visitCredits({ conductor: null, director: undefined, cast_list: null });
    assert.equal(c.conductor, '');
    assert.equal(c.director, '');
    assert.equal(c.castList, '');
    assert.equal(c.any, false);
});

// ── besetzungKurz – die eingeklappte Besetzung in der Karte ──────────────

const SECHS = [
    'Ben Bliss (Herzog von Mantua)',
    'Simon Keenlyside (Rigoletto)',
    'Elena Villalón (Gilda)',
    'Alexander Tsymbalyuk (Sparafucile)',
    'Anna Kissjudit (Maddalena)',
    'Rebecka Wallroth (Giovanna)',
].join('\n');

test('die Kurzfassung nennt zwei Namen ohne Rolle und zählt den Rest', () => {
    const b = besetzungKurz(SECHS);
    assert.equal(b.kurz, 'Ben Bliss, Simon Keenlyside und 4 weitere');
    assert.equal(b.zeilen.length, 6);
    assert.equal(b.einklappen, true);
});

test('bei genau einer weiteren Person steht kein "1 weitere"', () => {
    assert.equal(besetzungKurz('A (x)\nB (y)\nC (z)').kurz, 'A, B und eine weitere Person');
});

test('eingeklappt wird erst ab drei Zeilen', () => {
    // Zwei Zeilen nehmen kaum mehr Platz ein als die Kurzfassung selbst.
    assert.equal(BESETZUNG_EINKLAPPEN_AB, 3);
    assert.equal(besetzungKurz('A\nB').einklappen, false);
    assert.equal(besetzungKurz('A').einklappen, false);
    assert.equal(besetzungKurz('A\nB\nC').einklappen, true);
});

test('Leerzeilen zählen nicht mit', () => {
    // Sonst klappte eine zweizeilige Besetzung mit einer leeren Zeile am Ende
    // ein, und die Kurzfassung zählte "und eine weitere Person", die es nicht gibt.
    const b = besetzungKurz('A\n\n   \nB\n');
    assert.deepEqual(b.zeilen, ['A', 'B']);
    assert.equal(b.einklappen, false);
});

test('nur eine Rolle am Zeilenende fällt weg', () => {
    assert.equal(besetzungKurz('Chor (Extrachor) der Staatsoper\nB\nC').kurz,
        'Chor (Extrachor) der Staatsoper, B und eine weitere Person');
    // Besteht die Zeile nur aus einer Klammer, bleibt sie stehen statt leer.
    assert.equal(besetzungKurz('(Kinderchor)\nB\nC').kurz, '(Kinderchor), B und eine weitere Person');
});

test('keine Besetzung ergibt nichts', () => {
    assert.deepEqual(besetzungKurz(''), { zeilen: [], kurz: '', einklappen: false });
    assert.deepEqual(besetzungKurz(null), { zeilen: [], kurz: '', einklappen: false });
});
