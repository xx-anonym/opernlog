// Listen: Häuser-Listen, Likes, und was beim Loggen mit der Wunschliste geschieht.
//
// Funde der Durchsicht vom 23.09.2026:
// - Das Like auf einer Liste warf (span:first-child fand das SVG-Herz
//   nicht); die Zahl blieb stehen, obwohl der Like gespeichert war.
// - Häuser in Listen zeigten "Dresden, undefined" und kein Bild: die Karte
//   las country, yearBuilt und image – Felder, die ein Haus nicht hat.
// - Scheiterte nach dem Speichern eines Besuchs das Austragen von der
//   Wunschliste, hieß es "Besuch konnte nicht gespeichert werden" – wer es
//   dann noch einmal versuchte, hatte den Abend doppelt.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { starteServer, ladePlaywright, starteBrowser, ersetzeSupabase } from './umgebung.js';

const HANDY = { width: 390, height: 900 };

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

async function mitListen(listen) {
    const ctx = await browser.newContext({ viewport: HANDY });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html`);
    await p.waitForSelector('.main-content', { timeout: 15000 });
    await p.waitForFunction(() => import('/src/store/store.js').then(m => m.store.isCloud));
    await p.evaluate(l => import('/src/store/store.js').then(m => { m.store.data.myLists = l; }), listen);
    return { ctx, p, fehler };
}

const liste = (id, type, items) => ({ id, userId: 'user-me', name: `Liste ${id}`, type, items, likes: 0, comments: [] });

test('Häuser in einer Liste: Stadt und Land, Gründung, Bild', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await mitListen([liste('l1', 'houses', ['semperoper'])]);
    try {
        await p.evaluate(() => { location.hash = '#/list/l1'; });
        await p.waitForSelector('.list-detail-card');
        const text = await p.locator('.list-detail-card').innerText();
        assert.doesNotMatch(text, /undefined/);
        assert.match(text, /Dresden, Sachsen/);
        assert.match(text, /Gegründet 1841/);
        assert.match(await p.locator('.list-detail-card__image').getAttribute('style'), /upload\.wikimedia\.org/);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Like auf einer Liste: Herz und Zahl ändern sich, ohne Fehler', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await mitListen([liste('l2', 'operas', ['tosca'])]);
    try {
        await p.evaluate(() => { location.hash = '#/list/l2'; });
        await p.waitForSelector('#listLikeBtn');
        await p.click('#listLikeBtn');
        await p.waitForTimeout(300);
        assert.equal(await p.locator('#listLikeCount').innerText(), '1');
        assert.equal(await p.getAttribute('#listLikeBtn', 'class').then(c => c.includes('btn-icon--active')), true);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('scheitert der Like, dreht die Anzeige zurück und sagt es', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await mitListen([liste('l3', 'operas', ['tosca'])]);
    try {
        await p.evaluate(() => { window.__likeFehler = 'Netz weg'; location.hash = '#/list/l3'; });
        await p.waitForSelector('#listLikeBtn');
        await p.click('#listLikeBtn');
        await p.waitForSelector('.toast');
        assert.match(await p.locator('.toast').last().innerText(), /Like konnte nicht gespeichert werden/);
        assert.equal(await p.locator('#listLikeCount').innerText(), '0');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Loggen eines Werks von der Wunschliste: gespeichert ist gespeichert, auch wenn das Austragen scheitert', { skip: fehltPlaywright }, async () => {
    // Der Ersatz lehnt jedes Ändern einer Liste ab ("keine Zeile betroffen").
    const { ctx, p } = await mitListen([liste('w1', 'wishlist', ['tosca'])]);
    try {
        await p.evaluate(() => { location.hash = '#/log?house=semperoper&opera=tosca'; });
        await p.waitForSelector('#logForm');
        await p.locator('#ratingWidget .star').nth(3).click();
        await p.click('#logForm button[type="submit"]');
        await p.waitForSelector('.toast');
        assert.match(await p.locator('.toast').last().innerText(), /erfolgreich geloggt/);
        assert.equal((await p.evaluate(() => window.__visits)).length, 1);
    } finally { await ctx.close(); }
});

test('eine unbekannte Oper, ein unbekanntes Haus: keine Sackgasse, ein Weg zurück', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await mitListen([]);
    try {
        for (const [adresse, ziel] of [['#/opera/gibt-es-nicht', '#/operas'], ['#/house/gibt-es-nicht', '#/houses']]) {
            await p.evaluate(h => { location.hash = h; }, adresse);
            await p.waitForSelector(`.empty-state a[href="${ziel}"]`);
        }
    } finally { await ctx.close(); }
});
