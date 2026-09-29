// Vorschläge aus dem Spielplan im Log-Formular.
//
// Wie in werkTermine.test.js ersetzt der Test die erzeugte Datei
// src/data/spielplan.js durch feste Daten, relativ zu heute. Geprüft wird:
// Haus und Tag ergeben das Werk, Haus und Werk ergeben die Tage; nichts wird
// von selbst eingetragen; ein von Hand gewähltes Datum bleibt stehen; die
// Vorauswahl des Hauses nach dem Standort bringt den Vorschlag gleich mit.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { starteServer, ladePlaywright, starteBrowser, ersetzeSupabase } from './umgebung.js';

const HANDY = { width: 390, height: 900 };
const SEMPEROPER = { latitude: 51.0543, longitude: 13.7351 };

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
export const SPIELPLAN_STAND = '${iso(-10)}';
export const SPIELPLAN_ZUSATZWERKE = [];
export const spielplan = [
  { werk: 'tosca', haus: 'semperoper', url: 'https://www.semperoper.de/tosca',
    termine: ['${iso(-3)}', '${iso(0)}', '${iso(10)}'], zeiten: { '${iso(0)}': '19:00-22:00' } },
  { werk: 'haensel-gretel', haus: 'semperoper', url: 'https://www.semperoper.de/haensel',
    termine: ['${iso(0)}'], zeiten: { '${iso(0)}': '15:00' } },
  { werk: 'carmen', haus: 'semperoper', url: 'https://www.semperoper.de/carmen', termine: ['${iso(-5)}'] },
];`;

async function formular(hash, { geraet = null } = {}) {
    const ctx = await browser.newContext(geraet
        ? { viewport: HANDY, geolocation: geraet, permissions: ['geolocation'] }
        : { viewport: HANDY });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await p.route('**/src/data/spielplan.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: SPIELPLAN }));
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html`);
    await p.waitForSelector('.main-content', { timeout: 15000 });
    await p.evaluate(h => { location.hash = h; }, hash);
    await p.waitForSelector('#logForm');
    return { ctx, p, fehler };
}

const knoepfe = (p, id) => p.locator(`#${id} .chip`).allInnerTexts();

test('Haus und heute: die Werke des Tages als Knöpfe, erst der Klick trägt ein', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await formular('#/log?house=semperoper');
    try {
        await p.locator('#operaVorschlag .chip').first().waitFor();
        assert.match(await p.locator('#operaVorschlag').innerText(), /heute hier/);
        // Nach Beginn: der Nachmittag vor dem Abend.
        assert.deepEqual(await knoepfe(p, 'operaVorschlag'), ['Hänsel und Gretel · 15:00', 'Tosca · 19:00']);
        assert.equal(await p.inputValue('#operaId'), '', 'ohne Klick schon eingetragen');

        await p.locator('#operaVorschlag .chip', { hasText: 'Tosca' }).click();
        assert.equal(await p.inputValue('#operaId'), 'tosca');
        assert.match(await p.inputValue('#operaInput'), /^Tosca – /);
        assert.equal(await p.isVisible('#operaVorschlag'), false, 'Vorschlag bleibt nach der Wahl stehen');

        // Jetzt die Tage: bis heute, der jüngste zuerst, der gewählte hervorgehoben.
        await p.locator('#datumVorschlag .chip').first().waitFor();
        assert.equal(await p.locator('#datumVorschlag .chip').count(), 2, 'der kommende Termin gehört nicht dazu');
        assert.equal(await p.locator('#datumVorschlag .chip--active').count(), 1);
        assert.equal(await p.locator('#datumVorschlag .chip').first().getAttribute('class'), 'chip chip--active');

        await p.locator('#datumVorschlag .chip').nth(1).click();
        assert.equal(await p.inputValue('#visitDate'), iso(-3));
        assert.equal(await p.locator('#datumVorschlag .chip').nth(1).getAttribute('class'), 'chip chip--active');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('ein anderer Tag von Hand: das Werk dieses Tages, keine Tage mehr', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await formular('#/log?house=semperoper');
    try {
        await p.fill('#visitDate', iso(-5));
        await p.locator('#operaVorschlag .chip').first().waitFor();
        assert.match(await p.locator('#operaVorschlag').innerText(), /an dem Tag hier/);
        assert.deepEqual(await knoepfe(p, 'operaVorschlag'), ['Carmen'], 'ohne Uhrzeit nur der Titel');

        // Ein spielfreier Tag: kein Vorschlag.
        await p.fill('#visitDate', iso(-1));
        assert.equal(await p.isVisible('#operaVorschlag'), false);

        // Mit Werk bleibt das von Hand gewählte Datum stehen – keine anderen Tage.
        await p.fill('#operaInput', 'Tosca');
        await p.locator('#operaList .autocomplete__item', { hasText: 'Tosca' }).click();
        assert.equal(await p.inputValue('#operaId'), 'tosca');
        assert.equal(await p.isVisible('#datumVorschlag'), false, 'Tage trotz Datum von Hand');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Haus und Werk aus der Adresse: die Tage stehen gleich da', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await formular('#/log?house=semperoper&opera=carmen');
    try {
        await p.locator('#datumVorschlag .chip').first().waitFor();
        assert.equal(await p.locator('#datumVorschlag .chip').count(), 1);
        assert.equal(await p.isVisible('#operaVorschlag'), false, 'Werk steht schon – kein Werkvorschlag');
        await p.locator('#datumVorschlag .chip').click();
        assert.equal(await p.inputValue('#visitDate'), iso(-5));
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('vorgemerkter Abend ("Wie war …?"): das Datum steht fest, keine anderen Tage', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await formular(`#/log?house=semperoper&opera=tosca&datum=${iso(-3)}`);
    try {
        assert.equal(await p.inputValue('#visitDate'), iso(-3));
        assert.equal(await p.inputValue('#operaId'), 'tosca');
        await p.waitForTimeout(300);
        assert.equal(await p.isVisible('#datumVorschlag'), false, 'Tage trotz vorgemerktem Datum');
        assert.equal(await p.isVisible('#operaVorschlag'), false);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Haus nach dem Standort vorausgewählt: der Vorschlag kommt mit', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await formular('#/log', { geraet: SEMPEROPER });
    try {
        await p.waitForFunction(() => document.querySelector('#houseId').value === 'semperoper');
        await p.locator('#operaVorschlag .chip').first().waitFor();
        assert.deepEqual(await knoepfe(p, 'operaVorschlag'), ['Hänsel und Gretel · 15:00', 'Tosca · 19:00']);

        // Haus gelöscht: der Vorschlag geht mit.
        await p.focus('#houseInput');
        await p.keyboard.press('Backspace');
        assert.equal(await p.inputValue('#houseId'), '');
        assert.equal(await p.isVisible('#operaVorschlag'), false);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});
