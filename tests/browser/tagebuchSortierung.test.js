// Sortierung im Tagebuch – im Browser, an der fertigen Seite.
//
// Die Rechenteile prüft tests/unit/tagebuch.test.js. Hier geht es um das, was
// dort nicht zu sehen ist: dass die Seite die Reihenfolge auch anzeigt.
//
// Genau daran ist es vorher gescheitert. Sortiert wurde richtig, danach
// gruppierte die Seite aber immer nach Monat und hob die Sortierung damit
// wieder auf: bei "Beste Bewertung zuerst" stand oben der jüngste Monat, und
// die Noten stimmten nur innerhalb eines Monatsblocks.

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

const besuch = (id, operaId, date, rating) => ({
    id, userId: ICH, operaId, houseId: 'semperoper', date, rating,
});

// Die Titel müssen im Katalog stehen, sonst heißt jeder Eintrag "Unbekannt"
// und die Reihenfolge wäre nicht mehr ablesbar.
//
// Der Zuschnitt ist der eigentliche Test: In jedem Monat liegen ein guter und
// ein schlechter Abend. Eine Gruppierung nach Monat zöge deshalb den
// schlechten Juliabend mit nach oben, sobald der gute dort steht – genau das
// war der gemeldete Fehler. Läge in jedem Monat nur ein Abend, käme dieselbe
// Reihenfolge auch falsch gruppiert heraus.
const ABENDE = [
    besuch('a', 'tosca', '2026-07-20', 2),        // Juli, schlechteste Note
    besuch('b', 'carmen', '2026-07-28', 5),       // Juli, beste Note
    besuch('c', 'aida', '2026-03-01', 4),         // März, mittlere Note
    besuch('d', 'rigoletto', '2026-03-15', 5),    // März, ebenfalls beste Note
];

async function oeffneTagebuch(eigene = ABENDE) {
    const ctx = await browser.newContext({ viewport: RECHNER });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));

    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await p.evaluate(v => import('/src/store/store.js').then(m => { m.store.data.myVisits = v; }), eigene);
    await p.evaluate(() => { window.location.hash = '#/diary'; });
    await p.waitForSelector('.diary-entry', { timeout: 15000 });
    await p.waitForTimeout(400);
    return { ctx, p, fehler };
}

/** Die Werktitel in der Reihenfolge, in der sie auf der Seite untereinander stehen. */
const titel = p => p.locator('.diary-entry__title').allTextContents();

async function sortiere(p, wert) {
    await p.selectOption('#diarySort', wert);
    await p.waitForTimeout(300);
}

test('beste Bewertung zuerst stellt den besten Abend nach oben', { skip: fehltPlaywright }, async () => {
    // Der gemeldete Fehler: Carmen hat fünf Sterne, liegt aber im März. Tosca
    // hat zwei und liegt im Juli. Nach Monat gruppiert stand Tosca oben.
    const { ctx, p, fehler } = await oeffneTagebuch();
    try {
        await sortiere(p, 'rating-desc');
        assert.deepEqual(await titel(p), ['Carmen', 'Rigoletto', 'Aida', 'Tosca']);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('schlechteste zuerst dreht die Reihenfolge um', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffneTagebuch();
    try {
        await sortiere(p, 'rating-asc');
        assert.deepEqual(await titel(p), ['Tosca', 'Aida', 'Carmen', 'Rigoletto']);
    } finally { await ctx.close(); }
});

test('über den Blöcken stehen dann Noten statt Monaten', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffneTagebuch();
    try {
        await sortiere(p, 'rating-desc');
        assert.deepEqual(await p.locator('.diary-bewertung__title').allTextContents(),
            ['5 Sterne', '4 Sterne', '2 Sterne']);
        // Carmen und Rigoletto liegen in verschiedenen Monaten und stehen
        // trotzdem in einem Block.
        assert.equal(await p.locator('.diary-bewertung').first().locator('.diary-entry').count(), 2);
        assert.equal(await p.locator('.diary-month').count(), 0,
            'neben den Notenblöcken stehen noch Monatsblöcke');
    } finally { await ctx.close(); }
});

test('ohne Monatsüberschrift zeigt der Eintrag Monat und Jahr', { skip: fehltPlaywright }, async () => {
    // Sonst steht dort nur eine nackte Tageszahl, und wann der Abend war, ist
    // nirgends mehr zu lesen.
    const { ctx, p } = await oeffneTagebuch();
    try {
        await sortiere(p, 'rating-desc');
        const erster = p.locator('.diary-entry').first();
        assert.match(await erster.locator('.diary-entry__weekday').textContent(), /Jul 2026/);
        assert.equal(await erster.locator('.diary-entry__day').textContent(), '28');
    } finally { await ctx.close(); }
});

test('zurück auf Datum kommen die Monate wieder', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffneTagebuch();
    try {
        await sortiere(p, 'rating-desc');
        await sortiere(p, 'date-desc');
        assert.deepEqual(await titel(p), ['Carmen', 'Tosca', 'Rigoletto', 'Aida']);
        assert.deepEqual(await p.locator('.diary-month__title').allTextContents(),
            ['Juli 2026', 'März 2026']);
        assert.equal(await p.locator('.diary-bewertung').count(), 0);
    } finally { await ctx.close(); }
});

test('die Suche schränkt auch die Notenblöcke ein', { skip: fehltPlaywright }, async () => {
    // Gefiltert wird vor dem Gruppieren. Käme die Reihenfolge aus einer
    // anderen Liste als die Blöcke, stünde hier ein leerer Block.
    const { ctx, p } = await oeffneTagebuch();
    try {
        await sortiere(p, 'rating-desc');
        await p.fill('#diarySearch', 'Tosca');
        await p.waitForTimeout(300);
        assert.deepEqual(await titel(p), ['Tosca']);
        assert.deepEqual(await p.locator('.diary-bewertung__title').allTextContents(), ['2 Sterne']);
    } finally { await ctx.close(); }
});
