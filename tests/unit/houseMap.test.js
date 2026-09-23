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

test('mit Standort und Umkreis zeigt die Karte nur den Ausschnitt, mit Ring und Kreuz', () => {
    const dresden = { lat: 51.05, lon: 13.74 };
    const gesamt = mitKartenDOM(() => HouseMap());
    const nah = mitKartenDOM(() => HouseMap(['semperoper'], operaHouses, { position: dresden, radiusKm: 100 }));
    const breite = html => Number(html.match(/viewBox="[^ ]+ [^ ]+ ([^ ]+) /)[1]);
    assert.ok(breite(nah.innerHTML) < breite(gesamt.innerHTML) / 3, 'kein Ausschnitt');
    assert.match(nah.innerHTML, /housemap__svg--ausschnitt/);
    assert.match(nah.innerHTML, /class="housemap__umkreis"/);
    assert.match(nah.innerHTML, /class="housemap__standort"/);
    assert.doesNotMatch(gesamt.innerHTML, /housemap__umkreis|housemap__standort/);
});

test('Texte und Punkte lassen sich für andere Seiten anpassen', () => {
    const karte = mitKartenDOM(() => HouseMap(['semperoper'], operaHouses, {
        legende: ['mit Abenden', 'ohne'],
        zaehler: n => `${n} Haus mit Abenden`,
        punktText: h => `${h.name} · 3 Abende`,
    }));
    assert.match(karte.innerHTML, /1 Haus mit Abenden/);
    assert.match(karte.innerHTML, /mit Abenden/);
    assert.match(karte.innerHTML, /<title>Semperoper · 3 Abende<\/title>/);
});
