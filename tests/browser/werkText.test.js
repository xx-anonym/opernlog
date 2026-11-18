// Handlung, Musik & Wissenswertes (daten/werke/<id>.json) auf der Werkseite
// der App: eine zugeklappte Zeile direkt vor den Reviews, die Dauer im Kopf
// (Jonas, 19.11.2026, Variante A). Werke ohne Datei zeigen nichts davon.
// Dazu die Seite für Google: was vorbei ist, fällt weg, Termine rücken nach.

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
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html${hash}`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await vorhangAuf(p);
    return { ctx, p, fehler };
}

test('Tosca: zugeklappt vor den Reviews, Dauer im Kopf; aufgeklappt Handlung, bekannte Stellen, Wissenswertes', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/opera/tosca');
    try {
        const block = p.locator('details.werk-text');
        await block.waitFor({ timeout: 15000 });
        assert.equal((await p.textContent('.werk-text summary')).trim(), 'Handlung, Musik & Wissenswertes');
        assert.equal(await block.evaluate(d => d.open), false);
        // Direkt vor den Reviews.
        assert.equal(await block.evaluate(d => d.nextElementSibling?.querySelector('#reviewsHeading') !== null), true);
        // Die Dauer steht hinter den Akten im Kopf.
        assert.equal(await p.evaluate(() => document.querySelector('[data-meta="akte"]').nextElementSibling?.textContent.trim()), 'ca. 2 Std. ohne Pausen');
        // Zugeklappt nimmt der Block kaum Platz.
        assert.ok((await block.boundingBox()).height < 80);

        await p.click('.werk-text summary');
        assert.equal(await p.locator('.werk-text__akte li').count(), 3);
        assert.match(await p.textContent('.werk-text__akte li:first-child .werk-text__akt'), /^1\. Akt · Kirche Sant’Andrea della Valle$/);
        assert.equal(await p.locator('.werk-text__stellen li').count(), 4);
        assert.equal((await p.textContent('.werk-text__stellen li:nth-child(3) .werk-text__stelle')).trim(), '„Vissi d’arte“');
        assert.match(await p.textContent('.werk-text__innen'), /Bekannte Stellen/);
        assert.equal(await p.locator('.werk-text__wissen li').count(), 3);
        assert.match(await p.textContent('.werk-text__innen'), /verrät das Ende/);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('ein Werk ohne Text: kein Block, keine Dauer, kein Fehler', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/opera/aida');
    try {
        await p.waitForSelector('#reviewsHeading');
        await p.waitForFunction(() => performance.getEntriesByType('resource').some(r => r.name.includes('/daten/werke/aida.json')), null, { timeout: 15000 });
        await p.waitForTimeout(300);
        assert.equal(await p.locator('.werk-text').count(), 0);
        assert.equal(await p.locator('[data-meta="dauer"]').count(), 0);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Seite für Google: Vergangenes fällt weg, Termine rücken auf fünf nach', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    try {
        await p.goto(`${server.url}/oper/tosca/index.html`);
        const zahlen = async () => p.evaluate(() => ({
            vorn: document.querySelectorAll('[data-termine] > ul.termine > li').length,
            hinten: document.querySelectorAll('[data-termine] details.mehr li').length,
            anzeige: Number(document.querySelector('[data-anzahl]')?.textContent),
            erstes: document.querySelector('[data-termine] > ul.termine > li')?.dataset.datum,
        }));
        const heute = await zahlen();
        // Weit in der Zukunft: zuerst vergangen ist, was vorn stand.
        await p.clock.install({ time: new Date(`${heute.erstes}T12:00:00`) });
        const spaeter = new Date(new Date(`${heute.erstes}T12:00:00`).getTime() + 40 * 86400000);
        await p.clock.setSystemTime(spaeter);
        await p.reload();
        const dann = await zahlen();
        const iso = spaeter.toISOString().slice(0, 10);
        assert.equal(dann.vorn, 5);
        assert.ok(dann.erstes >= iso, `${dann.erstes} liegt vor ${iso}`);
        assert.equal(dann.anzeige, dann.hinten);
        assert.ok(dann.vorn + dann.hinten < heute.vorn + heute.hinten);
    } finally { await ctx.close(); }
});
