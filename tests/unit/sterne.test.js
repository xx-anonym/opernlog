// sterneText – fünf Sterne als Text, auch bei Unsinn aus der Datenbank.
//
// '☆'.repeat() wirft bei einer negativen Zahl. Bevor die Datenbank die Note
// prüfte, legte eine einzige Note über 5 so den ganzen Freunde-Feed lahm.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sterneText } from '../../src/utils.js';

test('ganze und halbe Noten', () => {
    assert.equal(sterneText(4), '★★★★☆');
    assert.equal(sterneText(5), '★★★★★');
    assert.equal(sterneText(3.5), '★★★★☆', 'halbe Sterne runden auf, wie vorher im Feed');
    assert.equal(sterneText('4.0'), '★★★★☆', 'DECIMAL kommt auch als Zeichenkette');
});

test('außerhalb von 0 bis 5 wird begrenzt statt geworfen', () => {
    assert.equal(sterneText(9.9), '★★★★★');
    assert.equal(sterneText(-9.9), '☆☆☆☆☆');
});

test('keine Note ergibt fünf leere Sterne', () => {
    for (const leer of [null, undefined, '', 'Quatsch', NaN]) {
        assert.equal(sterneText(leer), '☆☆☆☆☆', String(leer));
    }
});
