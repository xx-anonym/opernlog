// Die Besetzung als Personen: Namen in den Karten führen auf die
// Personenseite mit allen eigenen Abenden, beim Loggen schlägt das Feld
// Besetzung bekannte Namen vor, und der Saisonrückblick nennt die
// meistgehörten Stimmen.

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

const ICH = 'user-me';
const RIGOLETTO = {
    id: 'rigo', userId: ICH, operaId: 'rigoletto', houseId: 'staatsoper-berlin', date: '2026-09-11', rating: 4.5,
    conductor: 'Domingo Hindoyan', director: 'Bartlett Sher',
    castList: 'Ben Bliss (Herzog von Mantua)\nSimon Keenlyside (Rigoletto)',
};
const TOSCA = {
    id: 'tosca1', userId: ICH, operaId: 'tosca', houseId: 'semperoper', date: '2026-10-03', rating: 4,
    conductor: 'Domingo Hindoyan', castList: 'Tosca: Anna Netrebko\nben bliss (Cavaradossi)',
};

async function oeffne(hash, eigene = [RIGOLETTO, TOSCA]) {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await p.evaluate(v => import('/src/store/store.js').then(m => { m.store.data.myVisits = v; }), eigene);
    await p.evaluate(h => { window.location.hash = h; }, hash);
    await vorhangAuf(p);
    return { ctx, p, fehler };
}

test('ein Name in der Karte führt auf die Personenseite mit allen eigenen Abenden und Rollen', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/profile');
    try {
        const karte = p.locator('.review-card', { hasText: 'Tosca' });
        await karte.locator('a.person-link', { hasText: 'ben bliss' }).click();
        await p.waitForSelector('.person-abende');
        assert.equal(await p.evaluate(() => location.hash), '#/person/ben%20bliss');
        // Die häufigere Schreibweise gibt den Namen; beide Abende stehen da.
        assert.equal((await p.textContent('.composer-hero__name')).trim(), 'Ben Bliss');
        const zeilen = await p.locator('.person-abende__zeile').evaluateAll(z => z.map(e => e.innerText.replace(/\s+/g, ' ').trim()));
        assert.equal(zeilen.length, 2);
        assert.match(zeilen[0], /Tosca.*Cavaradossi/);
        assert.match(zeilen[1], /Rigoletto.*Herzog von Mantua/);
        // Zurück führt ins Profil – nicht über den Besuch, dessen Karte den
        // Klick sonst auch bekommen hätte.
        await p.goBack();
        await p.waitForFunction(() => location.hash !== '#/person/ben%20bliss');
        assert.equal(await p.evaluate(() => location.hash), '#/profile');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Dirigent und Regie sind ebenfalls Personen – "am Pult", "Regie"', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await oeffne('#/profile');
    try {
        await p.locator('.review-card', { hasText: 'Tosca' }).locator('a.person-link', { hasText: 'Domingo Hindoyan' }).click();
        await p.waitForSelector('.person-abende');
        assert.match(await p.textContent('.composer-hero__zahlen'), /2 Abende am Pult/);
        assert.deepEqual(await p.locator('.person-abende__als').allTextContents(), ['am Pult', 'am Pult']);
        // Eine Zeile führt auf den Besuch.
        await p.locator('.person-abende__zeile').first().click();
        await p.waitForFunction(() => location.hash === '#/visit/tosca1');
    } finally { await ctx.close(); }
});

test('die Zeile bleibt, wie sie eingetragen wurde, und der Name ist trotzdem ein Link', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await oeffne('#/profile');
    try {
        const wert = p.locator('.review-card', { hasText: 'Tosca' }).locator('.credit', { hasText: 'Besetzung' }).locator('.credit__value');
        assert.equal((await wert.innerText()).trim(), 'Tosca: Anna Netrebko\nben bliss (Cavaradossi)');
        assert.deepEqual(await wert.locator('a.person-link').allTextContents(), ['Anna Netrebko', 'ben bliss']);
    } finally { await ctx.close(); }
});

test('beim Loggen schlägt die Besetzung bekannte Namen vor und lässt die Rolle stehen', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await oeffne('#/log');
    try {
        await p.waitForSelector('#castInput', { state: 'attached' });
        await p.evaluate(() => { const d = document.querySelector('#castInput').closest('details'); if (d) d.open = true; });
        const feld = p.locator('#castInput');
        await feld.click();
        await feld.type('Ben');
        await p.waitForSelector('#castVorschlaege .autocomplete__item');
        assert.deepEqual(await p.locator('#castVorschlaege .autocomplete__item strong').allTextContents(), ['Ben Bliss']);
        await p.locator('#castVorschlaege .autocomplete__item').first().dispatchEvent('mousedown');
        assert.equal(await feld.inputValue(), 'Ben Bliss');
        await feld.type(' (Duca)\nAnna N');
        await p.waitForSelector('#castVorschlaege .autocomplete__item');
        await p.locator('#castVorschlaege .autocomplete__item', { hasText: 'Anna Netrebko' }).dispatchEvent('mousedown');
        assert.equal(await feld.inputValue(), 'Ben Bliss (Duca)\nAnna Netrebko');

        // Den Namen vor einer schon eingetragenen Rolle ergänzen: die Rolle bleibt.
        await feld.fill('Sim (Rigoletto)');
        await feld.evaluate(f => { f.setSelectionRange(3, 3); f.dispatchEvent(new Event('input')); });
        await p.waitForSelector('#castVorschlaege .autocomplete__item');
        await p.locator('#castVorschlaege .autocomplete__item', { hasText: 'Simon Keenlyside' }).dispatchEvent('mousedown');
        assert.equal(await feld.inputValue(), 'Simon Keenlyside (Rigoletto)');

        // In der Rolle wird nichts vorgeschlagen.
        await feld.evaluate(f => { f.setSelectionRange(f.value.length - 2, f.value.length - 2); f.dispatchEvent(new Event('input')); });
        assert.equal(await p.isVisible('#castVorschlaege'), false);
    } finally { await ctx.close(); }
});

test('der Saisonrückblick nennt die meistgehörten Stimmen – ab zwei Abenden', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await oeffne('#/season/2026');
    try {
        await p.waitForSelector('.season-card');
        const karte = p.locator('.season-card', { hasText: 'Meistgehörte Stimmen' });
        assert.equal((await karte.locator('.season-card__value').textContent()).trim(), 'Ben Bliss');
        assert.match(await karte.locator('.season-card__note').textContent(), /2 Abende/);
        // Anna Netrebko sang nur einmal: keine eigene Nennung.
        assert.doesNotMatch(await karte.textContent(), /Netrebko/);
    } finally { await ctx.close(); }
});
