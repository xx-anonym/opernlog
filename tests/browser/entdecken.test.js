// Der geheime Entdecken-Modus (src/entdecken.js): Strg/Cmd+E öffnet ein
// Fenster mit einem Knopf, der eine zufällige Aufnahme in neuem Tab öffnet.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { starteServer, ladePlaywright, starteBrowser, ersetzeSupabase } from './umgebung.js';

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

const LINKS = [
    { werk_id: 'tosca', stelle: 'Vissi d’arte', url: 'https://www.youtube.com/watch?v=lxNThjjuqBk' },
    { werk_id: 'turandot', stelle: 'Nessun dorma', url: 'https://www.youtube.com/watch?v=cWc7vYjgnTs' },
    { werk_id: 'la-boheme', stelle: 'Che gelida manina', url: 'https://www.youtube.com/watch?v=B4o4vDYQKA4' },
];

async function oeffnen({ abgemeldet = false, blockiert = false } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await ersetzeSupabase(p);
    await p.addInitScript(({ links, ab, block }) => {
        window.__stellenLinksVorgabe = links;
        if (ab) window.__ohneSitzungVorgabe = true;
        // Neue Tabs mitschreiben statt öffnen.
        window.__geoeffnet = [];
        window.open = (url) => { window.__geoeffnet.push(url); return block ? null : {}; };
    }, { links: LINKS, ab: abgemeldet, block: blockiert });
    await p.goto(`${server.url}/index.html`);
    await p.waitForSelector('.main-content, .landing', { timeout: 15000 });
    return { ctx, p, fehler };
}

const dialogOffen = p => p.evaluate(() => !!document.querySelector('dialog.entdecken')?.open);

test('Strg+E öffnet, der Knopf öffnet eine zufällige Aufnahme, Strg+E schließt', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffnen();
    try {
        assert.equal(await p.locator('dialog.entdecken').count(), 0, 'vorher gibt es das Fenster gar nicht');
        await p.keyboard.press('Control+e');
        assert.equal(await dialogOffen(p), true);
        assert.equal(await p.getByRole('heading', { name: 'Entdecken' }).isVisible(), true);
        const knopf = p.getByRole('button', { name: 'Vorhang auf' });
        await knopf.waitFor();
        await p.waitForFunction(() => !document.querySelector('.entdecken__knopf').disabled);
        assert.equal(await p.textContent('.entdecken__zeile'), '3 Aufnahmen warten.');

        await knopf.click();
        const erste = await p.evaluate(() => window.__geoeffnet[0]);
        assert.ok(LINKS.some(l => l.url === erste), erste);
        const titel = LINKS.find(l => l.url === erste);
        assert.match(await p.textContent('.entdecken__zeile'), new RegExp(titel.stelle));
        // Zweimal hintereinander nie dieselbe.
        await knopf.click();
        const [a, b] = await p.evaluate(() => window.__geoeffnet);
        assert.notEqual(a, b);

        await p.keyboard.press('Control+e');
        assert.equal(await dialogOffen(p), false);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Cmd+E und Escape; auch ohne Anmeldung', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffnen({ abgemeldet: true });
    try {
        await p.keyboard.press('Meta+e');
        assert.equal(await dialogOffen(p), true);
        await p.waitForFunction(() => !document.querySelector('.entdecken__knopf').disabled);
        await p.keyboard.press('Escape');
        await p.waitForFunction(() => !document.querySelector('dialog.entdecken').open);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('blockiert der Browser den Tab, steht der Link da', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffnen({ blockiert: true });
    try {
        await p.keyboard.press('Control+e');
        await p.waitForFunction(() => !document.querySelector('.entdecken__knopf').disabled);
        await p.getByRole('button', { name: 'Vorhang auf' }).click();
        const link = p.locator('.entdecken__zeile .entdecken__aufnahme');
        assert.ok(LINKS.map(l => l.url).includes(await link.getAttribute('href')));
        assert.equal(await link.getAttribute('target'), '_blank');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('der Titel unter dem Knopf führt auf die Seite der Oper', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffnen();
    try {
        await p.keyboard.press('Control+e');
        await p.waitForFunction(() => !document.querySelector('.entdecken__knopf').disabled);
        await p.getByRole('button', { name: 'Vorhang auf' }).click();
        const geoeffnet = await p.evaluate(() => window.__geoeffnet[0]);
        const a = LINKS.find(l => l.url === geoeffnet);
        await p.locator('.entdecken__zeile .entdecken__werk').click();
        await p.waitForFunction(w => location.hash === `#/opera/${w}`, a.werk_id);
        assert.equal(await dialogOffen(p), false);
        // Die Aufnahme lief im neuen Tab, nicht noch einmal hier.
        assert.equal(await p.evaluate(() => window.__geoeffnet.length), 1);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('ohne Taste: nichts zu sehen', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await oeffnen();
    try {
        await p.keyboard.press('e');
        await p.keyboard.press('Control+f');
        assert.equal(await p.locator('dialog.entdecken').count(), 0);
    } finally { await ctx.close(); }
});
