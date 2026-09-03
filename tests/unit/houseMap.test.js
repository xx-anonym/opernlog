// Die Karte ist eine kleine DOM-Komponente; für ihre Filterlogik genügt ein
// minimales Element-Double. So bleibt der wichtigste Teil auch ohne Browser
// als schneller Unit-Test ausführbar.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { HouseMap } from '../../src/components/HouseMap.js';
import { operaHouses } from '../../src/data/operaHouses.js';

function mitKartenDOM(aktion) {
    const vorherigesDokument = globalThis.document;
    globalThis.document = {
        createElement: () => ({
            className: '',
            innerHTML: '',
            querySelector: () => ({ textContent: '' }),
            addEventListener: () => {},
        }),
    };

    try {
        return aktion();
    } finally {
        globalThis.document = vorherigesDokument;
    }
}

test('HouseMap zeichnet nur die übergebenen Häuser und zählt sie passend', () => {
    const rheinlandPfalz = operaHouses.filter(h => h.state === 'Rheinland-Pfalz');

    const karte = mitKartenDOM(() => HouseMap([], rheinlandPfalz));
    const punkte = karte.innerHTML.match(/class="housemap__dot/g) || [];
    const ids = [...karte.innerHTML.matchAll(/data-house-id="([^"]+)"/g)].map(([, id]) => id).sort();

    assert.equal(punkte.length, rheinlandPfalz.length);
    assert.match(karte.innerHTML, new RegExp(`0 von ${rheinlandPfalz.length}`));
    assert.deepEqual(ids, rheinlandPfalz.map(h => h.id).sort());
});

test('HouseMap zeigt ohne Auswahl weiterhin den gesamten Katalog', () => {
    const karte = mitKartenDOM(() => HouseMap());
    const punkte = karte.innerHTML.match(/class="housemap__dot/g) || [];

    assert.equal(punkte.length, operaHouses.length);
});
