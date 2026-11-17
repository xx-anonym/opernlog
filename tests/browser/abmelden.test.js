// Abmelden ohne Ladebildschirm.
//
// Nach dem Abmelden lädt die App neu, damit vom alten Konto nichts im
// Speicher der Seite bleibt. Dabei lief der ganze Vorhang: man sah die
// Anmeldung, dann den Ladebildschirm, dann wieder die Anmeldung – das wirkte
// wie ein Fehler (Jonas, 17.11.2026). Jetzt setzt abgemeldetNeuLaden() eine
// Marke im sessionStorage, und index.html blendet den Vorhang für genau
// dieses eine Laden aus.
//
// Gemessen wird beim DOMContentLoaded, also vor jedem Skript der App: ist
// der Vorhang da schon unsichtbar, sieht ihn niemand.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { starteServer, ladePlaywright, starteBrowser, ersetzeSupabase, vorhangAuf } from './umgebung.js';

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

/** Merkt sich bei jedem Laden, ob der Vorhang beim ersten Aufbau sichtbar war. */
async function vorhangMessen(p) {
    await p.addInitScript(() => {
        document.addEventListener('DOMContentLoaded', () => {
            const vorhang = document.getElementById('splash');
            const liste = JSON.parse(sessionStorage.getItem('__vorhang') || '[]');
            liste.push(!!vorhang && getComputedStyle(vorhang).display !== 'none');
            sessionStorage.setItem('__vorhang', JSON.stringify(liste));
        });
    });
}

const gemessen = (p) => p.evaluate(() => JSON.parse(sessionStorage.getItem('__vorhang') || '[]'));

test('nach dem Abmelden kommt die Anmeldung ohne Ladebildschirm', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const ctx = await browser.newContext({ viewport: HANDY });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    try {
        await ersetzeSupabase(p);
        await vorhangMessen(p);
        await p.goto(`${server.url}/index.html#/profile/user-me`);
        await p.waitForSelector('#logoutBtn', { timeout: 15000 });
        await vorhangAuf(p);
        assert.deepEqual(await gemessen(p), [true], 'beim normalen Start gehört der Vorhang dazu');

        const neuGeladen = p.waitForEvent('load');
        await p.click('#logoutBtn');
        await neuGeladen;
        await p.waitForSelector('.main-content, .auth-page, #app > *', { timeout: 15000 });
        assert.deepEqual(await gemessen(p), [true, false], 'nach dem Abmelden lief der Vorhang');
        assert.equal(await p.evaluate(() => document.getElementById('splash')), null,
            'der ausgeblendete Vorhang bleibt im DOM liegen');

        // Die Marke gilt nur einmal: das nächste Laden hat wieder den Vorhang.
        await p.reload();
        await p.waitForSelector('#app > *', { timeout: 15000 });
        assert.deepEqual(await gemessen(p), [true, false, true], 'die Marke gilt länger als ein Laden');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});
