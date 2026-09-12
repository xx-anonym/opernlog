// visitedHouseList – Gegenstück zu seenOperaList für die Kachel "Häuser besucht".

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { visitedHouseList, besuchteIds } from '../../src/data/visitedHouses.js';
import { operaHouses } from '../../src/data/operaHouses.js';

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

// ── besuchteIds ──────────────────────────────────────────────────────────
//
// Dieselbe Definition, nur als Menge von Ids: die Form, die der Filter im
// Hauskatalog und die Karte der eigenen Abdeckung brauchen. Sie baut auf
// visitedHouseList auf, statt die Regel zu wiederholen – sonst zeigte die
// Karte einen Punkt, den die Liste nicht führt.

const [HAUS_A, HAUS_B] = operaHouses.slice(0, 2).map(h => h.id);

test('besuchteIds nennt jedes geloggte Haus', () => {
    assert.deepEqual([...besuchteIds([besuch(HAUS_A), besuch(HAUS_B)])].sort(), [HAUS_A, HAUS_B].sort());
});

test('mehrere Abende im selben Haus ergeben eine Id', () => {
    assert.deepEqual([...besuchteIds([besuch(HAUS_A), besuch(HAUS_A), besuch(HAUS_A)])], [HAUS_A]);
});

test('ohne Besuche ist die Menge leer', () => {
    assert.equal(besuchteIds([]).size, 0);
    assert.equal(besuchteIds().size, 0);
});

test('Ids, die der Katalog nicht kennt, fallen heraus', () => {
    assert.equal(besuchteIds([besuch('gibt-es-nicht')]).size, 0);
});

test('besuchteIds und visitedHouseList sagen dasselbe', () => {
    const besuche = [besuch(HAUS_A), besuch(HAUS_A), besuch(HAUS_B)];
    assert.deepEqual(
        [...besuchteIds(besuche)].sort(),
        visitedHouseList(besuche).map(e => e.house.id).sort());
});
