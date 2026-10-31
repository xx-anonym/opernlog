// Fehler beim Anmelden, Registrieren und Zurücksetzen als deutscher Satz.
//
// Die Fehler sind so gebaut, wie supabase-js sie liefert (AuthApiError:
// message, status, code). Die Texte stammen von Supabase Auth.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { authFehlertext } from '../../src/utils.js';

const fehler = (message, code, status) => Object.assign(new Error(message), { code, status });

test('der Postausgang nimmt die Mail nicht an', () => {
    for (const f of [
        fehler('Error sending recovery email', 'unexpected_failure', 500),
        fehler('Error sending confirmation email', 'unexpected_failure', 500),
        fehler('Error sending confirmation email'),   // ohne Code, nur der Text
    ]) {
        assert.equal(authFehlertext(f), 'Die E-Mail konnte gerade nicht verschickt werden. Bitte versuche es später noch einmal.');
    }
});

test('zu viele Mails insgesamt', () => {
    assert.match(authFehlertext(fehler('email rate limit exceeded', 'over_email_send_rate_limit', 429)), /zu viele E-Mails/);
    assert.match(authFehlertext(fehler('Email rate limit exceeded')), /zu viele E-Mails/);
});

test('dieselbe Adresse zu schnell hintereinander: die Wartezeit steht im Satz', () => {
    const f = fehler('For security purposes, you can only request this after 42 seconds.', 'over_email_send_rate_limit', 429);
    assert.equal(authFehlertext(f), 'Bitte warte noch 42 Sekunden und versuche es dann noch einmal.');
});

test('zu viele Anfragen von dieser Verbindung', () => {
    assert.match(authFehlertext(fehler('Request rate limit reached', 'over_request_rate_limit', 429)), /Zu viele Versuche/);
});

test('Anmelden vor der Bestätigung, falsche Daten, schon registriert', () => {
    assert.match(authFehlertext(fehler('Email not confirmed', 'email_not_confirmed', 400)), /bestätige zuerst deine E-Mail/);
    assert.equal(authFehlertext(fehler('Invalid login credentials', 'invalid_credentials', 400)), 'Ungültige Anmeldedaten');
    assert.equal(authFehlertext(fehler('Invalid login credentials')), 'Ungültige Anmeldedaten');
    assert.equal(authFehlertext(fehler('User already registered', 'user_already_exists', 422)), 'Diese E-Mail ist bereits registriert');
});

test('Unbekanntes bleibt, wie Supabase es schreibt; nichts wirft', () => {
    assert.equal(authFehlertext(fehler('Signups not allowed for this instance', 'signup_disabled', 422)), 'Signups not allowed for this instance');
    assert.equal(authFehlertext('nur ein Text'), 'nur ein Text');
    assert.equal(authFehlertext(null), '');
    assert.equal(authFehlertext(undefined), '');
});
