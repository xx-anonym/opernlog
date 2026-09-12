// Die Grenze zwischen zwei Spielzeiten im Tagebuch.
//
// Die Spielzeit läuft von August bis Juli. Zwischen Juli und August liegt der
// Einschnitt, den ein Opernjahr kennt – die Monatsüberschriften allein zeigen
// ihn nicht, dort sieht der Juli aus wie jeder andere Monat.
//
// Der heikle Teil ist nicht die Linie, sondern wann sie NICHT kommt: nach
// Bewertung sortiert stehen die Monate durcheinander, und eine Linie zöge dann
// eine Grenze, die es an der Stelle nicht gibt.

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

const besuch = (id, date, rating = 4) => ({
    id, userId: ICH, operaId: 'tosca', houseId: 'semperoper', date, rating,
});

/** Öffnet das Tagebuch mit vorgegebenen Abenden. */
async function oeffneTagebuch(eigene) {
    const ctx = await browser.newContext({ viewport: RECHNER });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));

    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await p.evaluate(v => import('/src/store/store.js').then(m => { m.store.data.myVisits = v; }), eigene);
    await p.evaluate(() => { window.location.hash = '#/diary'; });
    await p.waitForSelector('.diary-month', { timeout: 15000 });
    await p.waitForTimeout(400);
    return { ctx, p, fehler };
}

test('zwischen Juli und August steht eine Linie', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await oeffneTagebuch([
        besuch('a', '2026-07-20'),   // Spielzeit 2025/26
        besuch('b', '2026-08-05'),   // Spielzeit 2026/27
    ]);
    try {
        assert.equal(await p.locator('.saison-trenner').count(), 1);
        assert.match(await p.textContent('.saison-trenner'), /Spielzeit 2025\/26/,
            'beschriftet wird die Spielzeit unterhalb der Linie');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('innerhalb einer Spielzeit steht keine Linie', { skip: fehltPlaywright }, async () => {
    // Der Jahreswechsel ist keiner: Dezember und Januar liegen in derselben
    // Spielzeit. Genau hier würde eine Gruppierung nach Kalenderjahr irren.
    const { ctx, p } = await oeffneTagebuch([
        besuch('a', '2025-12-20'),
        besuch('b', '2026-01-15'),
    ]);
    try {
        assert.equal(await p.locator('.saison-trenner').count(), 0);
    } finally { await ctx.close(); }
});

test('über dem ersten Monat steht keine Linie', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffneTagebuch([besuch('a', '2026-09-11')]);
    try {
        assert.equal(await p.locator('.saison-trenner').count(), 0);
    } finally { await ctx.close(); }
});

test('mehrere Spielzeiten ergeben mehrere Linien', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffneTagebuch([
        besuch('a', '2024-09-10'),   // 2024/25
        besuch('b', '2025-10-10'),   // 2025/26
        besuch('c', '2026-09-10'),   // 2026/27
    ]);
    try {
        assert.equal(await p.locator('.saison-trenner').count(), 2);
        const texte = await p.locator('.saison-trenner__text').allTextContents();
        // Neueste zuerst: unter der ersten Linie beginnt 2025/26, unter der
        // zweiten 2024/25.
        assert.deepEqual(texte, ['Spielzeit 2025/26', 'Spielzeit 2024/25']);
    } finally { await ctx.close(); }
});

test('nach Bewertung sortiert steht keine Linie', { skip: fehltPlaywright }, async () => {
    // Dort stehen die Monate nicht chronologisch. Eine Linie behauptete eine
    // Grenze, die an der Stelle keine ist.
    const { ctx, p } = await oeffneTagebuch([
        besuch('a', '2026-07-20', 2),
        besuch('b', '2026-08-05', 5),
        besuch('c', '2025-09-05', 3),
    ]);
    try {
        assert.ok(await p.locator('.saison-trenner').count() > 0, 'vorher stand keine Linie da');
        await p.selectOption('#diarySort', 'rating-desc');
        await p.waitForTimeout(300);
        assert.equal(await p.locator('.saison-trenner').count(), 0);
    } finally { await ctx.close(); }
});

test('die Linie ist gestrichelt und golden', { skip: fehltPlaywright }, async () => {
    // Eine durchgezogene graue Linie wäre von den Trennern zwischen den
    // Monaten nicht zu unterscheiden.
    const { ctx, p } = await oeffneTagebuch([
        besuch('a', '2026-07-20'),
        besuch('b', '2026-08-05'),
    ]);
    try {
        const stil = await p.evaluate(() => {
            const t = document.querySelector('.saison-trenner');
            const vor = getComputedStyle(t, '::before');
            return { art: vor.borderTopStyle, farbe: vor.borderTopColor };
        });
        assert.equal(stil.art, 'dashed');
        // --gold-dark ist #a08030.
        assert.equal(stil.farbe, 'rgb(160, 128, 48)');
    } finally { await ctx.close(); }
});
