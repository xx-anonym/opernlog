// Der Feed der Startseite (src/feedVorrat.js): beim Start einmal vorgeladen,
// danach frisch, und der gemerkte Stand nur als Notlösung.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import * as vorrat from '../../src/feedVorrat.js';

function speicher() {
    const m = new Map();
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m };
}

beforeEach(() => vorrat._zuruecksetzen());

test('vorgeladen: die erste Startseite bekommt genau diese Antwort, die zweite fragt frisch', async () => {
    const s = speicher();
    let anfragen = 0;
    const lader = async () => { anfragen++; return [{ id: `v${anfragen}` }]; };
    assert.equal(await vorrat.vorladen(lader, 'u1', { speicher: s }), true);
    assert.equal(anfragen, 1);

    const erste = vorrat.holen(lader, 'u1', { speicher: s });
    assert.deepEqual(await erste.frisch, [{ id: 'v1' }]);
    assert.equal(anfragen, 1, 'keine zweite Anfrage für die erste Startseite');

    const zweite = vorrat.holen(lader, 'u1', { speicher: s });
    // Beim Neuzeichnen steht der eben frisch geladene Feed sofort da …
    assert.deepEqual(zweite.sofort, [{ id: 'v1' }]);
    // … und wird trotzdem frisch geholt.
    assert.deepEqual(await zweite.frisch, [{ id: 'v2' }]);
    assert.equal(anfragen, 2);
});

test('beim Start nie der gemerkte Stand als "sofort" – nur was in dieser Sitzung frisch kam', async () => {
    const s = speicher();
    vorrat.merken('u1', [{ id: 'alt' }], { speicher: s, jetzt: 1 });
    const { sofort } = vorrat.holen(async () => [{ id: 'neu' }], 'u1', { speicher: s });
    assert.equal(sofort, null);
});

test('gescheitert: vorladen meldet false, ohne zu werfen; der gemerkte Stand bleibt', async () => {
    const s = speicher();
    vorrat.merken('u1', [{ id: 'alt' }], { speicher: s, jetzt: 5 });
    assert.equal(await vorrat.vorladen(async () => { throw new Error('offline'); }, 'u1', { speicher: s }), false);
    await assert.rejects(vorrat.holen(async () => [], 'u1', { speicher: s }).frisch, /offline/);
    assert.deepEqual(vorrat.gemerkt('u1', { speicher: s }), { feed: [{ id: 'alt' }], zeit: 5 });
});

test('gemerkt je Konto, höchstens 50, und beim Abmelden weg', async () => {
    const s = speicher();
    await vorrat.vorladen(async () => Array.from({ length: 60 }, (_, i) => ({ id: i })), 'u1', { speicher: s });
    assert.equal(vorrat.gemerkt('u1', { speicher: s }).feed.length, 50);
    // Ein anderes Konto sieht den Feed von u1 nicht.
    assert.equal(vorrat.gemerkt('u2', { speicher: s }), null);
    assert.equal(vorrat.holen(async () => [], 'u2', { speicher: s }).sofort, null);

    vorrat.vergessen({ speicher: s });
    assert.equal(vorrat.gemerkt('u1', { speicher: s }), null);
    assert.equal(vorrat.holen(async () => [], 'u1', { speicher: s }).sofort, null);
});

test('kaputter oder gesperrter Speicher stört nicht', () => {
    const kaputt = { getItem: () => '{nicht json', setItem: () => { throw new Error('voll'); }, removeItem: () => { throw new Error('gesperrt'); } };
    assert.equal(vorrat.gemerkt('u1', { speicher: kaputt }), null);
    assert.doesNotThrow(() => vorrat.merken('u1', [], { speicher: kaputt }));
    assert.doesNotThrow(() => vorrat.vergessen({ speicher: kaputt }));
});

test('anders und Stand', () => {
    assert.equal(vorrat.anders(null, []), true);
    assert.equal(vorrat.anders([{ id: 1, likes: 0 }], [{ id: 1, likes: 0 }]), false);
    assert.equal(vorrat.anders([{ id: 1, likes: 0 }], [{ id: 1, likes: 1 }]), true);
    const jetzt = new Date(2026, 10, 25, 22, 0);
    assert.equal(vorrat.standText(new Date(2026, 10, 25, 9, 5).getTime(), jetzt), 'Stand: heute, 09:05');
    assert.equal(vorrat.standText(new Date(2026, 10, 23, 21, 40).getTime(), jetzt), 'Stand: 23.11., 21:40');
    assert.equal(vorrat.standText(null, jetzt), 'Gespeicherter Stand');
});
