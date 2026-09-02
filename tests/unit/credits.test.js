// visitCredits – die einzige Stelle, die beide Schreibweisen kennt.
//
// Besuche kommen aus der Cloud in snake_case und aus dem lokalen Speicher in
// camelCase. Genau diese Doppelung hat dafür gesorgt, dass die Mitwirkenden
// auf drei von vier Seiten fehlten.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { visitCredits } from '../../src/utils.js';

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
