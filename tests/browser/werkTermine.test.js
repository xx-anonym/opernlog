// "Aktuelle Termine" auf der Seite eines Werks.
//
// Wie in wunschlisteSpielplan.test.js ersetzt der Test die erzeugte Datei
// src/data/spielplan.js durch feste Daten. Geprüft wird, dass die Termine
// erst auf Klick erscheinen, dass der Knopf nur da ist, wo es welche gibt,
// und dass das Aufklappen nach dem Standort ordnet.

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

const heute = new Date();
const iso = tage => { const d = new Date(heute); d.setDate(d.getDate() + tage); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const SPIELPLAN = `
export const SPIELPLAN_STAND = '${iso(-1)}';
export const SPIELPLAN_ZUSATZWERKE = [];
export const spielplan = [
  { werk: 'tosca', haus: 'wiener-staatsoper', url: 'https://www.wiener-staatsoper.at/tosca', termine: ['${iso(2)}'] },
  { werk: 'tosca', haus: 'hamburgische-staatsoper', url: 'https://www.staatsoper-hamburg.de/tosca', termine: ['${iso(50)}'] },
  { werk: 'carmen', haus: 'semperoper', url: 'https://www.semperoper.de/carmen', termine: ['${iso(-2)}'] },
];`;

async function werkseite(werk, { geraet = null } = {}) {
    const ctx = await browser.newContext(geraet
        ? { viewport: HANDY, geolocation: geraet, permissions: ['geolocation'] }
        : { viewport: HANDY });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await p.route('**/src/data/spielplan.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: SPIELPLAN }));
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html#/opera/${werk}`);
    await p.waitForSelector('.detail-actions', { timeout: 15000 });
    return { ctx, p, fehler };
}

test('die Termine stehen erst nach dem Klick da, ein zweiter klappt sie zu', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await werkseite('tosca');
    try {
        const knopf = p.locator('#termineToggle');
        assert.equal(await knopf.getAttribute('aria-expanded'), 'false');
        assert.equal(await p.locator('#operaTermine .spielplan-zeile').count(), 0);
        await knopf.click();
        await p.locator('#operaTermine .spielplan-zeile').first().waitFor();
        assert.equal(await knopf.getAttribute('aria-expanded'), 'true');
        const links = await p.locator('#operaTermine a.spielplan-zeile').evaluateAll(a => a.map(x => [x.href, x.target]));
        assert.deepEqual(links.map(l => l[1]), ['_blank', '_blank']);
        assert.match(await p.locator('#operaTermine .spielplan-quelle').innerText(), /maßgeblich ist die Seite des Hauses/);
        await knopf.click();
        assert.equal(await p.locator('#operaTermine').isVisible(), false);
        assert.equal(await knopf.getAttribute('aria-expanded'), 'false');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('ohne kommende Termine gibt es keinen Knopf', { skip: fehltPlaywright }, async () => {
    // Carmen hat nur einen vergangenen Termin, Aida gar keinen.
    for (const werk of ['carmen', 'aida']) {
        const { ctx, p } = await werkseite(werk);
        try {
            assert.equal(await p.locator('#termineToggle').count(), 0, werk);
        } finally { await ctx.close(); }
    }
});

test('beim Aufklappen wird nach dem Standort gefragt und danach geordnet', { skip: fehltPlaywright }, async () => {
    // Das Gerät steht in Hamburg: nach Datum stünde Wien vorn.
    const { ctx, p } = await werkseite('tosca', { geraet: { latitude: 53.55, longitude: 9.99 } });
    try {
        await p.locator('#termineToggle').click();
        const erste = p.locator('#operaTermine .spielplan-block > .spielplan-zeile').first();
        await erste.filter({ hasText: 'Hamburg' }).waitFor({ timeout: 5000 });
        assert.match(await erste.innerText(), /km/);
    } finally { await ctx.close(); }
});
