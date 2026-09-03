// Lieblingskomponist und meistbesuchtes Haus.
//
// Beides stand vorher zweimal im Code – einmal für das eigene, einmal für
// fremde Profile. Hier wird das gemeinsame Modul geprüft.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { topHouse, topComposer } from '../../src/data/favorites.js';

const besuch = (o) => ({ houseId: 'semperoper', operaId: 'zauberflote', date: '2025-09-01', ...o });

test('ohne Besuche gibt es keinen Favoriten', () => {
    assert.equal(topHouse([]), null);
    assert.equal(topComposer([]), null);
    assert.equal(topHouse(), null);
    assert.equal(topComposer(), null);
});

test('das meistbesuchte Haus kommt samt Objekt zurück, nicht nur als Name', () => {
    // Der Name allein reichte für den Link auf das Haus nicht – genau deshalb
    // gibt es dieses Modul.
    const t = topHouse([
        besuch({ houseId: 'semperoper' }),
        besuch({ houseId: 'semperoper' }),
        besuch({ houseId: 'bayerische-staatsoper' }),
    ]);
    assert.equal(t.house.id, 'semperoper');
    assert.equal(t.house.name, 'Semperoper');
    assert.equal(t.besuche, 2);
});

test('bei Gleichstand entscheidet der Name, nicht die Reihenfolge der Besuche', () => {
    // Sonst wechselte die Anzeige, je nachdem wie die Besuche geladen wurden.
    const a = topHouse([besuch({ houseId: 'semperoper' }), besuch({ houseId: 'bayerische-staatsoper' })]);
    const b = topHouse([besuch({ houseId: 'bayerische-staatsoper' }), besuch({ houseId: 'semperoper' })]);
    assert.equal(a.house.id, b.house.id);
    assert.equal(a.house.id, 'bayerische-staatsoper', 'B vor S');
});

test('beide Schreibweisen der Besuche werden verstanden', () => {
    // Aus der Cloud kommen sie in snake_case, aus dem lokalen Speicher in
    // camelCase – dieselbe Doppelung wie bei den Mitwirkenden.
    const t = topHouse([{ house_id: 'semperoper' }, { house_id: 'semperoper' }, { houseId: 'staatsoper-berlin' }]);
    assert.equal(t.house.id, 'semperoper');
    assert.equal(t.besuche, 2);

    const k = topComposer([{ opera_id: 'la-traviata' }, { operaId: 'rigoletto' }]);
    assert.equal(k.composer, 'Giuseppe Verdi');
    assert.equal(k.abende, 2);
});

test('Häuser, die der Katalog nicht kennt, werden nicht zum Favoriten', () => {
    // Sie ließen sich weder benennen noch verlinken.
    const t = topHouse([besuch({ houseId: 'gibt-es-nicht' }), besuch({ houseId: 'gibt-es-nicht' }),
        besuch({ houseId: 'semperoper' })]);
    assert.equal(t.house.id, 'semperoper');
});

test('Besuche ohne Haus stürzen nicht ab', () => {
    assert.equal(topHouse([{ date: '2025-09-01' }, null]), null);
});

test('der Lieblingskomponist ist der mit den meisten Abenden', () => {
    const k = topComposer([
        besuch({ operaId: 'la-traviata' }),      // Verdi
        besuch({ operaId: 'rigoletto' }),        // Verdi
        besuch({ operaId: 'zauberflote' }),      // Mozart
    ]);
    assert.equal(k.composer, 'Giuseppe Verdi');
    assert.equal(k.abende, 2);
});

test('bei gleich vielen Abenden gewinnt die bessere Bewertung', () => {
    const k = topComposer([
        besuch({ operaId: 'la-traviata', rating: 2 }),
        besuch({ operaId: 'zauberflote', rating: 5 }),
    ]);
    assert.equal(k.composer, 'Wolfgang Amadeus Mozart');
    assert.equal(k.schnitt, 5);
});

test('unbewertete Abende ziehen den Schnitt nicht auf null', () => {
    const k = topComposer([besuch({ operaId: 'la-traviata', rating: 4 }), besuch({ operaId: 'rigoletto' })]);
    assert.equal(k.abende, 2);
    assert.equal(k.schnitt, 4);
});
