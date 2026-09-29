// Der Abgleich mit der Cloud, wenn die App wieder in den Vordergrund kommt:
// die Bereiche laden gleichzeitig statt nacheinander, und ob jemand Admin
// ist, fragt die App je Sitzung nur einmal.

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

async function oeffnen() {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await p.waitForSelector('.main-content', { timeout: 15000 });
    return { ctx, p, fehler };
}

test('bei der Rückkehr in die App laden Listen, Abende, Markierungen und Vorschläge gleichzeitig', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffnen();
    try {
        await p.evaluate(() => { window.location.hash = '#/profile'; });
        await p.waitForSelector('#editProfileBtn');
        await p.waitForFunction(() => window.__unterwegs === 0);
        // Jede Antwort braucht jetzt 150 ms. Nacheinander wäre höchstens eine
        // Abfrage unterwegs, gleichzeitig mehrere.
        await p.evaluate(() => {
            window.__verzoegerung = 150;
            window.__hoechstensUnterwegs = 0;
            document.dispatchEvent(new Event('visibilitychange'));
        });
        await p.waitForFunction(() => window.__hoechstensUnterwegs > 0);
        await p.waitForFunction(() => window.__unterwegs === 0, null, { timeout: 15000 });
        const hoechstens = await p.evaluate(() => window.__hoechstensUnterwegs);
        assert.ok(hoechstens >= 4, `höchstens ${hoechstens} Abfragen gleichzeitig`);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('ob man Admin ist, fragt die App je Sitzung einmal, nicht bei jedem Seitenwechsel', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await oeffnen();
    try {
        for (const [ziel, warten] of [['#/operas', '#operaSearch'], ['#/houses', '#houseSearch'], ['#/opera/tosca', '.detail-hero'],
            ['#/house/semperoper', '.detail-hero'], ['#/operas', '#operaSearch']]) {
            await p.evaluate((h) => { window.location.hash = h; }, ziel);
            await p.waitForSelector(warten);
            await p.waitForFunction(() => window.__unterwegs === 0);
        }
        assert.equal(await p.evaluate(() => window.__adminAbfragen), 1);
    } finally { await ctx.close(); }
});
