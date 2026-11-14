// Eine Einladung, die auf ihr Konto wartet (src/einladung.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { einladungsCode, einladungMerken, offeneEinladung, einladungVergessen, endgueltigGescheitert, EINLADUNG_OFFEN, EINLADUNG_TAGE } from '../../src/einladung.js';

function geraet(start = {}) {
    const daten = { ...start };
    return { daten, localStorage: {
        getItem: k => daten[k] ?? null,
        setItem: (k, v) => { daten[k] = String(v); },
        removeItem: (k) => { delete daten[k]; },
    } };
}

const JETZT = Date.parse('2026-11-14T10:00:00Z');

test('der Code aus dem Link, in der Form der Datenbank', () => {
    assert.equal(einladungsCode('ab3k9z'), 'AB3K9Z');
    assert.equal(einladungsCode(' AB3K9Z '), 'AB3K9Z');
    assert.equal(einladungsCode(''), '');
    assert.equal(einladungsCode('AB3K9Z?x=1'), '');
    assert.equal(einladungsCode('<script>'), '');
});

test('gemerkt bis zum Annehmen, höchstens 30 Tage', () => {
    const g = geraet();
    assert.equal(offeneEinladung({ umgebung: g, jetzt: JETZT }), '');
    einladungMerken('ab3k9z', { umgebung: g, jetzt: JETZT });
    assert.equal(offeneEinladung({ umgebung: g, jetzt: JETZT + 3 * 864e5 }), 'AB3K9Z');
    assert.equal(offeneEinladung({ umgebung: g, jetzt: JETZT + EINLADUNG_TAGE * 864e5 + 1 }), '');
    einladungVergessen(g);
    assert.equal(offeneEinladung({ umgebung: g, jetzt: JETZT }), '');
});

test('Unsinn im Speicher oder kein Speicher: dann wartet keine Einladung', () => {
    for (const wert of ['kein json', 'null', '{"code":"AB3K9Z"}', '{"code":"<b>","seit":1}']) {
        assert.equal(offeneEinladung({ umgebung: geraet({ [EINLADUNG_OFFEN]: wert }), jetzt: JETZT }), '', wert);
    }
    const kaputt = { localStorage: { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } } };
    assert.equal(offeneEinladung({ umgebung: kaputt, jetzt: JETZT }), '');
    assert.doesNotThrow(() => einladungMerken('AB3K9Z', { umgebung: kaputt }));
    assert.doesNotThrow(() => einladungVergessen(kaputt));
});

test('endgültig ist nur, was accept_invite selbst ablehnt – kein Netz ist es nicht', () => {
    assert.equal(endgueltigGescheitert('Ungültiger oder abgelaufener Einladungslink'), true);
    assert.equal(endgueltigGescheitert('Du kannst deinen eigenen Einladungslink nicht verwenden'), true);
    assert.equal(endgueltigGescheitert('Failed to fetch'), false);
    assert.equal(endgueltigGescheitert('Nicht eingeloggt'), false);
    assert.equal(endgueltigGescheitert(undefined), false);
});
