// Die Animation der Mailvorlagen im echten Browser.
//
// Apple Mail spielt sie, Gmail und Outlook nicht. Versprochen ist: am Ende
// steht genau die unbewegte Mail, und wer "Bewegung reduzieren" eingeschaltet
// hat, sieht gar keine Bewegung. Die Regeln dafür prüft
// tests/checks/mailvorlagen.test.js am Text; hier wird nachgesehen, ob der
// Browser es auch so rendert.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { starteServer, ladePlaywright, starteBrowser } from './umgebung.js';
import { MAILS } from '../werkzeug/mailvorlagen.mjs';

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

/** Was sichtbar ist, an jedem Element: Deckkraft, Verschiebung, Schatten. */
const zustand = (p) => p.evaluate(() => [...document.querySelectorAll('body *')]
    .filter(el => !el.closest('div[style*="display:none"]') && el.tagName !== 'STYLE')
    .map(el => {
        const s = getComputedStyle(el);
        return [el.tagName, el.className, s.opacity, s.transform, s.boxShadow, s.filter, s.backgroundPosition].join('|');
    }));

async function seite(datei, { reducedMotion = 'no-preference' } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, reducedMotion });
    const p = await ctx.newPage();
    // Schriften und Logo kommen in der Mail von opernlog.vercel.app – hier vom eigenen Server.
    await p.route('https://opernlog.vercel.app/**', r => r.fulfill({ path: `${process.cwd()}${new URL(r.request().url()).pathname}` }));
    await p.goto(`${server.url}/supabase/templates/${datei}`);
    await p.waitForLoadState('load');
    return { ctx, p };
}

for (const { datei } of MAILS) {
    test(`${datei}: nach dem Auftritt genau wie ohne Animation`, { skip: fehltPlaywright }, async () => {
        const ruhig = await seite(datei, { reducedMotion: 'reduce' });
        const bewegt = await seite(datei);
        try {
            assert.equal(await ruhig.p.evaluate(() => document.getAnimations().length), 0,
                'mit "Bewegung reduzieren" läuft trotzdem etwas');
            assert.ok(await bewegt.p.evaluate(() => document.getAnimations().length) >= 8, 'keine Animation');

            // Mittendrin ist wirklich etwas verborgen – sonst prüfte der Test nichts.
            await bewegt.p.evaluate(() => document.getAnimations().forEach(a => { a.pause(); a.currentTime = 0; }));
            assert.equal(await bewegt.p.$eval('h1', el => getComputedStyle(el).opacity), '0');

            await bewegt.p.evaluate(() => document.getAnimations().forEach(a => a.finish()));
            assert.deepEqual(await zustand(bewegt.p), await zustand(ruhig.p));
        } finally {
            await ruhig.ctx.close();
            await bewegt.ctx.close();
        }
    });
}
