// "In den Kalender" neben einem Haus in "Läuft demnächst".
//
// Der Spielplan ist durch feste Daten ersetzt (wie in werkTermine.test.js).
// Geprüft wird der ganze Weg: Knopf, Wahl des Abends, heruntergeladene
// Datei mit Ort, Uhrzeit und Link. Auf dem iPhone öffnet sich statt eines
// Downloads die Datei unter kalender/; die letzte Prüfung nimmt dafür den
// echten Spielplan und holt die Datei vom Server.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

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

const heute = new Date();
const iso = tage => { const d = new Date(heute); d.setDate(d.getDate() + tage); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const SPIELPLAN = `
export const SPIELPLAN_STAND = '${iso(-1)}';
export const SPIELPLAN_ZUSATZWERKE = [];
export const spielplan = [
  { werk: 'tosca', haus: 'semperoper', url: 'https://www.semperoper.de/tosca', termine: ['${iso(-3)}', '${iso(5)}', '${iso(9)}'],
    zeiten: { '${iso(-3)}': '19:00', '${iso(5)}': '19:00-22:30' } },
];`;

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1';

async function werkseite({ userAgent, installiert = false } = {}) {
    const ctx = await browser.newContext({ viewport: HANDY, acceptDownloads: true, ...(userAgent ? { userAgent } : {}) });
    // window.open mitschreiben statt ein Fenster zu öffnen
    await ctx.addInitScript(() => { window.__geoeffnet = []; window.open = (u, z) => { window.__geoeffnet.push([u, z]); return null; }; });
    // vom Home-Bildschirm gestartet
    if (installiert) await ctx.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await p.route('**/src/data/spielplan.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: SPIELPLAN }));
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html#/opera/tosca`);
    await p.waitForSelector('#termineToggle', { timeout: 15000 });
    await p.click('#termineToggle');
    await p.locator('#operaTermine .spielplan-zeile__kalender').first().waitFor();
    return { ctx, p, fehler };
}

test('der Kalender steht neben dem Haus, nicht im Link', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await werkseite();
    try {
        assert.equal(await p.locator('#operaTermine a .spielplan-zeile__kalender').count(), 0);
        assert.match(await p.locator('#operaTermine .spielplan-zeile__kalender').first().getAttribute('aria-label'), /In den Kalender: Semperoper/);
    } finally { await ctx.close(); }
});

test('wählen, herunterladen: die Datei hat Ort, Uhrzeit und Link', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await werkseite();
    try {
        const vorher = ctx.pages().length;
        await p.click('#operaTermine .spielplan-zeile__kalender');
        const tage = p.locator('.kalender-wahl .kalender-wahl__tag');
        await tage.first().waitFor();
        // Nur Kommendes; bekannte Zeit oder "Uhrzeit offen"
        assert.equal(await tage.count(), 2);
        assert.match(await tage.nth(0).innerText(), /19:00–22:30/);
        assert.match(await tage.nth(1).innerText(), /Uhrzeit offen/);
        // Der Klick auf den Kalender hat keine Seite des Hauses geöffnet.
        assert.equal(ctx.pages().length, vorher);

        const [download] = await Promise.all([p.waitForEvent('download'), tage.nth(0).click()]);
        assert.equal(download.suggestedFilename(), `tosca-semperoper-${iso(5)}.ics`);
        const ics = fs.readFileSync(await download.path(), 'utf8').replace(/\r\n /g, '');
        const tag = iso(5).replace(/-/g, '');
        assert.match(ics, new RegExp(`DTSTART;TZID=Europe/Berlin:${tag}T190000`));
        assert.match(ics, new RegExp(`DTEND;TZID=Europe/Berlin:${tag}T223000`));
        assert.match(ics, /SUMMARY:Tosca – Semperoper/);
        assert.match(ics, /LOCATION:Semperoper\\, Dresden/);
        assert.match(ics, /URL:https:\/\/www\.semperoper\.de\/tosca/);
        assert.equal(await p.locator('.kalender-wahl').count(), 0, 'das Fenster ist zu');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('ohne Uhrzeit wird es ein ganztägiger Eintrag', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await werkseite();
    try {
        await p.click('#operaTermine .spielplan-zeile__kalender');
        const [download] = await Promise.all([p.waitForEvent('download'), p.locator('.kalender-wahl__tag').nth(1).click()]);
        const ics = fs.readFileSync(await download.path(), 'utf8');
        assert.match(ics, new RegExp(`DTSTART;VALUE=DATE:${iso(9).replace(/-/g, '')}`));
    } finally { await ctx.close(); }
});

test('Abbrechen schließt ohne Datei', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await werkseite();
    try {
        let geladen = false;
        p.on('download', () => { geladen = true; });
        await p.click('#operaTermine .spielplan-zeile__kalender');
        await p.click('#kalenderWahlAbbrechen');
        await p.waitForTimeout(300);
        assert.equal(await p.locator('.kalender-wahl').count(), 0);
        assert.equal(geladen, false);
    } finally { await ctx.close(); }
});

test('auf dem iPhone öffnet sich die Datei vom Server in einem eigenen Fenster', { skip: fehltPlaywright }, async () => {
    // Nicht blob: – das Fenster, das iOS aus der installierten App öffnet,
    // sieht eine im Browser erzeugte Datei nicht und bleibt leer.
    const { ctx, p } = await werkseite({ userAgent: IPHONE });
    try {
        let geladen = false;
        p.on('download', () => { geladen = true; });
        await p.click('#operaTermine .spielplan-zeile__kalender');
        await p.locator('.kalender-wahl__tag').first().click();
        await p.waitForTimeout(300);
        const geoeffnet = await p.evaluate(() => window.__geoeffnet);
        assert.deepEqual(geoeffnet, [[`${server.url}/kalender/tosca-semperoper-${iso(5)}.ics`, '_blank']]);
        assert.equal(geladen, false);
    } finally { await ctx.close(); }
});

test('in der installierten iPhone-App öffnet sich kein eigenes Fenster', { skip: fehltPlaywright }, async () => {
    // Das Fenster bliebe leer; die Adresse geht an Safari (x-safari-https:,
    // siehe tests/unit/kalender.test.js). Hier: kein Fenster, kein Download,
    // kein Fehler, und die App steht danach noch.
    const { ctx, p, fehler } = await werkseite({ userAgent: IPHONE, installiert: true });
    try {
        let geladen = false;
        p.on('download', () => { geladen = true; });
        await p.click('#operaTermine .spielplan-zeile__kalender');
        await p.locator('.kalender-wahl__tag').first().click();
        await p.waitForTimeout(500);
        assert.deepEqual(await p.evaluate(() => window.__geoeffnet), []);
        assert.equal(geladen, false);
        assert.deepEqual(fehler, []);
        assert.equal(await p.locator('#termineToggle').count(), 1, 'die Werkseite steht noch');
    } finally { await ctx.close(); }
});

test('die Datei, die das iPhone öffnet, liegt mit echtem Spielplan auch bereit', { skip: fehltPlaywright }, async () => {
    const { spielplan } = await import('../../src/data/spielplan.js');
    const { operas } = await import('../../src/data/operas.js');
    const heuteIso = iso(0);
    const werk = spielplan.find(e => operas.some(o => o.id === e.werk) && e.termine.some(t => t >= heuteIso))?.werk;
    if (!werk) return;   // Spielzeit vorbei, nichts mehr anzubieten

    const ctx = await browser.newContext({ viewport: HANDY, userAgent: IPHONE });
    await ctx.addInitScript(() => { window.__geoeffnet = []; window.open = (u, z) => { window.__geoeffnet.push([u, z]); return null; }; });
    const p = await ctx.newPage();
    try {
        await ersetzeSupabase(p);
        await p.goto(`${server.url}/index.html#/opera/${werk}`);
        await p.waitForSelector('#termineToggle', { timeout: 15000 });
        await p.click('#termineToggle');
        // Das erste Haus, das die Seite zeigt – sichtbar sind nur drei, und
        // welche das sind, hängt vom Spielplan ab.
        const knopf = p.locator('#operaTermine .spielplan-zeile__kalender').first();
        const haus = await knopf.getAttribute('data-haus');
        const eintrag = spielplan.find(e => e.werk === werk && e.haus === haus);
        await knopf.click();
        await p.locator('.kalender-wahl__tag').first().click();
        await p.waitForTimeout(300);
        const [[adresse]] = await p.evaluate(() => window.__geoeffnet);

        const antwort = await fetch(adresse);
        assert.equal(antwort.status, 200, adresse);
        assert.match(antwort.headers.get('content-type'), /^text\/calendar/);
        const ics = await antwort.text();
        const erster = eintrag.termine.find(t => t >= heuteIso);
        assert.match(ics, new RegExp(`UID:${eintrag.werk}-${eintrag.haus}-${erster}@`));
    } finally { await ctx.close(); }
});
