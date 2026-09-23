// "In der Nähe": die Abende im Umkreis, nach Datum, mit Kalender.
//
// Der Spielplan ist durch feste Daten ersetzt (wie in kalender.test.js), der
// Standort auf Dresden gesetzt.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { starteServer, ladePlaywright, starteBrowser, ersetzeSupabase } from './umgebung.js';

const HANDY = { width: 390, height: 900 };
const DRESDEN = { latitude: 51.05, longitude: 13.74 };

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
  { werk: 'tosca', haus: 'semperoper', url: 'https://www.semperoper.de/tosca', termine: ['${iso(-2)}', '${iso(3)}', '${iso(40)}'],
    zeiten: { '${iso(3)}': '19:00-22:00' } },
  { werk: 'carmen', haus: 'oper-leipzig', url: 'https://www.oper-leipzig.de/carmen', termine: ['${iso(2)}'], zeiten: { '${iso(2)}': '18:00' } },
  { werk: 'aida', haus: 'wiener-staatsoper', url: 'https://www.wiener-staatsoper.at/aida', termine: ['${iso(5)}'] },
];`;

async function naehe({ standort = true, merker = null } = {}) {
    const ctx = await browser.newContext({ viewport: HANDY, acceptDownloads: true,
        ...(standort ? { geolocation: DRESDEN, permissions: ['geolocation'] } : {}) });
    if (merker) await ctx.addInitScript(m => localStorage.setItem('opernlog_naehe', JSON.stringify(m)), merker);
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await p.route('**/src/data/spielplan.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: SPIELPLAN }));
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html#/naehe`);
    await p.waitForSelector('#naeheListe');
    // Bis der Vorhang weg ist: vorher gehen Klicks an ihn.
    await p.waitForSelector('#splash', { state: 'detached', timeout: 15000 });
    if (standort) await p.waitForFunction(() => document.querySelector('#naeheStandort')?.textContent.includes('Standort.'));
    return { ctx, p, fehler };
}

const zeilen = (p) => p.$$eval('.naehe-abend', els => els.map(e => e.querySelector('.naehe-abend__werk').textContent.trim()));

test('im Umkreis nach Datum, Vergangenes und Fernes nicht', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await naehe();
    try {
        // Voreinstellung: 100 km, 30 Tage. Leipzig (100 km) ja, Wien nein, Tosca in 40 Tagen nein.
        assert.deepEqual(await zeilen(p), ['Carmen', 'Tosca']);
        assert.match(await p.locator('.naehe-abend').nth(1).innerText(), /19:00[\s\S]*Semperoper[\s\S]*km/);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Umkreis und Zeitraum lassen sich weiten, und die Wahl bleibt', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await naehe();
    try {
        await p.selectOption('#naeheUmkreis', 'alle');
        await p.selectOption('#naeheZeitraum', 'alle');
        assert.deepEqual(await zeilen(p), ['Carmen', 'Tosca', 'Aida', 'Tosca']);
        const gemerkt = await p.evaluate(() => JSON.parse(localStorage.getItem('opernlog_naehe')));
        assert.deepEqual({ umkreis: gemerkt.umkreis, tage: gemerkt.tage }, { umkreis: null, tage: null });
    } finally { await ctx.close(); }
});

test('ohne Standort alle Häuser, mit Knopf für den Standort', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await naehe({ standort: false });
    try {
        await p.waitForSelector('#naeheStandortFragen');
        assert.deepEqual(await zeilen(p), ['Carmen', 'Tosca', 'Aida']);
        assert.equal(await p.isDisabled('#naeheUmkreis'), true);
    } finally { await ctx.close(); }
});

test('nur Werke der Wunschliste, mit Stern', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await naehe({ merker: { umkreis: null, tage: null } });
    try {
        await p.evaluate(async () => {
            const { store } = await import('/src/store/store.js');
            store.data.myLists = [{ id: 'w', type: 'wishlist', name: 'Wunschliste', items: ['tosca'] }];
            location.hash = '#/houses';
        });
        await p.waitForTimeout(200);
        await p.evaluate(() => { location.hash = '#/naehe'; });
        await p.waitForSelector('#naeheNurWunschliste');
        assert.equal(await p.locator('.naehe-abend__stern').count(), 2, 'Tosca ohne Stern');
        await p.check('#naeheNurWunschliste');
        assert.deepEqual(await zeilen(p), ['Tosca', 'Tosca']);
    } finally { await ctx.close(); }
});

test('der Kalender nimmt genau diesen Abend', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await naehe();
    try {
        const [download] = await Promise.all([p.waitForEvent('download'), p.locator('.naehe-abend__kalender').nth(1).click()]);
        assert.equal(download.suggestedFilename(), `tosca-semperoper-${iso(3)}.ics`);
        const ics = fs.readFileSync(await download.path(), 'utf8');
        assert.match(ics, new RegExp(`DTSTART;TZID=Europe/Berlin:${iso(3).replace(/-/g, '')}T190000`));
        assert.match(ics, /LOCATION:Semperoper\\, Dresden/);
    } finally { await ctx.close(); }
});

test('die Seite steht in der Navigation, und das Werk führt zu seiner Seite', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await naehe();
    try {
        assert.equal(await p.locator('.nav-link[data-nav="#/naehe"]').count(), 1);
        await p.locator('.naehe-abend__werk').first().click();
        await p.waitForFunction(() => location.hash === '#/opera/carmen');
    } finally { await ctx.close(); }
});

test('die Karte zeigt die Häuser mit Abenden; ein Tipp schränkt die Liste ein', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await naehe();
    try {
        await p.waitForSelector('#naeheKarte .housemap__svg--ausschnitt');
        const leuchtend = await p.$$eval('.housemap__dot--besucht', els => els.map(e => e.dataset.houseId).sort());
        assert.deepEqual(leuchtend, ['oper-leipzig', 'semperoper']);
        assert.equal(await p.locator('.housemap__standort').count(), 1, 'kein Standort auf der Karte');

        await p.dispatchEvent('.housemap__dot--besucht[data-house-id="semperoper"]', 'click');
        await p.waitForSelector('.naehe-hausfilter');
        assert.match(await p.locator('.naehe-hausfilter').innerText(), /Nur Semperoper/);
        assert.deepEqual(await zeilen(p), ['Tosca']);

        await p.click('#naeheAlleHaeuser');
        assert.deepEqual(await zeilen(p), ['Carmen', 'Tosca']);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('die Karte lässt sich zuklappen, und das bleibt so', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await naehe();
    try {
        await p.click('.naehe-karte__schalter');
        assert.equal(await p.evaluate(() => document.querySelector('#naeheKarte').open), false);
        // Das toggle-Ereignis kommt erst nach dem Klick.
        await p.waitForFunction(() => JSON.parse(localStorage.getItem('opernlog_naehe') || '{}').karte === false);
    } finally { await ctx.close(); }
});
