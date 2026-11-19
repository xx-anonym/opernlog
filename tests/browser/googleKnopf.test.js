// Googles eigener Anmeldeknopf (src/googleKnopf.js, seit 20.11.2026): das
// Fenster sagt "In opernlog.de anmelden" statt der Supabase-Adresse.
//
// Das echte Skript von accounts.google.com lädt kein Test. umgebung.js
// liefert mit { google: true } einen Nachbau, sonst bricht es den Abruf ab –
// dann muss der alte Knopf stehen bleiben.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

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

/** Die Anmeldeseite, direkt eingehängt (wie in anmeldung.test.js). */
async function anmeldeseite({ google, standalone = false }) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    if (standalone) await p.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
    await ersetzeSupabase(p, { google });
    await p.goto(`${server.url}/index.html`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await p.evaluate(async () => {
        window.__erfolg = 0;
        const m = await import('/src/pages/Auth.js');
        document.body.innerHTML = '';
        document.body.appendChild(m.AuthPage(() => { window.__erfolg++; }));
    });
    return { ctx, p, fehler };
}

test('Googles Knopf ersetzt den alten und meldet mit Token und Nonce an', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await anmeldeseite({ google: true });
    try {
        await p.waitForSelector('#googleKnopf .gis-nachbau', { timeout: 10000 });
        assert.equal(await p.isVisible('#googleSignInBtn'), false, 'der alte Knopf blieb stehen');

        const gis = await p.evaluate(() => ({ init: window.__gis.at(-1), knopf: window.__gisKnopf }));
        assert.equal(gis.init.client_id, '756834185649-k8pe270rs7bg6ja5fupq1afg84ms8s89.apps.googleusercontent.com');
        assert.equal(gis.init.auto_select, false);
        // Hell und rund (Jonas, 20.11.2026), so breit wie der alte Knopf.
        assert.equal(gis.knopf.theme, 'outline');
        assert.equal(gis.knopf.shape, 'pill');
        assert.equal(gis.knopf.locale, 'de');
        assert.ok(gis.knopf.width >= 200 && gis.knopf.width <= 400);

        await p.click('#googleKnopf .gis-nachbau');
        await p.waitForFunction(() => window.__erfolg === 1);
        const [eingeloest] = await p.evaluate(() => window.__idToken);
        assert.equal(eingeloest.provider, 'google');
        assert.equal(eingeloest.token, 'google-id-token');
        // Google bekam den SHA-256 der Nonce, Supabase die Nonce selbst.
        assert.equal(crypto.createHash('sha256').update(eingeloest.nonce).digest('hex'), gis.init.nonce);

        // Für den nächsten Versuch eine neue Nonce.
        await p.waitForFunction(n => window.__gis.at(-1).nonce !== n, gis.init.nonce);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('ohne Googles Skript bleibt der alte Knopf', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await anmeldeseite({ google: false });
    try {
        await p.waitForTimeout(800);
        assert.equal(await p.isVisible('#googleSignInBtn'), true);
        assert.equal(await p.isVisible('#googleKnopf'), false);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('auf dem iPhone-Home-Bildschirm bleibt der alte Knopf', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await anmeldeseite({ google: true, standalone: true });
    try {
        await p.waitForTimeout(800);
        assert.equal(await p.isVisible('#googleSignInBtn'), true);
        assert.equal(await p.evaluate(() => window.__gis), undefined, 'Googles Skript wurde trotzdem benutzt');
    } finally { await ctx.close(); }
});
