// Der Filter "schon gesehen / noch nicht gesehen" im Opernkatalog.
//
// Gesehen heißt geloggt ODER markiert. Der Filter muss beide Wege
// berücksichtigen: wer ein Werk vor OpernLog gesehen hat, trägt es ohne Datum
// und Bewertung ein, und es dann unter "noch nicht gesehen" zu führen wäre
// schlicht falsch.

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

/** Öffnet den Opernkatalog mit vorgegebenen Besuchen und Markierungen. */
async function oeffneKatalog({ eigene = [], markiert = [] } = {}) {
    const ctx = await browser.newContext({ viewport: RECHNER });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));

    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });

    await p.evaluate(m => { window.__seen = m; }, markiert);
    if (eigene.length) {
        await p.evaluate(v => import('/src/store/store.js').then(m => { m.store.data.myVisits = v; }), eigene);
    }
    await p.evaluate(m => import('/src/store/store.js').then(s => { s.store.data.seenOperas = m; }), markiert);

    await p.evaluate(() => { window.location.hash = '#/operas'; });
    await p.waitForSelector('#seenFilter', { timeout: 15000 });
    await p.waitForTimeout(500);
    return { ctx, p, fehler };
}

/** Die Titel der gerade sichtbaren Karten. */
const titel = (p) => p.locator('.opera-card__title').allTextContents();

const besuch = (operaId) => ({
    id: 'v-' + operaId, userId: ICH, operaId, houseId: 'semperoper',
    date: '2026-05-01', rating: 4,
});

test('ohne Filter steht der ganze Katalog da', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await oeffneKatalog({ eigene: [besuch('tosca')] });
    try {
        const alle = await p.evaluate(async () => (await import('/src/data/operas.js')).operas.length);
        assert.equal((await titel(p)).length, alle);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('"Schon gesehen" zeigt geloggte Werke', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffneKatalog({ eigene: [besuch('tosca'), besuch('aida')] });
    try {
        await p.selectOption('#seenFilter', 'gesehen');
        await p.waitForTimeout(300);
        assert.deepEqual((await titel(p)).sort(), ['Aida', 'Tosca']);
    } finally { await ctx.close(); }
});

test('"Schon gesehen" zeigt auch nur markierte Werke', { skip: fehltPlaywright }, async () => {
    // Der eigentliche Punkt: ohne das fiele jedes Werk heraus, das jemand vor
    // OpernLog gesehen und deshalb nur markiert hat.
    const { ctx, p } = await oeffneKatalog({ markiert: ['rigoletto'] });
    try {
        await p.selectOption('#seenFilter', 'gesehen');
        await p.waitForTimeout(300);
        assert.deepEqual(await titel(p), ['Rigoletto']);
    } finally { await ctx.close(); }
});

test('"Noch nicht gesehen" lässt genau diese Werke weg', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffneKatalog({ eigene: [besuch('tosca')], markiert: ['rigoletto'] });
    try {
        const alle = await p.evaluate(async () => (await import('/src/data/operas.js')).operas.length);
        await p.selectOption('#seenFilter', 'offen');
        await p.waitForTimeout(300);

        const sichtbar = await titel(p);
        assert.equal(sichtbar.length, alle - 2);
        assert.ok(!sichtbar.includes('Tosca'), 'ein geloggtes Werk stand unter "noch nicht gesehen"');
        assert.ok(!sichtbar.includes('Rigoletto'), 'ein markiertes Werk stand unter "noch nicht gesehen"');
    } finally { await ctx.close(); }
});

test('der Filter wirkt zusammen mit der Suche', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffneKatalog({ eigene: [besuch('tosca'), besuch('aida')] });
    try {
        await p.selectOption('#seenFilter', 'gesehen');
        await p.fill('#operaSearch', 'tosca');
        await p.waitForTimeout(300);
        assert.deepEqual(await titel(p), ['Tosca']);
    } finally { await ctx.close(); }
});

test('ohne ein einziges gesehenes Werk sagt der Leerzustand, woran es liegt', { skip: fehltPlaywright }, async () => {
    // "Keine Opern gefunden" wäre irreführend – gesucht wurde ja nichts.
    const { ctx, p } = await oeffneKatalog();
    try {
        await p.selectOption('#seenFilter', 'gesehen');
        await p.waitForTimeout(300);
        assert.match(await p.textContent('.empty-state'), /noch kein Werk geloggt oder als gesehen markiert/);
    } finally { await ctx.close(); }
});

test('die Wahl überlebt einen Seitenwechsel', { skip: fehltPlaywright }, async () => {
    // Wie die übrigen Filter: wer von einer Werkseite zurückkommt, will nicht
    // wieder den ganzen Katalog vor sich haben.
    const { ctx, p } = await oeffneKatalog({ eigene: [besuch('tosca')] });
    try {
        await p.selectOption('#seenFilter', 'gesehen');
        await p.waitForTimeout(300);
        await p.evaluate(() => { window.location.hash = '#/opera/tosca'; });
        await p.waitForTimeout(400);
        await p.evaluate(() => { window.location.hash = '#/operas'; });
        await p.waitForSelector('#seenFilter');
        await p.waitForTimeout(400);

        assert.equal(await p.inputValue('#seenFilter'), 'gesehen');
        assert.deepEqual(await titel(p), ['Tosca']);
    } finally { await ctx.close(); }
});
