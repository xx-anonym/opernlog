// Halbe Sterne sehen aus wie halbe: der Umriss, darüber die linke Hälfte
// gefüllt – in der Eingabe und in der Zusammenfassung über dem Diagramm.

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

// Breite der gefüllten Hälfte im Verhältnis zum Umriss – und ob beide an derselben Stelle stehen.
const haelfte = p => p.$eval('.star--half', (s) => {
    const leer = s.querySelector('.star__leer').getBoundingClientRect();
    const halb = s.querySelector('.star__halb').getBoundingClientRect();
    const farbe = getComputedStyle(s.querySelector('.star__halb')).color;
    return { anteil: Math.round((halb.width / leer.width) * 100), oben: Math.round(halb.top - leer.top), links: Math.round(halb.left - leer.left), farbe };
});

test('Eingabe: linke Hälfte des vierten Sterns – ein halber Stern, halb gefüllt, deckungsgleich', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    try {
        await ersetzeSupabase(p);
        await p.goto(`${server.url}/index.html#/log?house=semperoper&opera=tosca`);
        await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
        await vorhangAuf(p);
        await p.waitForSelector('#ratingWidget .star');
        const stern = p.locator('#ratingWidget .star').nth(3);
        const box = await stern.boundingBox();
        await p.mouse.click(box.x + box.width * 0.25, box.y + box.height / 2);
        await p.mouse.move(0, 0);
        await p.waitForSelector('#ratingWidget .star--half');
        const h = await haelfte(p);
        assert.ok(h.anteil >= 45 && h.anteil <= 55, `Anteil ${h.anteil} %`);
        assert.deepEqual([h.oben, h.links], [0, 0]);
        assert.equal(h.farbe, 'rgb(201, 168, 76)');
        assert.equal(await p.textContent('#ratingWidget .star-rating__number'), '3.5');
    } finally { await ctx.close(); }
});

test('über dem Diagramm: 3,6 als dreieinhalb, gold, ohne "½"', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const UID = '11111111-1111-1111-1111-111111111111';
    try {
        await p.addInitScript(v => { window.__besucheVorgabe = v; }, [
            { id: 'aaaaaaaa-1111-4000-8000-000000000001', user_id: UID, opera_id: 'tosca', house_id: 'semperoper', date: '2026-05-01', rating: 3.5 },
            { id: 'aaaaaaaa-1111-4000-8000-000000000002', user_id: UID, opera_id: 'tosca', house_id: 'oper-leipzig', date: '2026-04-01', rating: 3.5 },
            { id: 'aaaaaaaa-1111-4000-8000-000000000003', user_id: UID, opera_id: 'tosca', house_id: 'oper-koeln', date: '2026-03-01', rating: 4 },
        ]);
        await ersetzeSupabase(p);
        await p.goto(`${server.url}/index.html#/opera/tosca`);
        await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
        await vorhangAuf(p);
        await p.waitForSelector('.ratings-histogram__avg-stars .star');
        const sterne = await p.$$eval('.ratings-histogram__avg-stars .star', ss => ss.map(s => s.className.replace('star star--', '')));
        assert.deepEqual(sterne, ['full', 'full', 'full', 'half', 'empty']);
        assert.ok(!(await p.textContent('.ratings-histogram__avg-stars')).includes('½'));
        assert.equal(await p.$eval('.ratings-histogram__avg-stars .star--full', s => getComputedStyle(s).color), 'rgb(201, 168, 76)');
    } finally { await ctx.close(); }
});
