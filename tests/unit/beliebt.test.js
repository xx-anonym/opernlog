// Welche Werke das Willkommen zeigt: die meistgespielten der Spielzeit.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { beliebteWerke } from '../../src/data/beliebt.js';

const katalog = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, title: id.toUpperCase() }));
const zeile = (werk, haus, n = 1) => ({ werk, haus, termine: Array.from({ length: n }, (_, i) => `2027-01-${String(i + 1).padStart(2, '0')}`) });

test('nach der Zahl der Häuser, dann der Termine, dann nach dem Katalog', () => {
    const daten = [
        zeile('c', 'h1'), zeile('c', 'h2'), zeile('c', 'h3'),       // 3 Häuser
        zeile('a', 'h1', 9),                                         // 1 Haus, 9 Termine
        zeile('d', 'h1', 2), zeile('d', 'h2', 2),                    // 2 Häuser, 4 Termine
        zeile('b', 'h1', 5), zeile('b', 'h2', 1),                    // 2 Häuser, 6 Termine
        zeile('e', 'h1', 9),                                         // wie a – a steht im Katalog davor
    ];
    assert.deepEqual(beliebteWerke(10, { daten, katalog }).map(w => w.id), ['c', 'b', 'd', 'a', 'e']);
});

test('ein Haus zählt je Werk nur einmal', () => {
    // Zwei Zeilen desselben Hauses sind ein Haus – sonst gewönne, wer doppelt im Spielplan steht.
    const daten = [zeile('a', 'h1'), zeile('a', 'h1'), zeile('b', 'h1'), zeile('b', 'h2')];
    assert.deepEqual(beliebteWerke(10, { daten, katalog }).map(w => w.id), ['b', 'a']);
});

test('nur Werke aus dem Katalog, höchstens so viele wie verlangt', () => {
    const daten = [zeile('fremd', 'h1'), zeile('fremd', 'h2'), zeile('a', 'h1'), zeile('b', 'h1'), zeile('c', 'h1')];
    assert.deepEqual(beliebteWerke(2, { daten, katalog }).map(w => w.id), ['a', 'b']);
    assert.deepEqual(beliebteWerke(2, { daten: [], katalog }), []);
});

test('aus dem echten Spielplan kommen 24 verschiedene Werke mit Titel', () => {
    const werke = beliebteWerke();
    assert.equal(werke.length, 24);
    assert.equal(new Set(werke.map(w => w.id)).size, 24);
    assert.ok(werke.every(w => w.title && w.composer));
});
