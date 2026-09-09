// Das Monogramm auf der Komponistenseite – für die, von denen es kein freies
// Porträt gibt.
//
// Die Stolperstelle sind die Namenszusätze: "Carl Maria von Weber" darf nicht
// CMV ergeben und "Johann Strauss II" nicht JSI. Geprüft wird gegen die echten
// Namen aus dem Katalog, nicht gegen erfundene.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { initialen } from '../../src/pages/ComposerDetail.js';
import { composers } from '../../src/data/composers.js';

test('drei Namen ergeben drei Buchstaben', () => {
    assert.equal(initialen('Bernd Alois Zimmermann'), 'BAZ');
    assert.equal(initialen('Wolfgang Amadeus Mozart'), 'WAM');
});

test('zwei Namen ergeben zwei Buchstaben', () => {
    assert.equal(initialen('Giuseppe Verdi'), 'GV');
    assert.equal(initialen('Richard Wagner'), 'RW');
});

test('kleingeschriebene Namenszusätze zählen nicht mit', () => {
    // Sonst stünde bei Weber ein V für "von" im Monogramm.
    assert.equal(initialen('Carl Maria von Weber'), 'CMW');
    assert.equal(initialen('Ludwig van Beethoven'), 'LB');
});

test('Ordnungszahlen zählen nicht mit', () => {
    // "II" fängt groß an, die Regel für Zusätze greift hier also nicht.
    assert.equal(initialen('Johann Strauss II'), 'JS');
});

test('mehr als drei Namen werden nach dem dritten abgeschnitten', () => {
    assert.equal(initialen('Ein Zwei Drei Vier Fünf'), 'EZD');
});

test('Bindestrichnamen zählen als zwei', () => {
    assert.equal(initialen('François-Xavier Roth'), 'FXR');
});

test('ohne Namen kommt nichts zurück', () => {
    assert.equal(initialen(''), '');
    assert.equal(initialen(), '');
    assert.equal(initialen(null), '');
});

test('jeder Komponist ohne Porträt bekommt ein brauchbares Monogramm', () => {
    // Ein leeres Monogramm wäre schlimmer als der Verlauf: die Kachel sähe
    // dann wirklich kaputt aus.
    for (const c of composers.filter(c => !c.bild)) {
        const m = initialen(c.name);
        assert.match(m, /^[A-ZÄÖÜÀ-Þ]{2,3}$/, `${c.id}: unbrauchbares Monogramm "${m}"`);
    }
});
