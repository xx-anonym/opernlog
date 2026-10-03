// Heute vor einem Jahr auf der Startseite: eigene Abende, die auf den Tag
// genau Jahre zurückliegen, als Karte mit Bewertung, Anfang des Reviews und
// dem ersten Foto. Die Karte führt zum Abend. Die Uhr steht fest auf dem
// 3. Oktober 2026.

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
const VOR_EINEM = 'aaaaaaaa-1111-4000-8000-000000000001';
const VOR_DREI = 'aaaaaaaa-1111-4000-8000-000000000002';
const GESTERN_VOR_EINEM = 'aaaaaaaa-1111-4000-8000-000000000003';
const REVIEW = 'Netrebko sang die Tosca mit einer Wucht, die man so selten hört, und das Orchester trug sie bis zum letzten Sprung von der Engelsburg, atemlos.';
const BESUCHE = [
    { id: VOR_DREI, user_id: UID, opera_id: 'aida', house_id: 'oper-leipzig', date: '2023-10-03', rating: 3 },
    { id: VOR_EINEM, user_id: UID, opera_id: 'tosca', house_id: 'semperoper', date: '2025-10-03', rating: 4.5, review: REVIEW },
    { id: GESTERN_VOR_EINEM, user_id: UID, opera_id: 'carmen', house_id: 'semperoper', date: '2025-10-02', rating: 5 },
];
const FOTO = {
    id: 'cccccccc-3333-4000-8000-000000000001', user_id: UID, visit_id: VOR_EINEM,
    pfad: `${UID}/${VOR_EINEM}/cccccccc-3333-4000-8000-000000000001.jpg`, oeffentlich: false,
};

async function startseite({ besuche = BESUCHE, andenken = [] } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await p.clock.setFixedTime(new Date('2026-10-03T10:00:00'));
    await p.addInitScript(([b, a]) => { window.__besucheVorgabe = b; window.__andenkenVorgabe = a; }, [besuche, andenken]);
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html#/`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await vorhangAuf(p);
    await p.waitForSelector('.feedkopf');
    return { ctx, p, fehler };
}

test('Startseite: Abende von heute vor einem und vor drei Jahren, der jüngste zuerst', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await startseite({ andenken: [FOTO] });
    try {
        await p.waitForSelector('.jahrestag');
        const karten = await p.$$eval('.jahrestag', els => els.map(e => ({
            href: e.getAttribute('href'),
            kicker: e.querySelector('.jahrestag__kicker').textContent.trim(),
            werk: e.querySelector('.jahrestag__werk').textContent.trim(),
            ort: e.querySelector('.jahrestag__ort')?.textContent.trim(),
            sterne: e.querySelector('.star-rating__number')?.textContent,
        })));
        assert.deepEqual(karten, [
            { href: `#/visit/${VOR_EINEM}`, kicker: 'Heute vor einem Jahr', werk: 'Tosca', ort: 'Semperoper · Dresden', sterne: '4.5' },
            { href: `#/visit/${VOR_DREI}`, kicker: 'Heute vor 3 Jahren', werk: 'Aida', ort: 'Oper Leipzig', sterne: '3.0' },
        ]);
        // Der Anfang des Reviews, an einer Wortgrenze gekürzt.
        const review = await p.textContent('.jahrestag .jahrestag__review');
        assert.match(review, /^„Netrebko sang die Tosca .* …“$/);
        // Das Foto rückt nach – nur beim Abend, der eins hat.
        await p.waitForSelector('.jahrestag--foto .jahrestag__foto');
        assert.equal(await p.locator('.jahrestag__foto').count(), 1);
        assert.equal(await p.getAttribute('.jahrestag__foto', 'src') !== null, true);
        // Unter dem Kopf, vor dem Feed.
        assert.equal(await p.evaluate(() => {
            const k = document.querySelector('.jahrestag');
            const kopf = document.querySelector('.feedkopf');
            return !!(kopf.compareDocumentPosition(k) & Node.DOCUMENT_POSITION_FOLLOWING);
        }), true);

        await p.click('.jahrestag >> nth=0');
        await p.waitForFunction(id => location.hash === `#/visit/${id}`, VOR_EINEM);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Startseite: kein Jahrestag heute – keine Karte', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await startseite({ besuche: BESUCHE.filter(b => b.id === GESTERN_VOR_EINEM) });
    try {
        await p.waitForTimeout(300);
        assert.equal(await p.locator('.jahrestag').count(), 0);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});
