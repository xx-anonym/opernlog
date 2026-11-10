// Scheitert der Mailversand, steht ein deutscher Satz im Formular.
//
// Die Mails gehen seit Oktober 2026 über einen eigenen Postausgang (Gmail per
// SMTP). Nimmt der eine Mail nicht an oder ist das Stundenlimit erreicht,
// antwortet Supabase auf Englisch – und das stand vorher roh im Formular.
// Seit dem 10.11.2026 hängt daran jede Anmeldung: der Einmalcode kommt per
// Mail. Die Übersetzung selbst prüft tests/unit/authFehlertext.test.js; hier
// geht es darum, dass Anmelden und Registrieren sie auch benutzen.

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
async function anmeldeseite({ codeFehler = null } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await p.evaluate(async (f) => {
        window.__codeFehler = f;
        window.__codeAngefordert = [];
        const m = await import('/src/pages/Auth.js');
        document.body.innerHTML = '';
        document.body.appendChild(m.AuthPage());
    }, codeFehler);
    return { ctx, p, fehler };
}

async function codeZuschicken(p) {
    await p.fill('#loginEmail', 'fan@opernlog.de');
    await p.click('#loginSubmitBtn');
}

test('Anmelden: der Postausgang nimmt die Mail nicht an', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await anmeldeseite({
        codeFehler: { message: 'Error sending magic link email', code: 'unexpected_failure', status: 500 },
    });
    try {
        await codeZuschicken(p);
        await p.waitForSelector('#loginError', { state: 'visible' });
        assert.equal(await p.textContent('#loginError'),
            'Die E-Mail konnte gerade nicht verschickt werden. Bitte versuche es später noch einmal.');
        // Ohne Mail kein Code: das Feld dafür darf nicht erscheinen.
        assert.equal(await p.isVisible('#codeForm'), false);
        assert.equal(await p.isDisabled('#loginSubmitBtn'), false, 'Knopf bleibt gesperrt');
        assert.equal(await p.evaluate(() => localStorage.getItem('opernlog:codeOffen')), null);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Anmelden: zu schnell hintereinander – Supabase nennt die Wartezeit', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await anmeldeseite({
        codeFehler: { message: 'For security purposes, you can only request this after 37 seconds.', code: 'over_email_send_rate_limit', status: 429 },
    });
    try {
        await codeZuschicken(p);
        await p.waitForSelector('#loginError', { state: 'visible' });
        assert.equal(await p.textContent('#loginError'), 'Bitte warte noch 37 Sekunden und versuche es dann noch einmal.');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Registrieren: Stundenlimit der Mails erreicht', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await anmeldeseite({
        codeFehler: { message: 'email rate limit exceeded', code: 'over_email_send_rate_limit', status: 429 },
    });
    try {
        await p.click('[data-tab="register"]');
        await p.fill('#regUsername', 'Opernfan42');
        await p.fill('#regEmail', 'neu@opernlog.de');
        await p.click('#registerForm button[type="submit"]');
        await p.waitForFunction(() => /E-Mails/.test(document.querySelector('#regError')?.textContent || ''));
        assert.equal(await p.textContent('#regError'),
            'Gerade wurden zu viele E-Mails verschickt. Bitte versuche es etwas später noch einmal.');
        assert.equal(await p.isDisabled('#registerForm button[type="submit"]'), false, 'Knopf bleibt gesperrt');
        assert.equal(await p.isVisible('#codeForm'), false);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});
