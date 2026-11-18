// Wann "Neu in OpernLog" kommt.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { neuigkeitFaellig, neuigkeitGesehen, NEUIGKEIT } from '../../src/neuigkeiten.js';

function geraet(start = {}) {
    const daten = { ...start };
    return { localStorage: { getItem: k => daten[k] ?? null, setItem: (k, v) => { daten[k] = String(v); } } };
}

const ALT = '2024-01-01T00:00:00Z';
// Mitten in den acht Wochen nach dem Update.
const JETZT = Date.parse('2026-10-01T10:00:00Z');

test('ein Konto von vorher sieht die Neuigkeit einmal', () => {
    const g = geraet();
    assert.equal(neuigkeitFaellig({ umgebung: g, profilErstellt: ALT, jetzt: JETZT }), true);
    neuigkeitGesehen(g);
    assert.equal(neuigkeitFaellig({ umgebung: g, profilErstellt: ALT, jetzt: JETZT }), false);
});

test('wer nach dem Update dazukommt, kennt es nicht anders', () => {
    const danach = new Date(Date.parse(`${NEUIGKEIT.seit}T00:00:00Z`) + 3600e3).toISOString();
    assert.equal(neuigkeitFaellig({ umgebung: geraet(), profilErstellt: danach, jetzt: JETZT }), false);
    assert.equal(neuigkeitFaellig({ umgebung: geraet(), profilErstellt: '', jetzt: JETZT }), false);
});

test('eine neue Neuigkeit kommt auch nach einer alten', () => {
    const g = geraet();
    neuigkeitGesehen(g, { id: 'alt', seit: '2025-01-01' });
    assert.equal(neuigkeitFaellig({ umgebung: g, profilErstellt: ALT, jetzt: JETZT }), true);
});

test('ohne Speicher lieber nicht – sonst bei jedem Start', () => {
    const kaputt = { localStorage: { getItem() { throw new Error('gesperrt'); }, setItem() { throw new Error('gesperrt'); } } };
    assert.equal(neuigkeitFaellig({ umgebung: kaputt, profilErstellt: ALT, jetzt: JETZT }), false);
    assert.doesNotThrow(() => neuigkeitGesehen(kaputt));
});

test('nach acht Wochen ist es keine Neuigkeit mehr – auch nicht unter neuer Adresse mit leerem Speicher', () => {
    const seit = Date.parse(`${NEUIGKEIT.seit}T00:00:00Z`);
    const g = geraet();
    assert.equal(neuigkeitFaellig({ umgebung: g, profilErstellt: ALT, jetzt: seit + 8 * 7 * 24 * 3600e3 - 1 }), true);
    assert.equal(neuigkeitFaellig({ umgebung: g, profilErstellt: ALT, jetzt: seit + 8 * 7 * 24 * 3600e3 }), false);
    // Der Umzug nach opernlog.de am 18.11.2026.
    assert.equal(neuigkeitFaellig({ umgebung: geraet(), profilErstellt: ALT, jetzt: Date.parse('2026-11-18T19:45:00+01:00') }), false);
});
