// OpernLog kennt kein Passwort (Jonas, 10.11.2026): angemeldet wird mit einem
// Einmalcode aus der E-Mail, mit Google oder mit einem Passkey. Diese Prüfung
// hält das fest – ein Passwortfeld, das jemand später wieder einbaut, brächte
// das ganze Drumherum zurück: vergessen, zurücksetzen, Leak-Abgleich.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function dateien(ordner) {
    return fs.readdirSync(ordner, { withFileTypes: true }).flatMap(e => {
        const p = path.join(ordner, e.name);
        return e.isDirectory() ? dateien(p) : /\.(js|html)$/.test(e.name) ? [p] : [];
    });
}

const QUELLEN = [...dateien(path.join(WURZEL, 'src')), path.join(WURZEL, 'index.html')];

const VERBOTEN = [
    [/type=["']password["']/, 'ein Passwortfeld'],
    [/signInWithPassword\s*\(/, 'Anmelden mit Passwort'],
    [/\.auth\.signUp\s*\(/, 'Registrieren mit Passwort'],
    [/resetPasswordForEmail\s*\(/, 'Passwort zurücksetzen'],
    [/updateUser\s*\(\s*\{\s*password/, 'Passwort ändern'],
    [/autocomplete=["'](current|new)-password["']/, 'ein Feld für den Passwortmanager'],
];

test('nirgends in der App ein Passwort: kein Feld, kein Anmelden, kein Zurücksetzen', () => {
    const funde = [];
    for (const datei of QUELLEN) {
        const text = fs.readFileSync(datei, 'utf8');
        for (const [muster, was] of VERBOTEN) {
            if (muster.test(text)) funde.push(`${path.relative(WURZEL, datei)}: ${was}`);
        }
    }
    assert.deepEqual(funde, []);
});

test('angemeldet wird mit einem Einmalcode: anfordern und einlösen', () => {
    const quelle = fs.readFileSync(path.join(WURZEL, 'src/store/supabase.js'), 'utf8');
    assert.match(quelle, /signInWithOtp\s*\(/);
    assert.match(quelle, /verifyOtp\s*\(/);
    // Sechs Ziffern, wie im Dashboard eingestellt: mit der sechsten schickt die Seite ab.
    assert.match(fs.readFileSync(path.join(WURZEL, 'src/anmeldecode.js'), 'utf8'), /export const CODE_LAENGE = 6;/);
    // Anmelden darf kein Konto anlegen – sonst entstünde aus jedem Tippfehler eines.
    assert.match(quelle, /shouldCreateUser:\s*!!neu/);
    // Das Feld für den Code: Ziffern, und so benannt, dass das Telefon ihn aus der Mail vorschlägt.
    const seite = fs.readFileSync(path.join(WURZEL, 'src/pages/Auth.js'), 'utf8');
    assert.match(seite, /id="codeInput"[^>]*inputmode="numeric"[\s\S]{0,120}autocomplete="one-time-code"/);
});

test('die Prüfung selbst erkennt, was sie verbietet', () => {
    const treffer = t => VERBOTEN.filter(([m]) => m.test(t)).length;
    assert.equal(treffer('<input type="password" autocomplete="current-password">'), 2);
    assert.equal(treffer('await sb.auth.signInWithPassword({ email, password })'), 1);
    assert.equal(treffer('await sb.auth.signUp({ email })'), 1);
    assert.equal(treffer('sb.auth.updateUser({ password })'), 1);
    assert.equal(treffer('await sb.auth.signInWithOtp({ email }); sb.auth.updateUser({ email })'), 0);
});
