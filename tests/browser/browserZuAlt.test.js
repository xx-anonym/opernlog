// Ein zu alter Browser (iOS 12, 24.11.2026): statt eines Vorhangs, der nie
// aufgeht, ein Hinweis und der Weg zur Seite ohne App (index.html).
// Nachgestellt, indem Function die neuen Schreibweisen ablehnt – wie dort.

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

async function oeffne(hash, { alt }) {
    const ctx = await browser.newContext({ viewport: { width: 820, height: 1000 }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    if (alt) {
        await p.addInitScript(() => {
            const echt = window.Function;
            window.Function = function (...a) {
                if (String(a.at(-1)).includes('#x')) throw new SyntaxError("Unexpected token '='");
                return echt(...a);
            };
        });
        // Die App selbst startet dort ohnehin nicht.
        await p.route('**/src/main.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: 'export {};' }));
    }
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html${hash}`);
    return { ctx, p };
}

test('zu alter Browser auf einer Werkseite: Hinweis, Link zur Seite ohne App, kein Vorhang', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await oeffne('#/opera/tosca', { alt: true });
    try {
        await p.waitForSelector('#zuAlt');
        assert.equal(await p.locator('#splash').count(), 0);
        assert.match(await p.locator('#zuAlt').innerText(), /zu alt für die App/);
        assert.equal(await p.locator('#zuAlt a').getAttribute('href'), '/oper/tosca/');
        assert.equal(await p.locator('.vorab a[href="/oper/"]').count(), 1, 'die Übersichten bleiben');
        assert.equal(await p.locator('.vorab h2').count(), 1);
        assert.equal(await p.locator('#app > *').count(), 1, 'ein Block, nicht zwei nebeneinander');
    } finally { await ctx.close(); }
});

test('zu alter Browser auf der Startseite: Hinweis ohne Seitenlink', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await oeffne('', { alt: true });
    try {
        await p.waitForSelector('#zuAlt');
        assert.equal(await p.locator('#zuAlt a').count(), 0);
    } finally { await ctx.close(); }
});

test('ein aktueller Browser sieht davon nichts', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await oeffne('#/opera/tosca', { alt: false });
    try {
        await p.waitForSelector('.page--opera-detail', { timeout: 20000 });
        assert.equal(await p.locator('#zuAlt').count(), 0);
        assert.equal(await p.evaluate(() => window.__browserZuAlt), false);
    } finally { await ctx.close(); }
});
