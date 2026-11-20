// "Kennst du jemanden, der auch in die Oper geht?" (src/einladenHinweis.js,
// seit 20.11.2026): einmal, gleich nach dem Loggen, ab drei Abenden im
// Tagebuch. Danach nie wieder.

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

const UID = '11111111-1111-1111-1111-111111111111';
const abend = (n, opera) => ({ id: `aaaaaaaa-1111-4000-8000-00000000000${n}`, user_id: UID, opera_id: opera, house_id: 'semperoper', date: `2026-0${n}-01`, rating: 4 });
const DREI = [abend(1, 'tosca'), abend(2, 'aida'), abend(3, 'carmen')];

/** Das Tagebuch, als wäre eben geloggt worden (oder nicht). */
async function tagebuch({ besuche = DREI, geloggt = true, gefragt = false } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: 'block' });
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await p.addInitScript(([b, g, f]) => {
        window.__besucheVorgabe = b;
        // Kein Teilen-Menü: der Link landet in der Zwischenablage.
        Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
        if (g) sessionStorage.setItem('opernlog:geradeGeloggt', '1');
        if (f) localStorage.setItem('opernlog:einladenGefragt', '2026-11-01');
    }, [besuche, geloggt, gefragt]);
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html#/diary`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await vorhangAuf(p);
    await p.waitForSelector('#diarySubtitle:has-text("geloggt")', { timeout: 15000 });
    await p.waitForTimeout(300);
    return { ctx, p, fehler };
}

test('nach dem dritten Abend fragt das Tagebuch einmal, "Einladen" kopiert den Link', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await tagebuch();
    try {
        await p.waitForSelector('.einladen-hinweis', { timeout: 5000 });
        assert.match(await p.textContent('.einladen-hinweis'), /Kennst du jemanden, der auch in die Oper geht\?/);
        assert.ok(await p.evaluate(() => localStorage.getItem('opernlog:einladenGefragt')), 'nicht vermerkt');

        await p.click('.einladen-hinweis [data-einladen]');
        await p.waitForSelector('.toast:has-text("Einladungslink kopiert")');
        assert.equal(await p.locator('.einladen-hinweis').count(), 0);
        assert.match(await p.evaluate(() => navigator.clipboard.readText()), /#\/invite\/[A-Z0-9]{4,16}$/);

        // Neu geladen, wieder gerade geloggt: keine zweite Frage.
        await p.evaluate(() => sessionStorage.setItem('opernlog:geradeGeloggt', '1'));
        await p.reload();
        await vorhangAuf(p);
        await p.waitForSelector('#diarySubtitle:has-text("3 Besuche")', { timeout: 15000 });
        await p.waitForTimeout(300);
        assert.equal(await p.locator('.einladen-hinweis').count(), 0);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('"Nein danke" schließt die Zeile', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await tagebuch();
    try {
        await p.click('.einladen-hinweis [data-weg]');
        assert.equal(await p.locator('.einladen-hinweis').count(), 0);
    } finally { await ctx.close(); }
});

test('nicht ohne Loggen, nicht unter drei Abenden, nicht nach einer früheren Frage', { skip: fehltPlaywright, timeout: 90000 }, async () => {
    for (const fall of [{ geloggt: false }, { besuche: DREI.slice(0, 2) }, { gefragt: true }]) {
        const { ctx, p } = await tagebuch(fall);
        try {
            assert.equal(await p.locator('.einladen-hinweis').count(), 0, JSON.stringify(fall));
        } finally { await ctx.close(); }
    }
});
