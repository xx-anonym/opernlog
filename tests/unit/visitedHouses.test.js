// visitedHouseList – Gegenstück zu seenOperaList für die Kachel "Häuser besucht".

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { visitedHouseList } from '../../src/data/visitedHouses.js';

const besuch = (houseId, date = '2025-09-01') => ({ houseId, operaId: 'zauberflote', date });

test('ohne Besuche ist die Liste leer', () => {
    assert.deepEqual(visitedHouseList([]), []);
    assert.deepEqual(visitedHouseList(), []);
});

test('zählt die Abende je Haus', () => {
    const liste = visitedHouseList([
        besuch('bayerische-staatsoper'),
        besuch('bayerische-staatsoper', '2025-10-01'),
        besuch('gaertnerplatztheater'),
    ]);
    const nach = Object.fromEntries(liste.map(e => [e.house.id, e.besuche]));
    assert.deepEqual(nach, { 'bayerische-staatsoper': 2, gaertnerplatztheater: 1 });
});

test('Häuser, die der Katalog nicht kennt, fallen heraus', () => {
    assert.deepEqual(visitedHouseList([besuch('gibt-es-nicht')]), []);
});

test('alphabetisch nach Hausname', () => {
    const liste = visitedHouseList([besuch('gaertnerplatztheater'), besuch('bayerische-staatsoper')]);
    assert.deepEqual(liste.map(e => e.house.id), ['bayerische-staatsoper', 'gaertnerplatztheater']);
});
