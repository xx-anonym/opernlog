// Der Hinweis aufs Installieren, oben in der Leiste.
//
// Auf dem Handy im Browser steht er immer da und bleibt beim Scrollen oben.
// Der heikle Teil ist nicht der Hinweis, sondern was er verdecken könnte: die
// Leiste wird durch ihn höher, und Inhalt, aufgeklapptes Menü und Fenster
// müssen entsprechend tiefer anfangen.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { starteServer, ladePlaywright, starteBrowser, ersetzeSupabase } from './umgebung.js';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36';

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

async function starte({ userAgent = IPHONE, breite = 390, installiert = false } = {}) {
    const ctx = await browser.newContext({ viewport: { width: breite, height: 800 }, userAgent });
    if (installiert) await ctx.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { value: true }); });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await p.waitForSelector('#splash', { state: 'detached' }).catch(() => {});
    await p.waitForSelector('.main-nav', { timeout: 15000 });
    await p.waitForTimeout(400);
    return { ctx, p, fehler };
}

const unterkante = (p, sel) => p.evaluate(s => document.querySelector(s).getBoundingClientRect().bottom, sel);
const oberkante = (p, sel) => p.evaluate(s => document.querySelector(s).getBoundingClientRect().top, sel);

test('auf dem iPhone im Browser steht der Hinweis oben', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await starte();
    try {
        assert.equal(await p.isVisible('.main-nav .installhinweis'), true);
        assert.match(await p.textContent('.installhinweis'), /Zum Home-Bildschirm/);
        // Über die ganze Breite, ohne seitlich überzulaufen.
        const r = await p.evaluate(() => {
            const h = document.querySelector('.installhinweis').getBoundingClientRect();
            return { links: h.left, rechts: h.right, breite: innerWidth, ueber: document.scrollingElement.scrollWidth - innerWidth };
        });
        assert.equal(r.links, 0);
        assert.equal(Math.round(r.rechts), r.breite);
        assert.equal(r.ueber, 0);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('er bleibt beim Scrollen oben und verdeckt keinen Inhalt', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await starte();
    try {
        const leiste = await unterkante(p, '.main-nav');
        assert.ok(await oberkante(p, '.main-content > *') >= leiste - 1, 'der Seitenanfang liegt unter der Leiste');

        await p.evaluate(() => { location.hash = '#/operas'; });
        await p.waitForTimeout(600);
        await p.mouse.wheel(0, 1500);
        await p.waitForTimeout(300);
        assert.equal(Math.round(await oberkante(p, '.installhinweis')) > 0, true);
        assert.ok(await unterkante(p, '.installhinweis') <= leiste + 1, 'der Hinweis ist mitgescrollt');
        assert.ok(await p.evaluate(() => scrollY) > 500, 'die Seite hat sich gar nicht bewegt');
    } finally { await ctx.close(); }
});

test('das aufgeklappte Menü und Fenster beginnen unter ihm', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await starte();
    try {
        const leiste = await unterkante(p, '.main-nav');
        await p.click('#mobileMenuToggle');
        await p.waitForTimeout(200);
        assert.ok(await oberkante(p, '.nav-links') >= leiste - 1, 'das Menü liegt unter dem Hinweis');
        await p.click('#mobileMenuToggle');

        await p.evaluate(() => { location.hash = '#/profile'; });
        await p.waitForSelector('#editProfileBtn');
        await p.click('#editProfileBtn');
        await p.waitForTimeout(300);
        assert.ok(await oberkante(p, '#editProfileModal .modal__content') >= leiste, 'die Fensterüberschrift liegt unter dem Hinweis');
    } finally { await ctx.close(); }
});

test('auch auf einem kleinen Handy verdeckt er nichts', { skip: fehltPlaywright }, async () => {
    // Bei 320px bricht der Text in drei Zeilen – die Leiste wird noch höher.
    const { ctx, p } = await starte({ breite: 320 });
    try {
        const leiste = await unterkante(p, '.main-nav');
        assert.ok(leiste > 110, `Leiste nur ${leiste}px hoch – bricht der Text nicht um?`);
        assert.ok(await oberkante(p, '.main-content > *') >= leiste - 1);
    } finally { await ctx.close(); }
});

test('installiert steht kein Hinweis da', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await starte({ installiert: true });
    try {
        assert.equal(await p.locator('.installhinweis').count(), 0);
        assert.equal(await p.evaluate(() => document.body.classList.contains('mit-installhinweis')), false);
    } finally { await ctx.close(); }
});

test('am Rechner steht kein Hinweis da', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await starte({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', breite: 1200 });
    try {
        assert.equal(await p.locator('.installhinweis').count(), 0);
    } finally { await ctx.close(); }
});

test('Android: aus dem Angebot des Browsers wird ein Knopf', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await starte({ userAgent: ANDROID });
    try {
        assert.match(await p.textContent('.installhinweis'), /App installieren/, 'ohne Angebot fehlt der Weg übers Menü');
        await p.evaluate(() => {
            window.__installGefragt = 0;
            const e = new Event('beforeinstallprompt', { cancelable: true });
            e.prompt = async () => { window.__installGefragt++; };
            e.userChoice = Promise.resolve({ outcome: 'dismissed' });
            window.dispatchEvent(e);
            window.__chromeEigenes = !e.defaultPrevented;
        });
        await p.waitForSelector('.installhinweis__knopf');
        assert.equal(await p.evaluate(() => window.__chromeEigenes), false, 'Chromes eigene Einblendung stünde zusätzlich da');
        await p.click('.installhinweis__knopf');
        await p.waitForTimeout(200);
        assert.equal(await p.evaluate(() => window.__installGefragt), 1);
        // Abgelehnt: das Angebot ist verbraucht, zurück zum Weg übers Menü.
        assert.equal(await p.locator('.installhinweis__knopf').count(), 0);

        await p.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
        await p.waitForTimeout(100);
        assert.equal(await p.locator('.installhinweis').count(), 0, 'nach dem Installieren steht er noch da');
    } finally { await ctx.close(); }
});
