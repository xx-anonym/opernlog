// Der Hinweis für Admins oben auf der Startseite, wenn der Speicher bei
// Supabase fast voll ist (src/components/SpeicherHinweis.js). Wer kein Admin
// ist, sieht nichts – und für ihn geht auch keine Abfrage hinaus.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { starteServer, ladePlaywright, starteBrowser, ersetzeSupabase, vorhangAuf } from './umgebung.js';

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

async function startseite({ admin, belegt }) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await p.addInitScript(([a, b]) => { window.__istAdminVorgabe = a; window.__speicherBelegt = b; }, [admin, belegt]);
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html#/`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await vorhangAuf(p);
    await p.waitForSelector('.page--home .section__title');
    return { ctx, p, fehler };
}

test('Admin, Fotospeicher zu 95 % voll: Hinweis ganz oben', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await startseite({ admin: true, belegt: { dateien: 950e6, datenbank: 15e6 } });
    try {
        await p.waitForSelector('.speicher-hinweis');
        assert.equal((await p.textContent('.speicher-hinweis')).trim(), 'Fotospeicher zu 95 % voll – 950 MB von 1 GB');
        assert.equal(await p.evaluate(() => document.querySelector('.page--home').firstElementChild.className), 'speicher-hinweis');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Admin, genug Platz: kein Hinweis', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await startseite({ admin: true, belegt: { dateien: 2e6, datenbank: 15e6 } });
    try {
        await p.waitForFunction(() => window.__speicherGefragt >= 1);
        await p.waitForTimeout(200);
        assert.equal(await p.locator('.speicher-hinweis').count(), 0);
    } finally { await ctx.close(); }
});

test('kein Admin: keine Abfrage, kein Hinweis – auch bei vollem Speicher', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await startseite({ admin: false, belegt: { dateien: 990e6, datenbank: 490e6 } });
    try {
        await p.waitForFunction(() => window.__adminAbfragen >= 1);
        await p.waitForTimeout(300);
        assert.equal(await p.evaluate(() => window.__speicherGefragt || 0), 0);
        assert.equal(await p.locator('.speicher-hinweis').count(), 0);
    } finally { await ctx.close(); }
});
