// src/data/spielplan.js – die erzeugte Datei muss zum Katalog passen.
//
// Sie entsteht aus einem Lauf über fremde Webseiten. Was dort schiefgeht,
// soll hier auffallen und nicht erst in der Wunschliste.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { spielplan, SPIELPLAN_STAND, SPIELPLAN_ZUSATZWERKE } from '../../src/data/spielplan.js';
import { operas } from '../../src/data/operas.js';
import { operaHouses } from '../../src/data/operaHouses.js';
import { ID_MUSTER } from '../../src/data/katalogRegeln.js';

// Werke aus der Datenbank kennt die Prüfung nicht – sie stehen deshalb in
// der Datei selbst (SPIELPLAN_ZUSATZWERKE).
const werke = new Set([...operas.map(o => o.id), ...SPIELPLAN_ZUSATZWERKE]);
const haeuser = new Set(operaHouses.map(h => h.id));

test('Stand ist ein Datum', () => {
    assert.match(SPIELPLAN_STAND, /^20\d\d-\d\d-\d\d$/);
});

test('jedes Werk und jedes Haus gibt es im Katalog', () => {
    for (const e of spielplan) {
        assert.ok(werke.has(e.werk), `unbekanntes Werk ${e.werk}`);
        assert.ok(haeuser.has(e.haus), `unbekanntes Haus ${e.haus}`);
    }
});

test('Zusatzwerke sind Kennungen, die operas.js nicht kennt, und kommen vor', () => {
    const imRepo = new Set(operas.map(o => o.id));
    for (const w of SPIELPLAN_ZUSATZWERKE) {
        assert.match(w, ID_MUSTER, w);
        assert.ok(!imRepo.has(w), `${w} steht schon in operas.js`);
        assert.ok(spielplan.some(e => e.werk === w), `${w} kommt im Spielplan nicht vor`);
    }
});

test('jedes Werk steht je Haus nur einmal', () => {
    const paare = spielplan.map(e => `${e.werk}@${e.haus}`);
    assert.equal(new Set(paare).size, paare.length);
});

test('Termine: gültig, sortiert, ohne Doppelte, innerhalb eines Jahres ab Stand', () => {
    const bis = `${Number(SPIELPLAN_STAND.slice(0, 4)) + 1}-09-30`;
    for (const e of spielplan) {
        assert.ok(e.termine.length > 0, `${e.werk}@${e.haus} ohne Termine`);
        assert.deepEqual([...new Set(e.termine)].sort(), e.termine, `${e.werk}@${e.haus} unsortiert oder doppelt`);
        for (const t of e.termine) {
            assert.match(t, /^20\d\d-\d\d-\d\d$/);
            assert.ok(!Number.isNaN(Date.parse(t)), `${t} ist kein Tag`);
            assert.ok(t >= SPIELPLAN_STAND && t <= bis, `${e.werk}@${e.haus}: ${t} außerhalb der Spielzeit`);
        }
    }
});

test('Zeiten gehören zu Terminen und sind Uhrzeiten', () => {
    for (const e of spielplan) {
        for (const [t, zeit] of Object.entries(e.zeiten || {})) {
            assert.ok(e.termine.includes(t), `${e.werk}@${e.haus}: Zeit für ${t}, aber kein Termin`);
            assert.match(zeit, /^([01]\d|2[0-3]):[0-5]\d(-([01]\d|2[0-3]):[0-5]\d)?$/, `${e.werk}@${e.haus} ${t}: ${zeit}`);
        }
    }
});

test('jeder Link führt per https auf eine Seite', () => {
    for (const e of spielplan) {
        assert.match(e.url, /^https:\/\/[^/]+\.[a-z]{2,}/i, `${e.werk}@${e.haus}: ${e.url}`);
    }
});
