// Die eingeklappte Besetzung in den Review-Karten.
//
// Sechs Zeilen Besetzung schoben die Review aus dem Blick. Ab drei Zeilen
// steht deshalb eingeklappt eine Kurzfassung da. Die Rechenteile prüft
// tests/unit/credits.test.js; hier geht es um das, was nur im Browser
// sichtbar wird.
//
// Der heikle Teil ist der Klick. Die ganze Karte führt auf die Seite des
// Besuchs. Ohne Ausnahme für den Aufklapper sprang ein Klick auf "und 4
// weitere" deshalb weg, statt die Liste zu zeigen.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { starteServer, ladePlaywright, starteBrowser, ersetzeSupabase } from './umgebung.js';

const RECHNER = { width: 1100, height: 1000 };
const ICH = '11111111-1111-1111-1111-111111111111';

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

const SECHS = [
    'Ben Bliss (Herzog von Mantua)',
    'Simon Keenlyside (Rigoletto)',
    'Elena Villalón (Gilda)',
    'Alexander Tsymbalyuk (Sparafucile)',
    'Anna Kissjudit (Maddalena)',
    'Rebecka Wallroth (Giovanna)',
].join('\n');

const LANG = {
    id: 'lang', userId: ICH, operaId: 'rigoletto', houseId: 'staatsoper-berlin',
    date: '2026-09-11', rating: 4.5, conductor: 'Domingo Hindoyan', director: 'Bartlett Sher',
    castList: SECHS, review: 'Gesangsstimmen, mindestens so wunderschön wie das Bühnenbild!',
};
const KURZ = {
    id: 'kurz', userId: ICH, operaId: 'tosca', houseId: 'semperoper',
    date: '2026-06-27', rating: 3, castList: 'Anna Netrebko (Tosca)\nYusif Eyvazov (Cavaradossi)',
};

/** Öffnet eine Seite mit den beiden Abenden und wartet auf die Karten. */
async function oeffne(hash, eigene = [LANG, KURZ]) {
    const ctx = await browser.newContext({ viewport: RECHNER });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));

    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await p.evaluate(v => import('/src/store/store.js').then(m => { m.store.data.myVisits = v; }), eigene);
    await p.evaluate(h => { window.location.hash = h; }, hash);
    await p.waitForSelector('.review-card', { timeout: 15000 });
    await p.waitForSelector('#splash', { state: 'detached' }).catch(() => {});
    await p.waitForTimeout(300);
    return { ctx, p, fehler };
}

/** Die Karte zu einem Werk, erkannt am Titel. */
const karte = (p, titel) => p.locator('.review-card', { hasText: titel });

test('eine lange Besetzung ist eingeklappt und zeigt die Kurzfassung', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await oeffne('#/profile');
    try {
        const k = karte(p, 'Rigoletto');
        assert.equal(await k.locator('details.besetzung').evaluate(d => d.open), false);
        assert.equal(await k.locator('.besetzung__kurz').textContent(),
            'Ben Bliss, Simon Keenlyside und 4 weitere');
        assert.equal(await k.getByText('Rebecka Wallroth (Giovanna)').isVisible(), false,
            'die ganze Liste steht trotz Einklappen da');
        // Dirigent und Regie bleiben offen.
        assert.equal(await k.getByText('Domingo Hindoyan').isVisible(), true);
        assert.equal(await k.getByText('Bartlett Sher').isVisible(), true);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('ein Klick klappt auf, statt zur Seite des Besuchs zu springen', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffne('#/profile');
    try {
        const k = karte(p, 'Rigoletto');
        await k.locator('.besetzung__summary').click();
        await p.waitForTimeout(300);

        assert.equal(await p.evaluate(() => location.hash), '#/profile',
            'der Klick auf den Aufklapper hat die Seite gewechselt');
        assert.equal(await k.getByText('Rebecka Wallroth (Giovanna)').isVisible(), true);
        assert.equal(await k.locator('.besetzung__offen').textContent(), '6 Mitwirkende');
        assert.equal(await k.locator('.besetzung__kurz').isVisible(), false,
            'aufgeklappt steht die Kurzfassung doppelt über der Liste');

        // Und wieder zu.
        await k.locator('.besetzung__summary').click();
        await p.waitForTimeout(200);
        assert.equal(await k.getByText('Rebecka Wallroth (Giovanna)').isVisible(), false);
    } finally { await ctx.close(); }
});

test('der Rest der Karte führt weiter zum Besuch', { skip: fehltPlaywright }, async () => {
    // Die Ausnahme darf nicht mehr schlucken als den Aufklapper.
    const { ctx, p } = await oeffne('#/profile');
    try {
        await karte(p, 'Rigoletto').locator('.review-card__text').click();
        await p.waitForTimeout(300);
        assert.equal(await p.evaluate(() => location.hash), '#/visit/lang');
    } finally { await ctx.close(); }
});

test('zwei Zeilen Besetzung bleiben offen', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffne('#/profile');
    try {
        const k = karte(p, 'Tosca');
        assert.equal(await k.locator('details.besetzung').count(), 0);
        assert.equal(await k.getByText('Yusif Eyvazov (Cavaradossi)').isVisible(), true);
    } finally { await ctx.close(); }
});

test('auf der Seite des Besuchs ist die Besetzung aufgeklappt', { skip: fehltPlaywright }, async () => {
    // Dort ist man hingegangen, um alles zu lesen.
    const { ctx, p } = await oeffne('#/visit/lang');
    try {
        assert.equal(await p.locator('details.besetzung').evaluate(d => d.open), true);
        assert.equal(await p.getByText('Rebecka Wallroth (Giovanna)').isVisible(), true);
    } finally { await ctx.close(); }
});

test('Namen mit Sonderzeichen kommen nicht als HTML an', { skip: fehltPlaywright }, async () => {
    const boese = { ...LANG, castList: '<img src=x onerror="window.__xss=1">\nB\nC' };
    const { ctx, p } = await oeffne('#/profile', [boese]);
    try {
        assert.equal(await p.evaluate(() => window.__xss), undefined);
        assert.match(await p.locator('.besetzung__kurz').textContent(), /^<img/);
    } finally { await ctx.close(); }
});
