// Bildnachweise in der App: klein im Kopf von Werk- und Hausseite, nur wo
// die Lizenz eine Namensnennung verlangt; alle zusammen unter
// #/bildnachweise, verlinkt neben "Datenschutz".

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
    // Kein Netz nach Commons: was der Test braucht, steht in bildnachweise.js.
    await ctx.route('https://commons.wikimedia.org/**', r => r.abort());
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html${hash}`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await vorhangAuf(p);
    return { ctx, p, fehler };
}

test('Werk mit CC BY-SA: Nachweis unten rechts im Kopf, verlinkt auf Commons', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/opera/la-traviata');
    try {
        await p.waitForSelector('.detail-hero .bildnachweis');
        assert.equal((await p.textContent('.bildnachweis')).replace(/\u00a0/g, ' ').trim(), 'Bild: Christian Michelides · CC BY-SA 4.0');
        assert.match(await p.getAttribute('.bildnachweis', 'href'), /^https:\/\/commons\.wikimedia\.org\/wiki\/File:/);
        // Klein: höchstens 11 px.
        assert.ok(parseFloat(await p.$eval('.bildnachweis', el => getComputedStyle(el).fontSize)) <= 11);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Haus mit CC BY-SA: Nachweis im Kopf', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await oeffne('#/house/bayerische-staatsoper');
    try {
        await p.waitForSelector('.detail-hero .bildnachweis');
        assert.equal((await p.textContent('.bildnachweis')).replace(/\u00a0/g, ' ').trim(), 'Bild: Burkhard Mücke · CC BY-SA 4.0');
    } finally { await ctx.close(); }
});

test('gemeinfreies Bild: keine Zeile im Kopf', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await oeffne('#/opera/zauberflote');
    try {
        await p.waitForSelector('.detail-hero .back-link');
        await p.waitForTimeout(300);
        assert.equal(await p.locator('.bildnachweis').count(), 0);
    } finally { await ctx.close(); }
});

test('#/bildnachweise listet Werke, Häuser und Komponisten mit Lizenz', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/bildnachweise');
    try {
        await p.waitForSelector('.nachweise__eintrag');
        const titel = await p.$$eval('.nachweise__titel', h => h.map(x => x.textContent));
        assert.deepEqual(titel, ['Werke', 'Häuser', 'Komponisten']);
        const traviata = await p.locator('.nachweise__eintrag', { hasText: 'La Traviata' }).first().textContent();
        assert.match(traviata, /Christian Michelides · CC BY-SA 4\.0 · Commons/);
        assert.ok(await p.locator('.nachweise__eintrag').count() > 200);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

// Ein Bild, das noch nicht in bildnachweise.js steht (der Admin hat das Werk
// gerade angelegt): die App fragt Commons selbst, einmal je Datei.
test('neues Bild: Nachweis von Commons geholt, einmal je Datei', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    let anfragen = 0;
    await ctx.route('https://commons.wikimedia.org/w/api.php**', (r) => {
        anfragen++;
        r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ query: { pages: { 1: { imageinfo: [{
            descriptionurl: 'https://commons.wikimedia.org/wiki/File:Neu.jpg',
            extmetadata: { Artist: { value: '<a href="x">Erika Muster</a>' }, LicenseShortName: { value: 'CC BY 4.0' }, AttributionRequired: { value: 'true' } },
        }] } } } }) });
    });
    try {
        await ersetzeSupabase(p);
        await p.goto(`${server.url}/index.html#/houses`);
        await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
        const zeilen = await p.evaluate(async () => {
            const { nachweisFuer } = await import('/src/components/Bildnachweis.js');
            const { nachweisZeile } = await import('/src/data/bildnachweisRegeln.js');
            const url = 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/12/Neu.jpg/500px-Neu.jpg';
            const [a, b] = await Promise.all([nachweisFuer(url), nachweisFuer(url)]);
            return [nachweisZeile(a), a.pflicht, a === b];
        });
        assert.deepEqual(zeilen, ['Bild: Erika Muster · CC BY 4.0', true, true]);
        assert.equal(anfragen, 1);
    } finally { await ctx.close(); }
});
