// Fehler vor dem Start der App: scheitert das Laden, meldet das Stück in
// index.html selbst; startet die App, übernimmt sie, was es sich gemerkt hat.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { starteServer, ladePlaywright, starteBrowser, ersetzeSupabase } from './umgebung.js';
import { STUB } from './supabaseStub.js';

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

async function seite() {
    const ctx = await browser.newContext({ viewport: { width: 800, height: 700 }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    await ersetzeSupabase(p);
    // Was direkt an die Datenbank ginge, hier mitschreiben.
    const direkt = [];
    await p.route('https://*.supabase.co/rest/v1/fehlerprotokoll', (r) => {
        direkt.push(JSON.parse(r.request().postData() || '[]'));
        return r.fulfill({ status: 201, body: '' });
    });
    return { ctx, p, direkt };
}

test('fehlt eine Datei der App, meldet das Stück in index.html den Fehler selbst', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, direkt } = await seite();
    try {
        await p.route('**/src/store/store.js', r => r.fulfill({ status: 404, body: 'weg' }));
        await p.goto(`${server.url}/index.html#/diary`);
        await p.waitForFunction(() => true);
        await p.waitForTimeout(5500);
        assert.equal(direkt.length, 1, JSON.stringify(direkt));
        const [zeile] = direkt[0];
        assert.match(zeile.meldung, /Skript ließ sich nicht laden/);
        assert.equal(zeile.stelle, '/src/main.js');
        assert.equal(zeile.seite, 'diary');
        assert.equal(zeile.angemeldet, false);
    } finally { await ctx.close(); }
});

test('startet die App, geht ein früher Fehler den üblichen Weg und nichts direkt', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, direkt } = await seite();
    try {
        // Die Bibliothek wirft am Ende – nach dem Stück in index.html, vor main.js.
        await p.route('**/vendor/supabase-js.js', r => r.fulfill({ status: 200, contentType: 'text/javascript',
            body: `${STUB}\nthrow new Error('Früher Fehler im Test');` }));
        await p.goto(`${server.url}/index.html`);
        await p.waitForFunction(() => window.__fehlerMeldungen?.some(z => /Früher Fehler im Test/.test(z.meldung)), null, { timeout: 15000 });
        await p.waitForTimeout(5000);
        assert.equal(direkt.length, 0);
    } finally { await ctx.close(); }
});
