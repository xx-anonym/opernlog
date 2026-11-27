// Wege in der App, die es nicht gibt (27.11.2026): deutsche Kurzformen wie
// auf den öffentlichen Seiten (#/oper/tosca) führen zur richtigen Seite,
// alles andere zeigt "Der Vorhang bleibt zu" statt still die Startseite.

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

async function oeffne(hash) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html${hash}`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await vorhangAuf(p);
    return { ctx, p, fehler };
}

test('#/oper/tosca führt zur Werkseite, #/oper/ zur Übersicht', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/oper/tosca');
    try {
        await p.waitForSelector('.page--opera-detail', { timeout: 15000 });
        assert.equal(await p.evaluate(() => location.hash), '#/opera/tosca');
        await p.evaluate(() => { location.hash = '#/haus/semperoper'; });
        await p.waitForFunction(() => location.hash === '#/house/semperoper', null, { timeout: 10000 });
        await p.evaluate(() => { location.hash = '#/oper/'; });
        await p.waitForFunction(() => location.hash === '#/operas', null, { timeout: 10000 });
        await p.waitForSelector('#operaSearch', { timeout: 15000 });
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('ein unbekannter Weg: "Der Vorhang bleibt zu", nicht die Startseite', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/gibtsnicht');
    try {
        await p.waitForSelector('.nicht-gefunden', { timeout: 15000 });
        assert.match(await p.locator('.nicht-gefunden').innerText(), /Der Vorhang bleibt zu/);
        await p.click('.nicht-gefunden .btn');
        await p.waitForFunction(() => location.hash === '#/', null, { timeout: 5000 });
        // Die Startseite wird erst gebaut, wenn der Wechsel durch ist.
        await p.waitForFunction(() => !document.querySelector('.nicht-gefunden'), null, { timeout: 10000 });
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});
