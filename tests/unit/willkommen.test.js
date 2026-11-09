// Wann das Karussell "Was hast du schon gesehen?" kommt.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { willkommenFaellig, willkommenErledigt, WILLKOMMEN_GESEHEN } from '../../src/willkommen.js';

function geraet(start = {}) {
    const daten = { ...start };
    return { localStorage: { getItem: k => daten[k] ?? null, setItem: (k, v) => { daten[k] = String(v); } } };
}

const JETZT = Date.parse('2026-11-09T12:00:00Z');
const vor = tage => new Date(JETZT - tage * 24 * 3600e3).toISOString();

test('ein neues, leeres Konto sieht es einmal je Gerät', () => {
    const g = geraet();
    assert.equal(willkommenFaellig({ umgebung: g, profilErstellt: vor(0), jetzt: JETZT }), true);
    willkommenErledigt(g);
    assert.equal(willkommenFaellig({ umgebung: g, profilErstellt: vor(0), jetzt: JETZT }), false);
    assert.equal(willkommenFaellig({ umgebung: geraet({ [WILLKOMMEN_GESEHEN]: 'x' }), profilErstellt: vor(0), jetzt: JETZT }), false);
});

test('wer schon etwas eingetragen hat, braucht den Einstieg nicht', () => {
    assert.equal(willkommenFaellig({ umgebung: geraet(), profilErstellt: vor(1), abende: 1, jetzt: JETZT }), false);
    assert.equal(willkommenFaellig({ umgebung: geraet(), profilErstellt: vor(1), gesehen: 1, jetzt: JETZT }), false);
});

test('nur bei neuen Konten: bis 30 Tage', () => {
    assert.equal(willkommenFaellig({ umgebung: geraet(), profilErstellt: vor(30), jetzt: JETZT }), true);
    assert.equal(willkommenFaellig({ umgebung: geraet(), profilErstellt: vor(31), jetzt: JETZT }), false);
    assert.equal(willkommenFaellig({ umgebung: geraet(), profilErstellt: '', jetzt: JETZT }), false);
});

test('ohne Speicher lieber nicht – sonst käme es bei jedem Start', () => {
    const kaputt = { localStorage: { getItem() { throw new Error('gesperrt'); }, setItem() { throw new Error('gesperrt'); } } };
    assert.equal(willkommenFaellig({ umgebung: kaputt, profilErstellt: vor(0), jetzt: JETZT }), false);
    assert.doesNotThrow(() => willkommenErledigt(kaputt));
});
