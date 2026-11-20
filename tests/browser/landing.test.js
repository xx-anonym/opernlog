// Die Werbeseite für Besucher ohne Konto (src/components/Landing.js, seit
// 20.11.2026): auf #/ zuerst sie, mit eigenem Kopf statt Leiste und Menü.
// "Erst mal stöbern" führt für die Sitzung zur gewohnten Startseite,
// "Kostenlos starten" zur Anmeldung beim Registrieren. Angemeldet: nie.

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

async function oeffne({ abgemeldet = true, hash = '#/' } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    // Wikimedia wird nicht gefragt: leere Bilder genügen.
    await ctx.route('https://upload.wikimedia.org/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.alloc(0) }));
    if (abgemeldet) await p.addInitScript(() => { window.__ohneSitzungVorgabe = true; });
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html${hash}`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await vorhangAuf(p);
    return { ctx, p, fehler };
}

test('ohne Konto: auf #/ die Werbeseite, ohne Leiste und Menü der App', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne();
    try {
        await p.waitForSelector('.landing');
        assert.match(await p.textContent('.landing__titel'), /Jeder Opernabend, festgehalten\./);
        assert.equal(await p.isVisible('.main-nav'), false);
        assert.equal(await p.evaluate(() => document.body.classList.contains('mit-landing')), true);
        // Die Wand: Bilder aus dem Katalog in der kleinen Fassung.
        const quellen = await p.$$eval('.landing__wand img', b => b.map(i => i.getAttribute('src')));
        assert.ok(quellen.length >= 12);
        for (const q of quellen) assert.match(q, /^https:\/\/upload\.wikimedia\.org\/.+\/250px-/);
        // Wer woandershin geht, hat die App wieder ganz.
        await p.evaluate(() => { location.hash = '#/operas'; });
        await p.waitForSelector('#operaSearch');
        assert.equal(await p.evaluate(() => document.body.classList.contains('mit-landing')), false);
        assert.equal(await p.isVisible('.main-nav'), true);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('"Erst mal stöbern" zeigt die gewohnte Startseite – für die ganze Sitzung', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne();
    try {
        await p.click('.landing [data-stoebern]');
        await p.waitForSelector('.main-nav', { state: 'visible' });
        assert.equal(await p.locator('.landing').count(), 0);
        await p.reload();
        await vorhangAuf(p);
        await p.waitForSelector('.main-nav', { state: 'visible' });
        await p.waitForTimeout(300);
        assert.equal(await p.locator('.landing').count(), 0);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('"Kostenlos starten" öffnet die Anmeldung beim Registrieren', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne();
    try {
        await p.click('.landing__mitte [data-registrieren]');
        await p.waitForSelector('#registerForm', { state: 'visible' });
        assert.equal(await p.getAttribute('.auth-tab--active', 'data-tab'), 'register');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('angemeldet nie die Werbeseite', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await oeffne({ abgemeldet: false });
    try {
        await p.waitForSelector('.main-nav', { state: 'visible' });
        await p.waitForTimeout(500);
        assert.equal(await p.locator('.landing').count(), 0);
    } finally { await ctx.close(); }
});
