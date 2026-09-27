// Ein Fehler, den in der App niemand abfängt, kommt als Zeile im
// Fehlerprotokoll an – mit der Seite, aber ohne deren Kennungen.

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

test('ein nicht abgefangener Fehler landet im Fehlerprotokoll', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    try {
        await ersetzeSupabase(p);
        await p.goto(`${server.url}/index.html#/opera/tosca`);
        await p.waitForSelector('.detail-hero', { timeout: 15000 });
        await p.evaluate(() => {
            setTimeout(() => { throw new Error('Probe aus dem Test'); }, 0);
            setTimeout(() => { Promise.reject(new Error('Abgelehnt im Test')); }, 0);
        });
        await p.waitForFunction(() => window.__fehlerMeldungen.length >= 2, null, { timeout: 10000 });
        const zeilen = await p.evaluate(() => window.__fehlerMeldungen);
        const probe = zeilen.find(z => /Probe aus dem Test/.test(z.meldung));
        assert.ok(probe, JSON.stringify(zeilen));
        assert.equal(probe.seite, 'opera');
        assert.equal(probe.angemeldet, true);
        assert.match(probe.version, /^\d{4}\.\d{2}\.\d{2}/);
        assert.ok(zeilen.some(z => /Abgelehnt im Test/.test(z.meldung)));
        // Nichts Persönliches: keine Kennung aus der Adresse, keine Nutzer-Id.
        assert.doesNotMatch(JSON.stringify(zeilen), /tosca|11111111-1111/);
    } finally { await ctx.close(); }
});
