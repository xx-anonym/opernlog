// Heute vor einem Jahr (src/data/jahrestag.js): eigene Abende, die auf den
// Tag genau Jahre zurückliegen. Der 29. Februar meldet sich in Jahren ohne
// diesen Tag am 28.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { abendeAmJahrestag, jahrestagText, reviewAuszug } from '../../src/data/jahrestag.js';

const tag = (j, m, t) => new Date(j, m - 1, t, 10);
const ids = treffer => treffer.map(x => `${x.visit.id}:${x.jahre}`);

test('nur der genaue Tag, früherer Jahre, der jüngste zuerst', () => {
    const besuche = [
        { id: 'a', date: '2023-10-03' },
        { id: 'b', date: '2025-10-03' },
        { id: 'c', date: '2025-10-04' },
        { id: 'd', date: '2025-10-02' },
        { id: 'e', date: '2026-10-03' },   // heute selbst: kein Jahrestag
        { id: 'f', date: '2025-11-03' },
    ];
    assert.deepEqual(ids(abendeAmJahrestag(besuche, tag(2026, 10, 3))), ['b:1', 'a:3']);
});

test('29. Februar: im Gemeinjahr am 28., im Schaltjahr am 29.', () => {
    const besuche = [{ id: 's', date: '2024-02-29' }, { id: 'n', date: '2023-02-28' }];
    assert.deepEqual(ids(abendeAmJahrestag(besuche, tag(2025, 2, 28))), ['s:1', 'n:2']);
    assert.deepEqual(ids(abendeAmJahrestag(besuche, tag(2028, 2, 28))), ['n:5']);
    assert.deepEqual(ids(abendeAmJahrestag(besuche, tag(2028, 2, 29))), ['s:4']);
    // 2100 ist kein Schaltjahr.
    assert.deepEqual(ids(abendeAmJahrestag(besuche, tag(2100, 2, 28))), ['s:76', 'n:77']);
});

test('ohne oder mit kaputtem Datum: nichts, kein Fehler', () => {
    assert.deepEqual(abendeAmJahrestag([{ id: 'x' }, { id: 'y', date: '3.10.2025' }], tag(2026, 10, 3)), []);
    assert.deepEqual(abendeAmJahrestag(null, tag(2026, 10, 3)), []);
});

test('Text: "einem Jahr", sonst die Zahl', () => {
    assert.equal(jahrestagText(1), 'Heute vor einem Jahr');
    assert.equal(jahrestagText(4), 'Heute vor 4 Jahren');
});

test('Review-Auszug: kurz bleibt, lang endet an einer Wortgrenze', () => {
    assert.equal(reviewAuszug('  Großartig,\n\nwirklich.  '), 'Großartig, wirklich.');
    assert.equal(reviewAuszug(''), '');
    assert.equal(reviewAuszug(undefined), '');
    const lang = 'Netrebko sang die Tosca mit einer Wucht, die man so selten hört, und das Orchester trug sie, bis zum letzten Sprung von der Engelsburg.';
    const kurz = reviewAuszug(lang, 60);
    assert.ok(kurz.length <= 62, kurz);
    assert.match(kurz, /^Netrebko sang die Tosca mit einer Wucht, die man so selten …$/);
});
