// Die Werbeseite (src/components/Landing.js): wann sie kommt, welche Bilder.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { landingZeigen, wandBilder, STOEBERN } from '../../src/components/Landing.js';

const sitzung = (werte = {}) => ({ sessionStorage: { getItem: k => werte[k] ?? null } });

test('nur ohne Konto und solange niemand "Erst mal stöbern" getippt hat', () => {
    assert.equal(landingZeigen({ angemeldet: false, offlineNutzer: false, umgebung: sitzung() }), true);
    assert.equal(landingZeigen({ angemeldet: true, offlineNutzer: false, umgebung: sitzung() }), false);
    assert.equal(landingZeigen({ angemeldet: false, offlineNutzer: true, umgebung: sitzung() }), false);
    assert.equal(landingZeigen({ angemeldet: false, offlineNutzer: false, umgebung: sitzung({ [STOEBERN]: '1' }) }), false);
    const gesperrt = { get sessionStorage() { throw new Error('gesperrt'); } };
    assert.equal(landingZeigen({ angemeldet: false, offlineNutzer: false, umgebung: gesperrt }), true);
});

test('die Wand nimmt nur Vorschaubilder, in der 250er-Fassung', () => {
    const bilder = wandBilder();
    assert.ok(bilder.length >= 10, `${bilder.length} Bilder`);
    for (const b of bilder) assert.match(b, /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/thumb\/.+\/250px-[^/]+$/);
    // Ein Original ohne Vorschaufassung bleibt draußen.
    assert.deepEqual(wandBilder([{ id: 'tosca', image: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Tosca.jpg' }]), []);
});
