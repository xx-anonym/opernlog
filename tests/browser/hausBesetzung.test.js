// Mitwirkende, wie das Haus sie angibt, als Vorschlag beim Loggen (Beta,
// src/data/hausBesetzung.js; bisher nur die Oper Leipzig). Die Datei
// daten/besetzung/oper-leipzig.json liefert hier ein Nachbau – je Termin
// eine andere Tatjana, wie in Wirklichkeit.

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

const DATEI = {
    haus: 'oper-leipzig', stand: '2026-11-23', quelle: 'https://www.oper-leipzig.de/de/programm',
    abende: {
        'eugen-onegin|2026-11-28': { zeit: '19:00', dirigent: 'Ivan Repušić', regie: 'Vasily Barkhatov',
            besetzung: [{ rolle: 'Tatjana', name: 'Olesya Golovneva' }, { rolle: 'Eugen Onegin', name: 'Franz Xaver Schlecht' }] },
        'eugen-onegin|2026-12-06': { zeit: '18:00', dirigent: 'Ivan Repušić', regie: 'Vasily Barkhatov',
            besetzung: [{ rolle: 'Tatjana', name: 'Olena Tokar' }, { rolle: 'Eugen Onegin', name: 'Franz Xaver Schlecht' }] },
    },
};

async function formular(hash) {
    // Ohne Service Worker: sonst holt er die Datei, und page.route sieht es nicht.
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const fehler = [];
    const abrufe = [];
    p.on('pageerror', e => fehler.push(e.message));
    await ersetzeSupabase(p);
    // Nach ersetzeSupabase: die spätere Regel gewinnt über deren 404.
    await p.route('**/daten/besetzung/**', r => { abrufe.push(r.request().url()); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(DATEI) }); });
    await p.goto(`${server.url}/index.html`);
    await p.waitForSelector('.main-content', { timeout: 15000 });
    await p.evaluate(h => { location.hash = h; }, hash);
    await p.waitForSelector('#logForm');
    return { ctx, p, fehler, abrufe };
}

const datumSetzen = (p, datum) => p.evaluate((d) => {
    const feld = document.querySelector('#visitDate');
    feld.value = d;
    feld.dispatchEvent(new Event('input', { bubbles: true }));
}, datum);
const knoepfe = p => p.locator('#mitwirkendeVorschlag .chip').allInnerTexts();

test('Oper Leipzig: Dirigat, Regie und die Besetzung genau dieses Termins als Vorschlag', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await formular('#/log?house=oper-leipzig&opera=eugen-onegin');
    try {
        await datumSetzen(p, '2026-12-06');
        await p.locator('#mitwirkendeVorschlag .chip').first().waitFor();
        assert.match(await p.locator('#mitwirkendeVorschlag').innerText(), /Laut Spielplan des Hauses \(Beta\)/);
        assert.deepEqual(await knoepfe(p), ['Dirigent: Ivan Repušić', 'Regie: Vasily Barkhatov', 'Besetzung: 2 Namen', 'Alle übernehmen']);
        // Erst der Klick trägt ein.
        assert.equal(await p.inputValue('#conductorInput'), '');
        await p.click('#mitwirkendeVorschlag .chip:has-text("Alle übernehmen")');
        assert.equal(await p.inputValue('#conductorInput'), 'Ivan Repušić');
        assert.equal(await p.inputValue('#directorInput'), 'Vasily Barkhatov');
        assert.equal(await p.inputValue('#castInput'), 'Olena Tokar (Tatjana)\nFranz Xaver Schlecht (Eugen Onegin)');
        assert.equal(await p.locator('#mitwirkendeVorschlag .chip').count(), 0, 'nach dem Übernehmen bleibt nichts vorzuschlagen');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('ein anderer Termin bringt seine eigene Besetzung, ein Tag ohne Vorstellung keine', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await formular('#/log?house=oper-leipzig&opera=eugen-onegin');
    try {
        await datumSetzen(p, '2026-11-28');
        await p.locator('#mitwirkendeVorschlag .chip').first().waitFor();
        await p.click('#mitwirkendeVorschlag .chip:has-text("Besetzung")');
        assert.match(await p.inputValue('#castInput'), /^Olesya Golovneva \(Tatjana\)/);
        await p.fill('#castInput', '');
        await datumSetzen(p, '2026-11-29');
        await p.waitForTimeout(400);
        assert.equal(await p.locator('#mitwirkendeVorschlag .chip').count(), 0);
    } finally { await ctx.close(); }
});

test('andere Häuser fragen gar nicht erst nach einer Datei', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, abrufe } = await formular('#/log?house=oper-frankfurt&opera=aida');
    try {
        await datumSetzen(p, '2026-10-10');
        await p.waitForTimeout(500);
        assert.deepEqual(abrufe, []);
    } finally { await ctx.close(); }
});
