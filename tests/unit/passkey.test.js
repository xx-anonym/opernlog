// Passkeys: was der Browser kann und was der Nutzer bei einem Fehler liest.
//
// Die Oberfläche prüft tests/browser/passkeys.test.js. Hier stehen die
// Entscheidungen, die Anmeldeseite und Profil gleich treffen müssen.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { passkeysMoeglich, passkeyFehlertext, passkeyZeile, passkeyVermerken, passkeyAnmeldungAnbieten }
    from '../../src/passkey.js';

const MIT_WEBAUTHN = {
    PublicKeyCredential: function PublicKeyCredential() {},
    navigator: { credentials: { get() {}, create() {} } },
};

test('mit WebAuthn gibt es Passkeys', () => {
    assert.equal(passkeysMoeglich(MIT_WEBAUTHN), true);
});

test('ohne WebAuthn gibt es keinen Knopf', () => {
    // Ältere Browser und manche eingebauten Browser in Apps haben es nicht.
    assert.equal(passkeysMoeglich({ navigator: {} }), false);
    assert.equal(passkeysMoeglich({ ...MIT_WEBAUTHN, PublicKeyCredential: undefined }), false);
    assert.equal(passkeysMoeglich({ ...MIT_WEBAUTHN, navigator: { credentials: { get() {} } } }), false);
});

// ── Knopf auf der Anmeldeseite ───────────────────────────────────────────

/** Ein localStorage zum Mitschauen. */
function speicher(vorher = {}) {
    const daten = { ...vorher };
    return {
        daten,
        getItem: k => (k in daten ? daten[k] : null),
        setItem: (k, v) => { daten[k] = String(v); },
        removeItem: k => { delete daten[k]; },
    };
}

const umgebung = (s) => ({ ...MIT_WEBAUTHN, localStorage: s });

test('ohne Vermerk kein Knopf – auch wenn der Browser Passkeys kann', () => {
    assert.equal(passkeyAnmeldungAnbieten(umgebung(speicher())), false);
});

test('ein Konto mit Passkey bringt den Knopf', () => {
    const s = speicher();
    passkeyVermerken('konto-a', true, s);
    assert.equal(passkeyAnmeldungAnbieten(umgebung(s)), true);
});

test('ohne WebAuthn nützt auch ein Vermerk nichts', () => {
    const s = speicher();
    passkeyVermerken('konto-a', true, s);
    assert.equal(passkeyAnmeldungAnbieten({ navigator: {}, localStorage: s }), false);
});

test('löscht ein Konto seine Passkeys, bleibt der Knopf für das andere', () => {
    // Zwei Leute auf einem Gerät: A hat Passkeys, B räumt seine weg.
    const s = speicher();
    passkeyVermerken('konto-a', true, s);
    passkeyVermerken('konto-b', true, s);
    passkeyVermerken('konto-b', false, s);
    assert.equal(passkeyAnmeldungAnbieten(umgebung(s)), true);
    passkeyVermerken('konto-a', false, s);
    assert.equal(passkeyAnmeldungAnbieten(umgebung(s)), false);
    assert.deepEqual(s.daten, {}, 'ein leerer Vermerk bleibt als Leiche im Speicher liegen');
});

test('dasselbe Konto zweimal vermerkt steht einmal da', () => {
    const s = speicher();
    passkeyVermerken('konto-a', true, s);
    passkeyVermerken('konto-a', true, s);
    assert.deepEqual(JSON.parse(s.daten['opernlog:passkeyKonten']), ['konto-a']);
});

test('ohne Nutzerkennung wird nichts vermerkt', () => {
    const s = speicher();
    passkeyVermerken(undefined, true, s);
    passkeyVermerken('', true, s);
    assert.deepEqual(s.daten, {});
});

