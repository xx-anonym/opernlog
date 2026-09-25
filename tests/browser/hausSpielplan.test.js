// "Demnächst hier" auf der Seite eines Hauses: was dort laut Spielplan läuft.
//
// Vorher stand dort nur "Aufgeführte Werke" – in Wahrheit die Werke, die
// Nutzer dort geloggt hatten –, obwohl die Termine des Hauses vorlagen.
//
// Die Uhr steht fest auf dem 1. Oktober 2026, sonst veralteten die Tests mit
// src/data/spielplan.js.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { starteServer, ladePlaywright, starteBrowser, ersetzeSupabase } from './umgebung.js';
import { abendeImHaus } from '../../src/data/spielplanAbfrage.js';

const pw = await ladePlaywright();
const fehltPlaywright = pw ? false : 'Playwright ist nicht installiert';
const HEUTE = '2026-10-01';

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

async function hausSeite(hausId, { merken = [] } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await p.clock.setFixedTime(new Date(`${HEUTE}T10:00:00Z`));
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html`);
    await p.waitForFunction(() => import('/src/store/store.js').then(m => m.store.isCloud));
    for (const id of merken) await p.evaluate(w => import('/src/store/store.js').then(m => m.store.addToWishlist(w)), id);
    await p.waitForSelector('#splash', { state: 'detached' }).catch(() => {});
    await p.evaluate(h => { location.hash = `#/house/${h}`; }, hausId);
    await p.waitForSelector('#hausSpielplan .section__title');
    return { ctx, p, fehler };
}

test('die Seite eines Hauses zeigt, was dort demnächst läuft', { skip: fehltPlaywright }, async () => {
    const gemerkt = 'tosca';
    const { ctx, p, fehler } = await hausSeite('semperoper', { merken: [gemerkt] });
    try {
        // Im Browser gerechnet: dort kennt der Katalog nur, was geladen ist.
        const erwartet = await p.evaluate(h => Promise.all([import('/src/data/spielplanAbfrage.js'), import('/src/data/operas.js')])
            .then(([s, o]) => s.abendeImHaus('semperoper', { heute: h }).filter(a => o.operas.some(w => w.id === a.werk))), HEUTE);
        assert.ok(erwartet.length > 2, 'Testvoraussetzung: die Semperoper hat mehr als zwei Abende');
        assert.ok(erwartet.some(a => a.werk === gemerkt), 'Testvoraussetzung: Tosca läuft an der Semperoper');
        assert.match(await p.innerText('#hausSpielplan'), new RegExp(`${erwartet.length} Abende`));
        // Erst die nächsten zwei, in der Reihenfolge der Termine, dann auf Knopfdruck alle.
        assert.equal(await p.locator('#hausSpielplan .naehe-abend').count(), 2);
        const erste = await p.$eval('#hausSpielplan .naehe-abend__werk', a => a.getAttribute('href'));
        assert.equal(erste, `#/opera/${erwartet[0].werk}`);
        await p.click('#hausSpielplan [data-aktion="alle"]');
        assert.equal(await p.locator('#hausSpielplan .naehe-abend').count(), erwartet.length);
        assert.match(await p.innerText('#hausSpielplan [data-aktion="alle"]'), /Weniger zeigen/);
        // Ein Werk der Wunschliste trägt den Stern (aufgeklappt, damit es sicher dasteht).
        assert.ok(await p.$(`#hausSpielplan a.naehe-abend__werk[href="#/opera/${gemerkt}"] .naehe-abend__stern`), 'kein Stern am gemerkten Werk');
        // Wieder zuklappen: zurück auf zwei.
        await p.click('#hausSpielplan [data-aktion="alle"]');
        assert.equal(await p.locator('#hausSpielplan .naehe-abend').count(), 2);
        // "Hier geloggt" statt "Aufgeführte Werke"
        assert.doesNotMatch(await p.innerText('body'), /Aufgeführte Werke/);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('ohne Termine sagt die Seite, warum nichts dasteht', { skip: fehltPlaywright }, async () => {
    assert.equal(abendeImHaus('haus-fuer-mozart', { heute: HEUTE }).length, 0, 'Testvoraussetzung');
    const { ctx, p, fehler } = await hausSeite('haus-fuer-mozart');
    try {
        assert.match(await p.innerText('#hausSpielplan'), /keine Termine vor/);
        assert.equal(await p.locator('#hausSpielplan .naehe-abend').count(), 0);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});
