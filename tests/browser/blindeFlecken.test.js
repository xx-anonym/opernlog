// "Was dir noch fehlt": Gelegenheiten aus dem Spielplan und die Sammlung je
// Komponist.
//
// Vorher stand hier nur eine Liste grauer Knöpfe – fehlende Werke ohne
// Hinweis, ob und wo sie laufen. Jetzt: Karten für Werke, die demnächst an
// einem Haus im Katalog laufen, mit Wunschliste und "Gesehen", darunter der
// Stand je Komponist.
//
// Die Uhr steht fest auf dem 1. Oktober 2026: sonst veralteten die Tests mit
// dem Spielplan in src/data/spielplan.js.

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

// Oft Verdi, einmal Mozart: Verdis Lücken kommen zuerst.
const BESUCHE = [['rigoletto', 5], ['aida', 4], ['nabucco', 4], ['zauberflote', 5]]
    .map(([operaId, rating], i) => ({ id: 'b' + i, userId: 'user-me', operaId, houseId: 'semperoper', date: `2025-0${i + 1}-10`, rating }));

async function startseite(pfad = '#/') {
    const ctx = await browser.newContext({ viewport: HANDY });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await p.clock.setFixedTime(new Date('2026-10-01T10:00:00Z'));
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html`);
    await p.waitForFunction(() => import('/src/store/store.js').then(m => m.store.isCloud));
    await p.evaluate(v => import('/src/store/store.js').then(m => { m.store.data.myVisits = v; }), BESUCHE);
    await p.waitForSelector('#splash', { state: 'detached' }).catch(() => {});
    await p.evaluate(() => { location.hash = '#/houses'; });
    await p.waitForTimeout(200);
    await p.evaluate(h => { location.hash = h; }, pfad);
    return { ctx, p, fehler };
}

test('Startseite: Karten für fehlende Werke, die demnächst laufen', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await startseite();
    try {
        await p.waitForSelector('.gelegenheit');
        const karten = await p.$$eval('.gelegenheit', els => els.map(e => ({
            werk: e.dataset.werk,
            text: e.innerText,
            knoepfe: [...e.querySelectorAll('button')].map(b => b.innerText.trim()),
        })));
        assert.ok(karten.length >= 1 && karten.length <= 3, `${karten.length} Karten`);
        // Nichts Gesehenes, und jede Karte nennt Termin und Haus.
        for (const k of karten) {
            assert.ok(!BESUCHE.some(b => b.operaId === k.werk), `${k.werk} ist schon gesehen`);
            assert.match(k.text, /(ab |heute|morgen|\d+\. \w{3})/, `kein Termin: ${k.text}`);
            assert.deepEqual(k.knoepfe, ['Merken', 'Gesehen']);
        }
        // Verdi zuerst, Mozart danach – reihum statt dreimal Verdi.
        assert.match(karten[0].text, /Verdi · du kennst 3 von/);
        if (karten.length > 1) assert.match(karten[1].text, /Mozart · du kennst 1 von/);

        // Die Sammlung: Balken je Komponist, aufgeklappt die fehlenden Werke.
        const zeilen = await p.$$eval('.sammlung__zeile', els => els.map(e => e.querySelector('.sammlung__name').textContent));
        assert.deepEqual(zeilen.slice(0, 2), ['Giuseppe Verdi', 'Wolfgang Amadeus Mozart']);
        await p.click('.sammlung__zeile summary');
        assert.ok(await p.isVisible('.sammlung__zeile .blindspot__work--laeuft'), 'kein laufendes Werk markiert');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('„Gesehen“ nimmt das Werk heraus, „Merken“ setzt es auf die Wunschliste', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await startseite();
    try {
        await p.waitForSelector('.gelegenheit');
        const erstes = await p.$eval('.gelegenheit', e => e.dataset.werk);
        await p.click(`.gelegenheit[data-werk="${erstes}"] button[data-aktion="gesehen"]`);
        await p.waitForFunction(w => !document.querySelector(`.gelegenheit[data-werk="${w}"]`), erstes);
        assert.ok(await p.evaluate(w => import('/src/store/store.js').then(m => m.store.isSeenOpera(w)), erstes));
        assert.ok((await p.evaluate(() => window.__seen)).includes(erstes), 'nicht gespeichert');

        const zweites = await p.$eval('.gelegenheit', e => e.dataset.werk);
        await p.click(`.gelegenheit[data-werk="${zweites}"] button[data-aktion="wunsch"]`);
        await p.waitForFunction(w => document.querySelector(`.gelegenheit[data-werk="${w}"] button[data-aktion="wunsch"]`)?.innerText.includes('Gemerkt'), zweites);
        assert.ok(await p.evaluate(w => import('/src/store/store.js').then(m => m.store.isOnWishlist(w)), zweites));
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Seite „Opern“: zugeklappt über dem Katalog', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await startseite('#/operas');
    try {
        await p.waitForSelector('details.blindspots');
        assert.equal(await p.$eval('details.blindspots', d => d.open), false);
        assert.match(await p.innerText('details.blindspots summary'), /Was dir noch fehlt/);
        await p.click('details.blindspots summary');
        assert.ok(await p.isVisible('details.blindspots .gelegenheit'));
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});