test('kaputter oder gesperrter Speicher: kein Knopf, kein Absturz', () => {
    assert.equal(passkeyAnmeldungAnbieten(umgebung(speicher({ 'opernlog:passkeyKonten': '{kaputt' }))), false);
    assert.equal(passkeyAnmeldungAnbieten(umgebung(speicher({ 'opernlog:passkeyKonten': '{"a":1}' }))), false);

    // Safari im privaten Modus und gesperrte Website-Daten werfen schon beim Zugriff.
    const gesperrt = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); }, removeItem() {} };
    assert.doesNotThrow(() => passkeyVermerken('konto-a', true, gesperrt));
    assert.equal(passkeyAnmeldungAnbieten(umgebung(gesperrt)), false);
    assert.equal(passkeyAnmeldungAnbieten({ ...MIT_WEBAUTHN }), false, 'ganz ohne localStorage');
});

// ── Fehlertexte ──────────────────────────────────────────────────────────

test('ein Abbruch im Dialog des Systems zeigt nichts an', () => {
    // So kommt er aus supabase-js: der Browserfehler steckt in cause.
    const abbruch = { code: 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY', cause: { name: 'NotAllowedError' } };
    assert.equal(passkeyFehlertext(abbruch, 'anmelden'), null);
    assert.equal(passkeyFehlertext(abbruch, 'anlegen'), null);
    assert.equal(passkeyFehlertext({ code: 'ERROR_CEREMONY_ABORTED' }), null);
    assert.equal(passkeyFehlertext({ name: 'AbortError' }), null);
});

test('ein unbekannter Passkey sagt, was jetzt zu tun ist', () => {
    const text = passkeyFehlertext({ code: 'webauthn_credential_not_found' });
    assert.match(text, /E-Mail und Passwort/);
    assert.match(text, /Profil/);
});

test('ein doppelt angelegter Passkey wird erkannt – vom Browser wie vom Server', () => {
    const browser = passkeyFehlertext({ code: 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED' }, 'anlegen');
    const server = passkeyFehlertext({ code: 'webauthn_credential_exists' }, 'anlegen');
    assert.match(browser, /schon ein Passkey/);
    assert.equal(browser, server);
});

test('die bekannten Servercodes haben eigene Sätze', () => {
    for (const code of ['too_many_passkeys', 'webauthn_challenge_expired', 'passkey_disabled',
        'email_not_confirmed', 'user_banned', 'ERROR_INVALID_DOMAIN']) {
        const text = passkeyFehlertext({ code, message: 'roh' });
        assert.ok(text && !/nicht geklappt|nicht anlegen/.test(text), `${code} fällt auf den Rückfall`);
        assert.doesNotMatch(text, /roh/, `${code}: die Rohmeldung gehört in die Konsole`);
    }
});

test('ein unbekannter Fehler bekommt den Rückfall passend zum Vorgang', () => {
    assert.match(passkeyFehlertext({ message: 'Internal' }, 'anmelden'), /Anmeldung mit Passkey/);
    assert.match(passkeyFehlertext({ message: 'Internal' }, 'anlegen'), /nicht anlegen/);
    assert.match(passkeyFehlertext(undefined), /Anmeldung mit Passkey/);
});

test('fehlt WebAuthn doch, steht es so da', () => {
    assert.match(passkeyFehlertext({ message: 'Browser does not support WebAuthn' }), /Browser kann keine Passkeys/);
});

// ── Zeilen im Profil ─────────────────────────────────────────────────────

test('eine Zeile nennt Namen, Anlage und letzte Benutzung', () => {
    const z = passkeyZeile({ friendly_name: 'iCloud-Schlüsselbund',
        created_at: '2026-09-10T12:00:00Z', last_used_at: '2026-09-14T12:00:00Z' });
    assert.equal(z.name, 'iCloud-Schlüsselbund');
    assert.equal(z.unterzeile, 'angelegt am 10. Sep 2026 · zuletzt benutzt am 14. Sep 2026');
});

test('nie benutzt und ohne Namen', () => {
    const z = passkeyZeile({ friendly_name: '  ', created_at: '2026-09-10T12:00:00Z', last_used_at: null });
    assert.equal(z.name, 'Passkey');
    assert.equal(z.unterzeile, 'angelegt am 10. Sep 2026 · noch nie benutzt');
});

test('ein kaputtes Datum ergibt kein "NaN"', () => {
    const z = passkeyZeile({ created_at: 'Quatsch' });
    assert.doesNotMatch(z.unterzeile, /NaN|undefined/);
    assert.equal(z.unterzeile, 'noch nie benutzt');
});
