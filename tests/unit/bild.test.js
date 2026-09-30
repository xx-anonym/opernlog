import { test } from 'node:test';
import assert from 'node:assert/strict';

import { zielGroesse, HOECHSTENS } from '../../src/bild.js';

test('die längere Seite wird auf 1600 Pixel gebracht, das Seitenverhältnis bleibt', () => {
    assert.equal(HOECHSTENS, 1600);
    assert.deepEqual(zielGroesse(4032, 3024), { breite: 1600, hoehe: 1200 });
    assert.deepEqual(zielGroesse(3024, 4032), { breite: 1200, hoehe: 1600 });
});

test('kleine Bilder werden nicht vergrößert', () => {
    assert.deepEqual(zielGroesse(800, 600), { breite: 800, hoehe: 600 });
});

test('auch ein extrem schmales Bild behält mindestens einen Pixel', () => {
    assert.deepEqual(zielGroesse(20000, 3), { breite: 1600, hoehe: 1 });
});
