// Wann "Neu in OpernLog" kommt.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { neuigkeitFaellig, neuigkeitGesehen, NEUIGKEIT } from '../../src/neuigkeiten.js';

function geraet(start = {}) {
    const daten = { ...start };
    return { localStorage: { getItem: k => daten[k] ?? null, setItem: (k, v) => { daten[k] = String(v); } } };
}

const ALT = '2024-01-01T00:00:00Z';

test('ein Konto von vorher sieht die Neuigkeit einmal', () => {
    const g = geraet();
    assert.equal(neuigkeitFaellig({ umgebung: g, profilErstellt: ALT }), true);
    neuigkeitGesehen(g);
    assert.equal(neuigkeitFaellig({ umgebung: g, profilErstellt: ALT }), false);
});

test('wer nach dem Update dazukommt, kennt es nicht anders', () => {
    const danach = new Date(Date.parse(`${NEUIGKEIT.seit}T00:00:00Z`) + 3600e3).toISOString();
    assert.equal(neuigkeitFaellig({ umgebung: geraet(), profilErstellt: danach }), false);
    assert.equal(neuigkeitFaellig({ umgebung: geraet(), profilErstellt: '' }), false);
});

test('eine neue Neuigkeit kommt auch nach einer alten', () => {
    const g = geraet();
    neuigkeitGesehen(g, { id: 'alt', seit: '2025-01-01' });
    assert.equal(neuigkeitFaellig({ umgebung: g, profilErstellt: ALT }), true);
});

test('ohne Speicher lieber nicht – sonst bei jedem Start', () => {
    const kaputt = { localStorage: { getItem() { throw new Error('gesperrt'); }, setItem() { throw new Error('gesperrt'); } } };
    assert.equal(neuigkeitFaellig({ umgebung: kaputt, profilErstellt: ALT }), false);
    assert.doesNotThrow(() => neuigkeitGesehen(kaputt));
});
