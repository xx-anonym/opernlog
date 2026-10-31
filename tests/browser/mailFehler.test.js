// Scheitert der Mailversand, steht ein deutscher Satz im Formular.
//
// Die Mails gehen seit Oktober 2026 über einen eigenen Postausgang (Gmail per
// SMTP). Nimmt der eine Mail nicht an oder ist das Stundenlimit erreicht,
// antwortet Supabase auf Englisch – und das stand vorher roh in "Passwort
// vergessen" und in der Registrierung. Die Übersetzung selbst prüft
// tests/unit/authFehlertext.test.js; hier geht es darum, dass beide Formulare
// sie auch benutzen.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { starteServer, ladePlaywright, starteBrowser, ersetzeSupabase } from './umgebung.js';

const pw = await ladePlaywright();
const fehltPlaywright = pw ? false : 'Playwright ist nicht installiert';

let browser, server;

before(async () => {
    if (!pw) return;
    server = await starteServer();
    browser = await starteBrowser(pw.chromium);
}, { timeout: 120000 });

after(async () => {
    await browser?.close();
    await server?.schliessen();
});

/** Die Anmeldeseite, direkt eingehängt – der Stub liefert sonst immer eine Sitzung. */
async function anmeldeseite({ resetFehler = null, registrierFehler = null } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await p.evaluate(async ({ r, g }) => {
        window.__resetFehler = r;
        window.__registrierFehler = g;
        window.__leakAntwort = '';
        window.__registriert = [];
        const m = await import('/src/pages/Auth.js');
        document.body.innerHTML = '';
        document.body.appendChild(m.AuthPage());
    }, { r: resetFehler, g: registrierFehler });
    return { ctx, p, fehler };
}

async function passwortVergessen(p) {
    await p.click('#forgotPasswordLink');
    await p.fill('#resetEmail', 'fan@opernlog.de');
    await p.click('#resetForm button[type="submit"]');
}

test('Passwort vergessen: der Postausgang nimmt die Mail nicht an', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await anmeldeseite({
        resetFehler: { message: 'Error sending recovery email', code: 'unexpected_failure', status: 500 },
    });
    try {
        await passwortVergessen(p);
        await p.waitForSelector('#resetError', { state: 'visible' });
        assert.equal(await p.textContent('#resetError'),
            'Die E-Mail konnte gerade nicht verschickt werden. Bitte versuche es später noch einmal.');
        assert.equal(await p.isVisible('#resetSuccess'), false);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Passwort vergessen: ohne Fehler die Bestätigung, mit Rückkehr zur App', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await anmeldeseite();
    try {
        await passwortVergessen(p);
        await p.waitForSelector('#resetSuccess', { state: 'visible' });
        assert.match(await p.textContent('#resetSuccess'), /Link zum Zurücksetzen/);
        const [anfrage] = await p.evaluate(() => window.__resetAngefragt);
        assert.equal(anfrage.email, 'fan@opernlog.de');
        assert.equal(anfrage.optionen.redirectTo, server.url);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Registrieren: Stundenlimit der Mails erreicht', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await anmeldeseite({
        registrierFehler: { message: 'email rate limit exceeded', code: 'over_email_send_rate_limit', status: 429 },
    });
    try {
        await p.click('[data-tab="register"]');
        await p.fill('#regUsername', 'Opernfan42');
        await p.fill('#regEmail', 'neu@opernlog.de');
        await p.fill('#regPassword', 'Kammersaengerin-1871');
        await p.click('#registerForm button[type="submit"]');
        await p.waitForFunction(() => /E-Mails/.test(document.querySelector('#regError')?.textContent || ''));
        assert.equal(await p.textContent('#regError'),
            'Gerade wurden zu viele E-Mails verschickt. Bitte versuche es etwas später noch einmal.');
        assert.equal(await p.isDisabled('#registerForm button[type="submit"]'), false, 'Knopf bleibt gesperrt');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});
