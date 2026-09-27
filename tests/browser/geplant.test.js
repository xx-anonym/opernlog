// Geplante Besuche: im Termin-Fenster vormerken, auf der Startseite unter
// "Demnächst" sehen, nach dem Abend "Wie war …?" – Loggen mit ausgefülltem
// Formular, danach ist der Plan weg. Der Spielplan ist durch feste Daten
// ersetzt (wie in kalender.test.js).

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
const heute = new Date();
const iso = tage => { const d = new Date(heute); d.setDate(d.getDate() + tage); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const SPIELPLAN = `
export const SPIELPLAN_STAND = '${iso(-1)}';
export const SPIELPLAN_ZUSATZWERKE = [];
export const spielplan = [
  { werk: 'tosca', haus: 'semperoper', url: 'https://www.semperoper.de/tosca', termine: ['${iso(5)}', '${iso(9)}'],
    zeiten: { '${iso(5)}': '19:00-22:30' } },
];`;

async function oeffne(hash, { plaene = [] } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await p.route('**/src/data/spielplan.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: SPIELPLAN }));
    await p.addInitScript(v => { window.__geplantVorgabe = v; }, plaene);
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html${hash}`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await vorhangAuf(p);
    return { ctx, p, fehler };
}

test('im Termin-Fenster vormerken, auf der Startseite sehen, wieder entfernen', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/opera/tosca');
    try {
        await p.click('#termineToggle');
        await p.click('#operaTermine .spielplan-zeile__kalender');
        const knopf = p.locator('.kalender-wahl__vormerken').first();
        assert.equal((await knopf.textContent()).trim(), 'Vormerken');
        await knopf.click();
        await p.waitForFunction(() => window.__geplant.length === 1);
        assert.equal((await knopf.textContent()).trim(), '✓ Vorgemerkt');
        const [zeile] = await p.evaluate(() => window.__geplant);
        assert.deepEqual({ werk: zeile.opera_id, haus: zeile.house_id, datum: zeile.datum, zeit: zeile.zeit },
            { werk: 'tosca', haus: 'semperoper', datum: iso(5), zeit: '19:00-22:30' });
        // Das Fenster bleibt offen – man merkt sich oft zwei Abende.
        assert.equal(await p.locator('.kalender-wahl').count(), 1);
        await p.click('#kalenderWahlAbbrechen');

        await p.evaluate(() => { location.hash = '#/'; });
        await p.waitForSelector('.demnaechst');
        const text = await p.textContent('.demnaechst');
        assert.match(text, /Tosca/);
        assert.match(text, /Semperoper/);
        assert.match(text, /19:00–22:30/);

        await p.click('.demnaechst__weg');
        await p.waitForFunction(() => window.__geplant.length === 0);
        assert.equal(await p.locator('.demnaechst').count(), 0);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('ein zweiter Klick nimmt die Vormerkung zurück', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await oeffne('#/opera/tosca');
    try {
        await p.click('#termineToggle');
        await p.click('#operaTermine .spielplan-zeile__kalender');
        const knopf = p.locator('.kalender-wahl__vormerken').nth(1);
        await knopf.click();
        await p.waitForFunction(() => window.__geplant.length === 1);
        await knopf.click();
        await p.waitForFunction(() => window.__geplant.length === 0);
        assert.equal((await knopf.textContent()).trim(), 'Vormerken');
    } finally { await ctx.close(); }
});

test('nach dem Abend: "Wie war …?" – Loggen füllt das Formular, danach ist der Plan weg', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const plan = { id: 'aaaaaaaa-0000-4000-8000-000000000001', user_id: UID, opera_id: 'tosca', house_id: 'semperoper', datum: iso(-1), zeit: '19:00' };
    const { ctx, p, fehler } = await oeffne('#/', { plaene: [plan] });
    try {
        await p.waitForSelector('.plan-frage');
        assert.match(await p.textContent('.plan-frage__text'), /Wie war Tosca gestern\?/);
        await p.click('.plan-frage a.btn');
        await p.waitForSelector('#visitDate');
        assert.equal(await p.inputValue('#visitDate'), iso(-1));
        assert.equal(await p.inputValue('#houseId'), 'semperoper');
        assert.equal(await p.inputValue('#operaId'), 'tosca');

        // Bewerten und speichern: der Plan ist damit erledigt.
        const stern = p.locator('#ratingWidget .star').nth(3);
        const box = await stern.boundingBox();
        await p.mouse.click(box.x + box.width * 0.75, box.y + box.height / 2);
        await p.click('#logForm button[type="submit"]');
        await p.waitForFunction(() => window.__besuchVersuche.length === 1);
        await p.waitForFunction(() => window.__geplant.length === 0);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('"Nicht hingegangen" entfernt den Plan, die Frage verschwindet', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const plan = { id: 'aaaaaaaa-0000-4000-8000-000000000002', user_id: UID, opera_id: 'tosca', house_id: 'semperoper', datum: iso(-3), zeit: null };
    const { ctx, p } = await oeffne('#/', { plaene: [plan] });
    try {
        await p.waitForSelector('.plan-frage');
        await p.click('.plan-frage__nein');
        await p.waitForFunction(() => window.__geplant.length === 0);
        assert.equal(await p.locator('.plan-frage').count(), 0);
    } finally { await ctx.close(); }
});

test('ein ins Datum geschriebener Tag in der Zukunft füllt das Formular nicht', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await oeffne(`#/log?house=semperoper&opera=tosca&datum=${iso(3)}`);
    try {
        await p.waitForSelector('#visitDate');
        assert.equal(await p.inputValue('#visitDate'), iso(0));
    } finally { await ctx.close(); }
});
