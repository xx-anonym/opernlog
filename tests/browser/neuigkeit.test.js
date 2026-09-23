// "Neu in OpernLog" – das Fenster zum letzten großen Update.
//
// Einmal je Gerät für Konten von vorher, nie für neue Konten, und der Knopf
// zur Wunschliste führt dorthin.

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

async function oeffne(p) {
    await ersetzeSupabase(p, { neuigkeit: true });
    await p.goto(`${server.url}/index.html`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await p.waitForSelector('#splash', { state: 'detached' }).catch(() => {});
}

/**
 * Das Fenster schließen und warten, bis die Zurück-Geste ihren Eintrag im
 * Verlauf wieder weggenommen hat (history.back). Wer vorher neu lädt, dem
 * bricht diese Navigation das Neuladen ab – auf dem CI-Rechner geschehen.
 */
async function schliessenUndAbwarten(p, schliessen) {
    await p.evaluate(() => {
        window.__zurueck = new Promise(r => {
            addEventListener('popstate', () => setTimeout(r, 100), { once: true });
            setTimeout(r, 3000);
        });
    });
    await schliessen();
    await p.evaluate(() => window.__zurueck);
}

async function starte({ neuesKonto = false } = {}) {
    // Ohne Service Worker: sonst holte er beim Neuladen die echte
    // Supabase-Bibliothek statt des Ersatzes, und niemand wäre angemeldet.
    const ctx = await browser.newContext({ viewport: HANDY, serviceWorkers: 'block' });
    // Das Testprofil ist von 2024; neuesKonto legt es eine Minute vor dem
    // Test an – also sicher nach dem Update.
    if (neuesKonto) await ctx.addInitScript(() => { window.__profilErstellt = new Date(Date.now() - 60e3).toISOString(); });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await oeffne(p);
    return { ctx, p, fehler };
}

test('ein Konto von vorher sieht die Neuigkeit einmal', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await starte();
    try {
        const fenster = p.locator('.neuigkeit');
        await fenster.waitFor({ timeout: 10000 });
        const text = await fenster.innerText();
        assert.match(text, /Wo deine Opern gerade laufen/);
        assert.match(text, /[\d.]+ Termine an \d+ Häusern/);
        assert.match(text, /Aktuelle Termine/);
        await schliessenUndAbwarten(p, () => p.click('#neuigkeitSchliessen'));
        assert.equal(await fenster.count(), 0);
        // Beim nächsten Start nicht wieder. Gewartet wird, bis die Startseite
        // steht – dort käme das Fenster sonst.
        await p.reload();
        await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
        await p.waitForSelector('#splash', { state: 'detached' }).catch(() => {});
        await p.waitForSelector('.nav-links', { state: 'attached', timeout: 15000 });
        await p.waitForTimeout(2500);
        assert.equal(await p.locator('.neuigkeit').count(), 0);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('„Zur Wunschliste“ führt dorthin und schließt das Fenster', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await starte();
    try {
        await p.locator('.neuigkeit').waitFor({ timeout: 10000 });
        await p.click('#neuigkeitWunschliste');
        await p.waitForFunction(() => location.hash === '#/wishlist');
        assert.equal(await p.locator('.neuigkeit').count(), 0);
        assert.equal(await p.evaluate(() => localStorage.getItem('opernlog:neuigkeitGesehen')), '2026-09-spielplaene');
    } finally { await ctx.close(); }
});

test('ein neues Konto bekommt keine Ankündigung', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await starte({ neuesKonto: true });
    try {
        await p.waitForTimeout(2000);
        assert.equal(await p.locator('.neuigkeit').count(), 0);
    } finally { await ctx.close(); }
});

test('gesehen ist es erst nach dem Schließen, nicht schon beim Zeigen', { skip: fehltPlaywright }, async () => {
    // Wer die App schließt, während das Fenster offen ist, bekommt es beim
    // nächsten Start wieder.
    const { ctx, p } = await starte();
    try {
        await p.locator('.neuigkeit').waitFor({ timeout: 10000 });
        // Weg, ohne gesehen zu sein – etwa weil die App geschlossen wurde.
        await schliessenUndAbwarten(p, () => p.evaluate(() => document.querySelector('.neuigkeit').remove()));
        await p.reload();
        await p.locator('.neuigkeit').waitFor({ timeout: 10000 });
    } finally { await ctx.close(); }
});
