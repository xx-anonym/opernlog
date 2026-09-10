// Die vier Zahlen im Kopf des Feeds.
//
// Dort standen vorher die Größen des Katalogs – 92 Häuser, 121 Werke. Die
// ändern sich nie. Diese hier wachsen mit dem Nutzer, und deshalb müssen sie
// stimmen: eine fehlende Bewertung darf den Schnitt nicht nach unten ziehen,
// und die Spielzeitgrenze am 1. August muss sitzen.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { seasonSummary } from '../../src/data/season.js';

const b = (o) => ({ houseId: 'semperoper', operaId: 'tosca', date: '2025-09-01', rating: 4, ...o });

test('ohne Besuche stehen überall Nullen und kein Schnitt', () => {
    const s = seasonSummary([], 2025);
    assert.deepEqual(s, { abende: 0, haeuser: 0, werke: 0, schnitt: null });
    assert.deepEqual(seasonSummary(undefined, 2025).abende, 0);
});

test('Abende, Häuser und Werke werden getrennt gezählt', () => {
    const s = seasonSummary([
        b({ houseId: 'semperoper', operaId: 'tosca' }),
        b({ houseId: 'semperoper', operaId: 'aida' }),
        b({ houseId: 'oper-koeln', operaId: 'tosca' }),
    ], 2025);
    assert.equal(s.abende, 3, 'drei Abende');
    assert.equal(s.haeuser, 2, 'zwei verschiedene Häuser');
    assert.equal(s.werke, 2, 'zwei verschiedene Werke');
});

test('nur Besuche der gefragten Spielzeit zählen', () => {
    // Die Spielzeit läuft vom 1. August bis 31. Juli.
    const s = seasonSummary([
        b({ date: '2025-07-31' }),   // noch Spielzeit 2024
        b({ date: '2025-08-01' }),   // schon Spielzeit 2025
        b({ date: '2026-07-31' }),   // noch Spielzeit 2025
        b({ date: '2026-08-01' }),   // schon Spielzeit 2026
    ], 2025);
    assert.equal(s.abende, 2);
});

test('unbewertete Abende zählen mit, ziehen den Schnitt aber nicht herunter', () => {
    // Sonst wirkte eine fehlende Note wie eine Null.
    const s = seasonSummary([
        b({ rating: 5 }),
        b({ rating: 0 }),
        b({ rating: null }),
        b({ rating: 3 }),
    ], 2025);
    assert.equal(s.abende, 4);
    assert.equal(s.schnitt, 4, 'nur die beiden bewerteten');
});

test('ohne jede Bewertung gibt es keinen Schnitt', () => {
    const s = seasonSummary([b({ rating: 0 }), b({ rating: null })], 2025);
    assert.equal(s.abende, 2);
    assert.equal(s.schnitt, null);
});

test('Besuche aus der Cloud werden genauso gelesen wie lokale', () => {
    // snake_case aus der Cloud, camelCase aus dem lokalen Speicher – wer nur
    // eine Schreibweise kennt, zählt null Häuser und null Werke.
    const s = seasonSummary([
        { house_id: 'semperoper', opera_id: 'tosca', date: '2025-09-01', rating: 4 },
        { houseId: 'oper-koeln', operaId: 'aida', date: '2025-10-01', rating: 2 },
    ], 2025);
    assert.equal(s.haeuser, 2);
    assert.equal(s.werke, 2);
    assert.equal(s.schnitt, 3);
});
