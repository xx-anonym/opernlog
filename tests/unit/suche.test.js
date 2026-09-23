// Suche ohne Rücksicht auf Umlaute und Akzente, und "heute" in Ortszeit.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { passtZurSuche, heuteIso } from '../../src/utils.js';

test('Umlaute weggelassen oder umschrieben: beides findet', () => {
    for (const anfrage of ['zauberflote', 'Zauberfloete', 'ZAUBERFLÖTE', 'flöte']) {
        assert.ok(passtZurSuche(anfrage, 'Die Zauberflöte'), anfrage);
    }
    assert.ok(passtZurSuche('zurich', 'Opernhaus Zürich'));
    assert.ok(passtZurSuche('koln', 'Oper Köln'));
    assert.ok(passtZurSuche('haensel', 'Hänsel und Gretel'));
    assert.ok(passtZurSuche('Duesseldorf', 'Düsseldorf'));
});

test('ß wie ss, Akzente egal', () => {
    assert.ok(passtZurSuche('strauss', 'Richard Strauß'));
    assert.ok(passtZurSuche('Strauß', 'Richard Strauss'));
    assert.ok(passtZurSuche('dvorak', 'Antonín Dvořák'));
    assert.ok(passtZurSuche('opera de lausanne', 'Opéra de Lausanne'));
});

test('jedes Feld zählt, leere Felder stören nicht', () => {
    assert.ok(passtZurSuche('puccini', 'Tosca', 'Giacomo Puccini'));
    assert.ok(passtZurSuche('tosca', null, undefined, '', 'Tosca'));
    assert.ok(!passtZurSuche('verdi', 'Tosca', 'Giacomo Puccini'));
});

test('eine leere Anfrage passt immer', () => {
    assert.ok(passtZurSuche('', 'Tosca'));
    assert.ok(passtZurSuche('   ', 'Tosca'));
    assert.ok(passtZurSuche(undefined, 'Tosca'));
});

test('was nicht drinsteht, passt auch umschrieben nicht', () => {
    assert.ok(!passtZurSuche('zauberfloete', 'Die Zauberharfe'));
    assert.ok(!passtZurSuche('ue', 'Tosca'));
});

test('heute ist der Tag in Ortszeit, nicht in UTC', () => {
    // Die Zeitzone fest auf Berlin, sonst prüft der Test in einer UTC-Umgebung
    // (wie der CI) gar nichts: dort sind Ortszeit und UTC dasselbe.
    const vorher = process.env.TZ;
    process.env.TZ = 'Europe/Berlin';
    try {
        // 0:30 Uhr am 24. in Berlin (Sommerzeit) ist in UTC noch der 23.
        const kurzNachMitternacht = new Date('2026-09-23T22:30:00Z');
        assert.equal(heuteIso(kurzNachMitternacht), '2026-09-24');
        assert.equal(heuteIso(new Date('2026-01-05T22:59:00Z')), '2026-01-05');
    } finally {
        if (vorher === undefined) delete process.env.TZ; else process.env.TZ = vorher;
    }
});
