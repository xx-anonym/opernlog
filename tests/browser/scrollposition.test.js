// Zurück zu einer Liste soll dort landen, wo man sie verlassen hat.
//
// Der Router sprang bei jedem Wechsel nach oben. Wer sich durch 106 Werke
// gescrollt, eines angesehen und dann "Zurück" gedrückt hat, fing wieder ganz
// oben an – und musste den Weg jedes Mal neu machen.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { starteServer, ladePlaywright, starteBrowser, ersetzeSupabase } from './umgebung.js';

const pw = await ladePlaywright();
const fehltPlaywright = pw ? false : 'Playwright ist nicht installiert';

const HANDY = { width: 390, height: 844 };
const RECHNER = { width: 1200, height: 900 };

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

async function oeffne(viewport, hash) {
    const ctx = await browser.newContext({ viewport });
    const p = await ctx.newPage();
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html${hash}`);
    return { ctx, p };
}

/**
 * Eine Karte, die gerade vollständig im Bild ist.
 *
 * Wichtig: ein Klick auf eine Karte außerhalb des Bildes rollt die Seite erst
 * dorthin. Die App merkt sich dann völlig zu Recht diese neue Position – der
 * Test hätte gegen seinen eigenen Scroll gemessen und Fehler gemeldet, wo
 * keine sind.
 */
async function sichtbareKarte(p, wahl) {
    const karten = p.locator(wahl);
    const hoehe = p.viewportSize().height;
    for (let i = 0; i < await karten.count(); i++) {
        const box = await karten.nth(i).boundingBox();
        if (box && box.y > 40 && box.y + box.height < hoehe - 40) return karten.nth(i);
    }
    return null;
}

async function pruefeRueckkehr(viewport, { liste, wahl, detailPraefix }) {
    const { ctx, p } = await oeffne(viewport, liste);
    try {
        await p.waitForSelector(wahl, { timeout: 15000 });
        await p.waitForTimeout(1800);       // Bilder geben der Seite ihre Höhe

        await p.evaluate(() => window.scrollTo({ top: 1500, left: 0, behavior: 'instant' }));
        await p.waitForTimeout(400);
        const vorher = await p.evaluate(() => window.scrollY);
        assert.ok(vorher > 500, `die Liste ist zu kurz zum Prüfen (${vorher})`);

        const karte = await sichtbareKarte(p, wahl);
        assert.ok(karte, 'keine sichtbare Karte gefunden');
        await karte.click();
        await p.waitForFunction(
            (praefix) => window.location.hash.startsWith(praefix), detailPraefix, { timeout: 5000 });
        await p.waitForTimeout(600);

        // Die Detailseite selbst beginnt oben – sonst landet man mitten im Text.
        assert.equal(await p.evaluate(() => window.scrollY), 0, 'Detailseite startet nicht oben');

        await p.goBack();
        await p.waitForTimeout(1500);

        assert.equal(await p.evaluate(() => window.location.hash), liste);
        const nachher = await p.evaluate(() => window.scrollY);
        assert.ok(Math.abs(nachher - vorher) <= 4,
            `verlassen bei ${vorher}, zurück bei ${nachher}`);
    } finally { await ctx.close(); }
}

const OPERN = { liste: '#/operas', wahl: '.opera-card', detailPraefix: '#/opera/' };
const HAEUSER = { liste: '#/houses', wahl: '.house-card', detailPraefix: '#/house/' };

test('Opern: zurück landet an derselben Stelle (Handy)', { skip: fehltPlaywright }, async () => {
    await pruefeRueckkehr(HANDY, OPERN);
});

test('Opern: zurück landet an derselben Stelle (Rechner)', { skip: fehltPlaywright }, async () => {
    await pruefeRueckkehr(RECHNER, OPERN);
});

test('Opernhäuser: zurück landet an derselben Stelle', { skip: fehltPlaywright }, async () => {
    await pruefeRueckkehr(HANDY, HAEUSER);
});

test('eine neue Seite beginnt oben, nicht bei der Position der vorigen', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffne(RECHNER, '#/operas');
    try {
        await p.waitForSelector('.opera-card', { timeout: 15000 });
        await p.waitForTimeout(1500);
        await p.evaluate(() => window.scrollTo({ top: 1200, left: 0, behavior: 'instant' }));
        await p.waitForTimeout(300);

        await p.evaluate(() => { window.location.hash = '#/houses'; });
        await p.waitForSelector('.house-card', { timeout: 15000 });
        await p.waitForTimeout(800);
        assert.equal(await p.evaluate(() => window.scrollY), 0);
    } finally { await ctx.close(); }
});

test('die Rückkehr springt sofort, ohne sichtbar durch die Liste zu rollen', { skip: fehltPlaywright }, async () => {
    // Für die Seite gilt scroll-behavior: smooth. Beim Wiederherstellen ist das
    // falsch – der Browser scrollt dann durch die ganze Liste, und weil dabei
    // mehrfach nachgesetzt wird, schaukelt es sich auf: gemessen landete eine
    // Rückkehr statt bei 1396 bei 2691.
    const { ctx, p } = await oeffne(HANDY, '#/operas');
    try {
        await p.waitForSelector('.opera-card', { timeout: 15000 });
        await p.waitForTimeout(1800);
        await p.evaluate(() => window.scrollTo({ top: 1500, left: 0, behavior: 'instant' }));
        await p.waitForTimeout(400);
        const vorher = await p.evaluate(() => window.scrollY);

        const karte = await sichtbareKarte(p, '.opera-card');
        await karte.click();
        await p.waitForFunction(() => window.location.hash.startsWith('#/opera/'), null, { timeout: 5000 });
        await p.waitForTimeout(600);

        await p.goBack();
        await p.waitForTimeout(250);        // kurz nach dem Wechsel …
        const frueh = await p.evaluate(() => window.scrollY);
        assert.ok(Math.abs(frueh - vorher) <= 4,
            `nach 250 ms erst bei ${frueh} statt ${vorher} – da rollt etwas sichtbar`);
    } finally { await ctx.close(); }
});
