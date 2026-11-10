// Der Einmalcode: was die Anmeldeseite liest und sich merkt.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { codeLesen, codeVollstaendig, codeOffen, codeOffenMerken, codeOffenVergessen, CODE_OFFEN, GUELTIG_MS } from '../../src/anmeldecode.js';
import { authFehlertext } from '../../src/utils.js';

function geraet(start = {}) {
    const daten = { ...start };
    return { daten, localStorage: {
        getItem: k => daten[k] ?? null,
        setItem: (k, v) => { daten[k] = String(v); },
        removeItem: (k) => { delete daten[k]; },
    } };
}

const JETZT = Date.parse('2026-11-10T09:00:00Z');

test('aus der Mail abgetippt oder eingefügt: nur die Ziffern zählen', () => {
    assert.equal(codeLesen('483920'), '483920');
    assert.equal(codeLesen(' 483 920 '), '483920');
    assert.equal(codeLesen('483-920'), '483920');
    assert.equal(codeLesen('Dein Code: 483920.'), '483920');
    assert.equal(codeLesen('123456789012345'), '1234567890');
    assert.equal(codeLesen(null), '');
});

test('vollständig ist ein Code mit sechs bis zehn Ziffern', () => {
    assert.equal(codeVollstaendig('48392'), false);
    assert.equal(codeVollstaendig('483920'), true);
    assert.equal(codeVollstaendig('483 920'), true);
    assert.equal(codeVollstaendig('48392044'), true);
    assert.equal(codeVollstaendig(''), false);
});

test('ein angeforderter Code bleibt gemerkt, bis er eingelöst, verworfen oder zu alt ist', () => {
    const g = geraet();
    assert.equal(codeOffen({ umgebung: g, jetzt: JETZT }), null);
    codeOffenMerken('fan@opernlog.de', { umgebung: g, jetzt: JETZT });
    assert.deepEqual(codeOffen({ umgebung: g, jetzt: JETZT + 5 * 60e3 }), { email: 'fan@opernlog.de', neu: null, seit: JETZT });
    // Nach einer Stunde gilt kein Code mehr.
    assert.equal(codeOffen({ umgebung: g, jetzt: JETZT + GUELTIG_MS + 1 }), null);
    codeOffenVergessen(g);
    assert.equal(codeOffen({ umgebung: g, jetzt: JETZT }), null);
});

test('beim Registrieren bleiben Name und Bild dabei – für "Neuen Code senden" nach dem Neuladen', () => {
    const g = geraet();
    codeOffenMerken('neu@opernlog.de', { neu: { username: 'Opernfan42', avatarIcon: 'geige', fremd: 'x' }, umgebung: g, jetzt: JETZT });
    assert.deepEqual(codeOffen({ umgebung: g, jetzt: JETZT }), { email: 'neu@opernlog.de', neu: { username: 'Opernfan42', avatarIcon: 'geige' }, seit: JETZT });
});

test('Unsinn im Speicher oder kein Speicher: dann ist eben nichts offen', () => {
    for (const wert of ['kein json', '{"email":""}', '{"email":"a@b.de"}', '{"email":5,"seit":1}', 'null']) {
        assert.equal(codeOffen({ umgebung: geraet({ [CODE_OFFEN]: wert }), jetzt: JETZT }), null, wert);
    }
    // Ein Merker aus der Zukunft (Uhr verstellt) gilt nicht.
    assert.equal(codeOffen({ umgebung: geraet({ [CODE_OFFEN]: JSON.stringify({ email: 'a@b.de', seit: JETZT + 60e3 }) }), jetzt: JETZT }), null);
    const kaputt = { localStorage: { getItem() { throw new Error('gesperrt'); }, setItem() { throw new Error('gesperrt'); }, removeItem() { throw new Error('gesperrt'); } } };
    assert.equal(codeOffen({ umgebung: kaputt, jetzt: JETZT }), null);
    assert.doesNotThrow(() => codeOffenMerken('a@b.de', { umgebung: kaputt }));
    assert.doesNotThrow(() => codeOffenVergessen(kaputt));
});

test('was Supabase zum Code meldet, steht als deutscher Satz da', () => {
    assert.match(authFehlertext({ code: 'otp_expired', message: 'Token has expired or is invalid' }), /stimmt nicht oder ist abgelaufen/);
    assert.match(authFehlertext({ message: 'Token has expired or is invalid' }), /stimmt nicht oder ist abgelaufen/);
    assert.match(authFehlertext({ code: 'otp_disabled', message: 'Signups not allowed for otp' }), /gibt es kein Konto/);
    assert.match(authFehlertext({ message: 'For security purposes, you can only request this after 42 seconds.' }), /noch 42 Sekunden/);
    assert.match(authFehlertext({ code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' }), /zu viele E-Mails/);
    assert.match(authFehlertext({ message: 'Error sending magic link email', code: 'unexpected_failure' }), /konnte gerade nicht verschickt werden/);
});
