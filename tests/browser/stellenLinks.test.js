// Links zu Aufnahmen für bekannte Stellen (seit 19.11.2026): ein Admin
// hinterlegt zu einer Stelle einen https-Link, jeder Nutzer öffnet ihn mit
// einem Tipp auf die Stelle. Ohne Adminrecht kein Stift.

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

const CALLAS = 'https://www.youtube.com/watch?v=CallasVissi';

async function oeffne({ admin = false, links = [] } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await p.addInitScript(([admin, links]) => { window.__istAdminVorgabe = admin; window.__stellenLinksVorgabe = links; }, [admin, links]);
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html#/opera/tosca`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await vorhangAuf(p);
    await p.waitForSelector('details.werk-text', { timeout: 15000 });
    await p.click('.werk-text summary');
    return { ctx, p, fehler };
}

const stelle = (p, n) => p.locator(`.werk-text__stellen li:nth-child(${n})`);

test('eine verlinkte Stelle öffnet die Aufnahme in einem neuen Tab, ohne Stift für Nutzer', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne({ links: [{ werk_id: 'tosca', stelle: 'Vissi d’arte', url: CALLAS }] });
    try {
        const link = stelle(p, 3).locator('a.werk-text__stelle--link');
        await link.waitFor({ timeout: 10000 });
        assert.equal(await link.getAttribute('href'), CALLAS);
        assert.equal(await link.getAttribute('target'), '_blank');
        assert.match(await link.getAttribute('rel'), /noopener/);
        assert.match(await link.textContent(), /„Vissi d’arte“/);
        // Die anderen Stellen bleiben schlichter Text.
        assert.equal(await stelle(p, 1).locator('a').count(), 0);
        assert.equal(await p.locator('.werk-text__link-knopf').count(), 0);
        // Ein Tipp öffnet die Aufnahme. YouTube selbst wird nicht gefragt –
        // ohne Netz (oder im CI) bliebe der neue Tab sonst eine Fehlerseite.
        // Gewartet wird auf das Laden: beim Ereignis "page" steht im neuen
        // Tab oft noch about:blank, und der Test scheiterte im CI daran.
        await ctx.route('https://www.youtube.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>Aufnahme</title>' }));
        const [neu] = await Promise.all([ctx.waitForEvent('page'), link.click()]);
        await neu.waitForURL(CALLAS, { timeout: 10000 });
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Admin: Stift an jeder Stelle, Link setzen, ändern und entfernen', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne({ admin: true });
    try {
        await p.locator('.werk-text__link-knopf').first().waitFor({ timeout: 10000 });
        assert.equal(await p.locator('.werk-text__link-knopf').count(), 4);

        p.once('dialog', d => d.accept(CALLAS));
        await stelle(p, 3).locator('.werk-text__link-knopf').click();
        await stelle(p, 3).locator('a.werk-text__stelle--link').waitFor();
        assert.deepEqual(await p.evaluate(() => window.__stellenSchreiben.map(s => [s.op, s.werk_id, s.stelle, s.url])),
            [['upsert', 'tosca', 'Vissi d’arte', 'https://www.youtube.com/watch?v=CallasVissi']]);

        // Der Dialog zeigt den bisherigen Link; leer heißt entfernen.
        let vorgabe = null;
        p.once('dialog', d => { vorgabe = d.defaultValue(); d.accept(''); });
        await stelle(p, 3).locator('.werk-text__link-knopf').click();
        await p.waitForFunction(() => window.__stellenSchreiben.length === 2);
        assert.equal(vorgabe, CALLAS);
        assert.equal(await p.evaluate(() => window.__stellenSchreiben[1].op), 'delete');
        await p.waitForFunction(() => !document.querySelector('.werk-text__stellen li:nth-child(3) a'));
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Admin: nur https – javascript: oder http: werden nicht gespeichert', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne({ admin: true });
    try {
        await p.locator('.werk-text__link-knopf').first().waitFor({ timeout: 10000 });
        for (const falsch of ['javascript:alert(1)', 'http://example.org/aufnahme', 'youtube.com/watch']) {
            p.once('dialog', d => d.accept(falsch));
            await stelle(p, 1).locator('.werk-text__link-knopf').click();
            await p.locator('.toast', { hasText: 'vollständige https-Adresse' }).last().waitFor({ timeout: 5000 });
        }
        assert.equal(await p.evaluate(() => window.__stellenSchreiben.length), 0);
        assert.equal(await stelle(p, 1).locator('a').count(), 0);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('ein Link mit Anführungszeichen bricht nicht aus dem Attribut aus', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const boese = 'https://example.org/"><img src=x onerror=window.__boese=1>';
    const { ctx, p, fehler } = await oeffne({ links: [{ werk_id: 'tosca', stelle: 'Te Deum', url: boese }] });
    try {
        const link = stelle(p, 2).locator('a.werk-text__stelle--link');
        await link.waitFor({ timeout: 10000 });
        assert.equal(await link.getAttribute('href'), boese);
        assert.equal(await p.locator('.werk-text__stellen img').count(), 0);
        assert.equal(await p.evaluate(() => window.__boese), undefined);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});
