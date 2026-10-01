// Bildnachweise (src/data/bildnachweisRegeln.js, src/data/bildnachweise.js):
// aus der Bildadresse die Datei auf Commons, aus dem HTML von Commons eine
// kurze Zeile – und für jedes Katalogbild ein Eintrag.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { dateinameAus, urheberText, nachweisZeile } from '../../src/data/bildnachweisRegeln.js';
import { BILDNACHWEISE } from '../../src/data/bildnachweise.js';
import { operas } from '../../src/data/operas.js';
import { operaHouses } from '../../src/data/operaHouses.js';

test('Dateiname aus der Adresse: verkleinert, Original, kodiert; fremde Adressen nicht', () => {
    assert.equal(dateinameAus('https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Jean-Michel_Moreau_illustration_Candide_Voltaire_%C3%A9dition_de_Kehl_1787.jpg/500px-Jean-Michel_Moreau_illustration_Candide_Voltaire_%C3%A9dition_de_Kehl_1787.jpg'),
        'Jean-Michel_Moreau_illustration_Candide_Voltaire_édition_de_Kehl_1787.jpg');
    assert.equal(dateinameAus('https://upload.wikimedia.org/wikipedia/commons/a/aa/Bild%20mit%20Leerzeichen.jpg?x=1'), 'Bild_mit_Leerzeichen.jpg');
    assert.equal(dateinameAus('https://upload.wikimedia.org/wikipedia/el/thumb/6/64/Umschlag.jpg/500px-Umschlag.jpg'), null);
    assert.equal(dateinameAus(''), null);
});

test('Urheber: ohne Markup, ohne versteckte Wiederholung, ohne "Photo:", unbekannt kurz', () => {
    assert.equal(urheberText('<a href="//commons.wikimedia.org/wiki/User:X">Christian Michelides</a>'), 'Christian Michelides');
    assert.equal(urheberText('Unknown author<span style="display: none;">Unknown author</span>'), 'unbekannt');
    assert.equal(urheberText('Erika Muster<span style="display:none">Erika Muster</span>'), 'Erika Muster');
    assert.equal(urheberText('Photo: Andreas Praefcke'), 'Andreas Praefcke');
    assert.equal(urheberText('Emil Stumpp (* 17. März 1886 in Neckarzimmern)'), 'Emil Stumpp');
    assert.equal(urheberText(''), 'unbekannt');
    assert.equal(urheberText('x'.repeat(120)).length, 80);
});

test('die Zeile: Urheber und Lizenz, ohne unbekannten Urheber', () => {
    assert.equal(nachweisZeile({ urheber: 'Christian Michelides', lizenz: 'CC BY-SA 4.0' }), 'Bild: Christian Michelides · CC BY-SA 4.0');
    assert.equal(nachweisZeile({ urheber: 'unbekannt', lizenz: 'CC BY 3.0' }), 'Bild: CC BY 3.0');
});

// Kommt ein Bild in den Katalog, braucht es seinen Nachweis: dann
// tests/werkzeug/bildnachweise-holen.mjs laufen lassen.
test('jedes Bild im Katalog hat einen Nachweis', () => {
    const fehlt = [...operas.map(o => [o.id, o.image]), ...operaHouses.map(h => [h.id, h.imageUrl])]
        .filter(([, u]) => u && !BILDNACHWEISE[dateinameAus(u)])
        .map(([id]) => id);
    assert.deepEqual(fehlt, [], `ohne Nachweis: ${fehlt.join(', ')} – node tests/werkzeug/bildnachweise-holen.mjs`);
    for (const n of Object.values(BILDNACHWEISE)) {
        assert.ok(n.lizenz && n.seite?.startsWith('https://commons.wikimedia.org/wiki/File:'), JSON.stringify(n));
    }
});
