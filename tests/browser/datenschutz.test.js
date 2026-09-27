// Die Datenschutzseite: klein verlinkt unter "Konto löschen" und unter der
// Anmeldung, erreichbar ohne Anmeldung.

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

test('der kleine Link unter "Konto löschen" führt zur Datenschutzseite', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    try {
        await ersetzeSupabase(p);
        await p.goto(`${server.url}/index.html#/profile`);
        await p.waitForSelector('#editProfileBtn', { timeout: 15000 });
        await vorhangAuf(p);
        await p.click('#editProfileBtn');
        const link = p.locator('#profilKonto a.rechtstext-link');
        await link.scrollIntoViewIfNeeded();
        await link.click();
        await p.waitForFunction(() => location.hash === '#/datenschutz');
        await p.waitForSelector('.rechtstext h1');
        assert.equal((await p.textContent('.rechtstext h1')).trim(), 'Datenschutz');
        assert.match(await p.textContent('.rechtstext'), /Wer was sehen kann/);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('die Anmeldeseite hat den Link', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    try {
        await ersetzeSupabase(p);
        await p.goto(`${server.url}/index.html#/auth`);
        await p.waitForSelector('.auth-container a.rechtstext-link', { timeout: 15000 });
        await p.evaluate(() => { location.hash = '#/datenschutz'; });
        await p.waitForSelector('.rechtstext h1');
    } finally { await ctx.close(); }
});
