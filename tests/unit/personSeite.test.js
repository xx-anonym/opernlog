// Kleinigkeiten der Personenseite (src/pages/PersonDetail.js): Initialen für
// den Kreis ohne Bild, Sterne ohne leere.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { initialen, sterneKurz, alsText } from '../../src/pages/PersonDetail.js';

test('Initialen: erster und letzter Name, Großbuchstaben, auch mit Umlaut', () => {
    assert.equal(initialen('Bartlett Sher'), 'BS');
    assert.equal(initialen('anna netrebko'), 'AN');
    assert.equal(initialen('Yi-Chen Lin'), 'YL');
    assert.equal(initialen('Ölga'), 'Ö');
    assert.equal(initialen(''), '?');
});

test('Sterne: volle und ein halber, nichts bei keiner Note', () => {
    assert.equal(sterneKurz(4.5), '★★★★½');
    assert.equal(sterneKurz(5), '★★★★★');
    assert.equal(sterneKurz(0), '');
    assert.equal(sterneKurz(7), '★★★★★');
    assert.equal(sterneKurz(null), '');
});

test('was jemand an einem Abend war', () => {
    assert.equal(alsText(['Rigoletto', 'Dirigat']), 'Rigoletto · am Pult');
    assert.equal(alsText(['Regie']), 'Regie');
});
