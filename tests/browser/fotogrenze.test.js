// Höchstens 10 Momentaufnahmen je Kalenderjahr (seit 18.11.2026), außer für
// "Patreon"-Nutzer – das sind alle, die vorher schon ein Konto hatten. Wer die
// Ausnahme hat, sieht nichts davon. Die Grenze setzt die Datenbank durch
// (fotogrenze_migration.sql); die App zeigt sie an, sobald höchstens drei
// Plätze frei sind, und nimmt nicht mehr Fotos an, als Platz ist.

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
const MEIN_ABEND = 'aaaaaaaa-1111-4000-8000-000000000001';
const BESUCHE = [{ id: MEIN_ABEND, user_id: UID, opera_id: 'tosca', house_id: 'semperoper', date: '2026-05-01', rating: 4 }];
const JAHR = new Date().getFullYear();

/** kontingent: frei im Jahr; null = Patreon (keine Grenze). */
async function oeffne(hash, kontingent) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await p.addInitScript(([b, k]) => { window.__besucheVorgabe = b; window.__kontingentVorgabe = k; }, [BESUCHE, kontingent]);
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html${hash}`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await vorhangAuf(p);
    return { ctx, p, fehler };
}

/** n Bilder ins Dateifeld, wie aus der Fotoauswahl. */
async function fotosWaehlen(p, n, feld = '.andenken__neu input') {
    await p.evaluate(async ([n, feld]) => {
        const dt = new DataTransfer();
        for (let i = 0; i < n; i++) {
            const c = document.createElement('canvas');
            c.width = 400; c.height = 300;
            c.getContext('2d').fillRect(0, 0, 10 + i, 10);
            const blob = await new Promise(r => c.toBlob(r, 'image/png'));
            dt.items.add(new File([blob], `foto${i}.png`, { type: 'image/png' }));
        }
        const eingabe = document.querySelector(feld);
        eingabe.files = dt.files;
        eingabe.dispatchEvent(new Event('change', { bubbles: true }));
    }, [n, feld]);
}

const hinweis = p => p.locator('.andenken__grenze');

test('Patreon: kein Hinweis, keine Grenze – nichts verrät die Ausnahme', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne(`#/visit/${MEIN_ABEND}`, null);
    try {
        await p.waitForSelector('.andenken__neu input');
        await p.waitForFunction(() => window.__kontingentGefragt >= 1);
        await fotosWaehlen(p, 6);
        await p.waitForFunction(() => window.__andenken.length === 6, null, { timeout: 30000 });
        assert.equal(await hinweis(p).count(), 0);
        assert.doesNotMatch(await p.textContent('.andenken'), /Jahr|Patreon|\b10\b/);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('noch genug frei: kein Hinweis', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne(`#/visit/${MEIN_ABEND}`, 4);
    try {
        await p.waitForSelector('.andenken__neu input');
        await p.waitForFunction(() => window.__kontingentGefragt >= 1);
        await p.waitForTimeout(200);
        assert.equal(await hinweis(p).count(), 0);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('noch 2 frei, 3 gewählt: 2 gehen hoch, dann ist das Jahr voll und der Knopf weg', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne(`#/visit/${MEIN_ABEND}`, 2);
    try {
        await hinweis(p).waitFor({ timeout: 15000 });
        assert.equal((await hinweis(p).textContent()).trim(), `Noch 2 Fotos in ${JAHR}.`);
        await fotosWaehlen(p, 3);
        await p.locator('.toast', { hasText: `In ${JAHR} gehen noch 2 Fotos` }).waitFor({ timeout: 10000 });
        await p.waitForFunction(() => window.__andenken.length === 2, null, { timeout: 30000 });
        await p.waitForFunction(j => document.querySelector('.andenken__grenze')?.textContent.trim() === `Für ${j} sind alle 10 Fotos vergeben.`, JAHR, { timeout: 10000 });
        assert.equal(await p.locator('.andenken__neu').count(), 0);
        // Kein Fehler: die App hat das dritte gar nicht erst versucht.
        assert.equal(await p.locator('.toast--error').count(), 0);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Jahr voll: kein Knopf, der Hinweis sagt warum', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne(`#/visit/${MEIN_ABEND}`, 0);
    try {
        await hinweis(p).waitFor({ timeout: 15000 });
        assert.equal((await hinweis(p).textContent()).trim(), `Für ${JAHR} sind alle 10 Fotos vergeben.`);
        assert.equal(await p.locator('.andenken__neu').count(), 0);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('lehnt die Datenbank ab (anderes Gerät war schneller), steht da, warum', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne(`#/visit/${MEIN_ABEND}`, 5);
    try {
        await p.waitForSelector('.andenken__neu input');
        await p.waitForFunction(() => window.__kontingentGefragt >= 1);
        await p.evaluate(() => { window.__kontingent = 0; });
        await fotosWaehlen(p, 2);
        await p.locator('.toast', { hasText: 'Für dieses Jahr sind alle Fotos vergeben.' }).waitFor({ timeout: 15000 });
        await hinweis(p).waitFor({ timeout: 10000 });
        assert.equal(await p.locator('.andenken__neu').count(), 0);
        // Nach der ersten Ablehnung kein zweiter Versuch.
        assert.equal(await p.evaluate(() => window.__andenken.length), 0);
        assert.equal(await p.locator('.toast', { hasText: 'Für dieses Jahr' }).count(), 1);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('beim Loggen: die gewählten Fotos zählen schon mit', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/log?house=semperoper&opera=tosca', 1);
    try {
        const feld = '.andenken--auswahl .andenken__neu input';
        await p.waitForSelector(feld);
        await p.waitForFunction(() => window.__kontingentGefragt >= 1);
        await p.waitForFunction(j => document.querySelector('.andenken--auswahl .andenken__grenze')?.textContent.trim() === `Noch 1 Foto in ${j}.`, JAHR);
        await fotosWaehlen(p, 2, feld);
        await p.locator('.toast', { hasText: `In ${JAHR} geht noch ein Foto` }).waitFor({ timeout: 10000 });
        await p.waitForFunction(() => document.querySelectorAll('.andenken--auswahl .andenken__foto').length === 1);
        assert.equal(await p.locator('.andenken--auswahl .andenken__neu').count(), 0);
        assert.equal((await p.textContent('.andenken--auswahl .andenken__grenze')).trim(), `Für ${JAHR} sind alle 10 Fotos vergeben.`);
        // Wieder entfernt: der Platz ist wieder da.
        await p.click('.andenken--auswahl .andenken__weg');
        await p.waitForSelector(feld);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});
