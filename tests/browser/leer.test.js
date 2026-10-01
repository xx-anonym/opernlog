// Leere Seiten (src/components/Leer.js): Zeichen, eine Zeile, höchstens ein
// Satz und ein Knopf (Jonas, 1.10.2026). Die Listen heißen dabei nirgends
// mehr "Sammlungen" – so heißt seit dem 30.9.2026 etwas anderes.
//
// Dazu der Kopf von Werk- und Hausseite: über dem Bild liegt ein dunkler
// Verlauf für die Lesbarkeit. Er darf den Zurück-Knopf nicht zudecken.

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

async function oeffne(hash) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html${hash}`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await vorhangAuf(p);
    return { ctx, p, fehler };
}

const leer = p => p.evaluate(() => {
    const el = document.querySelector('.empty-state.leer');
    return el && {
        zeichen: !!el.querySelector('.leer__zeichen svg'),
        titel: el.querySelector('.leer__titel')?.textContent.trim(),
        knopf: el.querySelector('.leer__knopf')?.getAttribute('href') ?? null,
        ausrufe: el.textContent.includes('!'),
    };
});

test('leere Wunschliste: Zeichen, Zeile, Knopf zu den Opern', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/wishlist');
    try {
        await p.waitForSelector('.leer');
        assert.deepEqual(await leer(p), { zeichen: true, titel: 'Deine Wunschliste ist leer', knopf: '#/operas', ausrufe: false });
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('keine Listen: leere Seite – und von "Sammlungen" ist keine Rede', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/lists');
    try {
        await p.waitForSelector('.leer');
        assert.deepEqual(await leer(p), { zeichen: true, titel: 'Noch keine Listen', knopf: null, ausrufe: false });
        assert.doesNotMatch(await p.textContent('.page'), /Sammlung/);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('keine Freunde: leere Seite unter dem Einladen-Knopf', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/community');
    try {
        await p.waitForSelector('.leer');
        assert.deepEqual(await leer(p), { zeichen: true, titel: 'Noch keine Freunde', knopf: null, ausrufe: false });
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Kopf von Werk- und Hausseite: Verlauf über dem Bild, Zurück bleibt anklickbar', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    for (const hash of ['#/opera/rigoletto', '#/house/semperoper']) {
        const { ctx, p } = await oeffne(hash);
        try {
            await p.waitForSelector('.detail-hero .back-link');
            const stand = await p.evaluate(() => {
                const kopf = document.querySelector('.detail-hero');
                const mitte = (el) => { const r = el.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); };
                const vor = getComputedStyle(kopf, '::before');
                return {
                    verlauf: vor.content !== 'none' ? vor.backgroundImage : '',
                    // Über dem Verlauf gemalt wird nur, was selbst positioniert ist.
                    obenauf: ['.back-link', '.detail-hero__content']
                        .map(s => getComputedStyle(kopf.querySelector(s)).position),
                    zurueck: mitte(kopf.querySelector('.back-link'))?.closest('.back-link') !== null,
                    titel: mitte(kopf.querySelector('.detail-hero__title'))?.closest('.detail-hero__title') !== null,
                };
            });
            assert.match(stand.verlauf, /linear-gradient/, hash);
            assert.deepEqual(stand.obenauf, ['relative', 'relative'], `${hash}: Text unter dem Verlauf`);
            assert.equal(stand.zurueck, true, `${hash}: Zurück verdeckt`);
            assert.equal(stand.titel, true, `${hash}: Titel verdeckt`);
        } finally { await ctx.close(); }
    }
});
