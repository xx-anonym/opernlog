// Wann das Karussell "Was hast du schon gesehen?" kommt.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { willkommenFaellig, willkommenErledigt, willkommenSchluessel, WILLKOMMEN_GESEHEN } from '../../src/willkommen.js';

function geraet(start = {}) {
    const daten = { ...start };
    return { localStorage: { getItem: k => daten[k] ?? null, setItem: (k, v) => { daten[k] = String(v); } } };
}

const JETZT = Date.parse('2026-11-09T12:00:00Z');
const vor = tage => new Date(JETZT - tage * 24 * 3600e3).toISOString();
const ICH = 'konto-a';
const neu = (o = {}) => ({ profilId: ICH, profilErstellt: vor(0), jetzt: JETZT, ...o });

test('ein neues, leeres Konto sieht es einmal je Gerät', () => {
    const g = geraet();
    assert.equal(willkommenFaellig(neu({ umgebung: g })), true);
    willkommenErledigt(ICH, g);
    assert.equal(willkommenFaellig(neu({ umgebung: g })), false);
});

test('gemerkt wird je Konto: ein anderes Konto auf demselben Gerät sieht es trotzdem', () => {
    // Am 10.11.2026 auf Jonas' iPhone: am Vorabend hatte ein Testkonto das
    // Karussell gesehen, das frisch registrierte Konto bekam deshalb keines.
    const g = geraet();
    willkommenErledigt('konto-von-gestern', g);
    assert.equal(willkommenFaellig(neu({ umgebung: g })), true);
    assert.equal(willkommenFaellig(neu({ umgebung: g, profilId: 'konto-von-gestern' })), false);
    // Auch der alte Schlüssel ohne Konto (bis 9.11.2026) hält niemanden auf.
    assert.equal(willkommenFaellig(neu({ umgebung: geraet({ [WILLKOMMEN_GESEHEN]: 'x' }) })), true);
    assert.equal(willkommenSchluessel(ICH), `${WILLKOMMEN_GESEHEN}:${ICH}`);
});

test('wer schon etwas eingetragen hat, braucht den Einstieg nicht', () => {
    assert.equal(willkommenFaellig(neu({ umgebung: geraet(), abende: 1 })), false);
    assert.equal(willkommenFaellig(neu({ umgebung: geraet(), gesehen: 1 })), false);
});

test('nur bei neuen Konten: bis 30 Tage', () => {
    assert.equal(willkommenFaellig(neu({ umgebung: geraet(), profilErstellt: vor(30) })), true);
    assert.equal(willkommenFaellig(neu({ umgebung: geraet(), profilErstellt: vor(31) })), false);
    assert.equal(willkommenFaellig(neu({ umgebung: geraet(), profilErstellt: '' })), false);
});

test('ohne Konto und ohne Speicher lieber nicht – sonst käme es bei jedem Start', () => {
    assert.equal(willkommenFaellig(neu({ umgebung: geraet(), profilId: '' })), false);
    const kaputt = { localStorage: { getItem() { throw new Error('gesperrt'); }, setItem() { throw new Error('gesperrt'); } } };
    assert.equal(willkommenFaellig(neu({ umgebung: kaputt })), false);
    assert.doesNotThrow(() => willkommenErledigt(ICH, kaputt));
    const g = geraet();
    willkommenErledigt('', g);
    assert.equal(willkommenFaellig(neu({ umgebung: g })), true);
});
