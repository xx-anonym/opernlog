// Bildausschnitte: aus der Datenbank an den Katalog, von dort ins style-Attribut.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bildPosition, coverBackground } from '../../src/utils.js';
import { uebernehmen, ausschnittSetzen } from '../../src/data/katalogZusatz.js';
import { operas } from '../../src/data/operas.js';
import { operaHouses } from '../../src/data/operaHouses.js';

test('ohne Ausschnitt bleibt es die Mitte', () => {
    assert.equal(bildPosition(undefined), 'center');
    assert.equal(bildPosition(null), 'center');
    assert.match(coverBackground('https://upload.wikimedia.org/x.jpg', 'none'), /background-position: center;/);
});

test('der Ausschnitt wird zu Prozentwerten für background-position', () => {
    assert.equal(bildPosition({ x: 20, y: 75.25 }), '20% 75.3%');
    assert.match(coverBackground('https://upload.wikimedia.org/x.jpg', 'none', undefined, { x: 10, y: 90 }), /background-position: 10% 90%;/);
});

test('Werte aus der Datenbank landen nur als Zahlen im style-Attribut', () => {
    // Die Datenbank prüft 0 bis 100 selbst – aber was im style-Attribut
    // landet, soll auch dann harmlos sein, wenn dort einmal etwas anderes
    // stünde.
    assert.equal(bildPosition({ x: '50%; background: url(//boese.example)', y: 20 }), '50% 20%');
    assert.equal(bildPosition({ x: -30, y: 250 }), '0% 100%');
    assert.equal(bildPosition({ x: NaN, y: undefined }), '50% 50%');
});

test('Ausschnitte hängen an Werken und Häusern aus dem Repo, fehlende fallen weg', () => {
    const werk = operas[0];
    const haus = operaHouses[0];
    uebernehmen({ ausschnitte: [
        { art: 'werk', id: werk.id, x: 30, y: 40 },
        { art: 'haus', id: haus.id, x: 70, y: 10 },
    ] });
    assert.deepEqual(werk.bildAusschnitt, { x: 30, y: 40 });
    assert.deepEqual(haus.bildAusschnitt, { x: 70, y: 10 });

    // Auf einem anderen Gerät auf die Mitte zurückgesetzt: die Zeile fehlt.
    uebernehmen({ ausschnitte: [{ art: 'haus', id: haus.id, x: 70, y: 10 }] });
    assert.equal(werk.bildAusschnitt, undefined);
    assert.deepEqual(haus.bildAusschnitt, { x: 70, y: 10 });

    // Ein Stand ohne Ausschnitte (von vor der Tabelle, oder das Holen ist
    // gescheitert) lässt alles, wie es ist.
    uebernehmen({});
    assert.deepEqual(haus.bildAusschnitt, { x: 70, y: 10 });

    uebernehmen({ ausschnitte: [] });
    assert.equal(haus.bildAusschnitt, undefined);
});

test('ein Werk aus der Datenbank behält seinen Ausschnitt, wenn es neu gemischt wird', () => {
    const zeile = { id: 'test-werk-ausschnitt', title: 'Testwerk', composer: 'Giacomo Puccini', year_composed: 1900,
        language: 'Italienisch', acts: 1, genre: 'Oper', librettist: 'X', description: 'Y', image: 'https://upload.wikimedia.org/y.jpg' };
    const ausschnitte = [{ art: 'werk', id: 'test-werk-ausschnitt', x: 12, y: 34 }];
    uebernehmen({ werke: [zeile], ausschnitte });
    uebernehmen({ werke: [zeile], ausschnitte });
    const werk = operas.find(o => o.id === 'test-werk-ausschnitt');
    assert.deepEqual(werk.bildAusschnitt, { x: 12, y: 34 });
    operas.splice(operas.indexOf(werk), 1);
});

test('nach dem Speichern gilt der neue Ausschnitt sofort, null setzt zurück', () => {
    const werk = operas[1];
    ausschnittSetzen('werk', werk.id, { x: 5, y: 95 });
    assert.deepEqual(werk.bildAusschnitt, { x: 5, y: 95 });
    ausschnittSetzen('werk', werk.id, null);
    assert.equal(werk.bildAusschnitt, undefined);
    assert.throws(() => ausschnittSetzen('werk', 'gibt-es-nicht', { x: 1, y: 1 }), /Unbekannter Eintrag/);
});
