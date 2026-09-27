// Der Kopf einer Werk- oder Hausseite darf beim Laden nicht die Höhe
// wechseln. Das Bild füllt ihn aus (background-size: cover); ändert sich die
// Höhe, springt es auf eine neue Größe. Bis die Bewertungen da sind, steht
// im Kopf ein Ladekreisel, danach Sterne oder "Noch keine Bewertungen" –
// alle drei müssen gleich viel Platz brauchen.

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

async function kopfHoehen(seite, slot, viewport) {
    const ctx = await browser.newContext({ viewport });
    const p = await ctx.newPage();
    try {
        await ersetzeSupabase(p);
        await p.goto(`${server.url}/index.html`);
        await p.waitForFunction(() => !!window.supabase);
        await p.evaluate(s => { location.hash = s; }, seite);
        await p.waitForSelector(slot);
        return await p.evaluate(async (slot) => {
            const { StarRating } = await import('/src/components/StarRating.js');
            const el = document.querySelector(slot);
            const kopf = el.closest('.detail-hero');
            const hoehe = () => Math.round(kopf.getBoundingClientRect().height);
            el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
            const kreisel = hoehe();
            el.innerHTML = '<span class="text-muted">Noch keine Bewertungen</span>';
            const keine = hoehe();
            el.innerHTML = '';
            el.appendChild(StarRating(3.5, false, null, 'lg'));
            const anzahl = document.createElement('span');
            anzahl.className = 'detail-hero__rating-count';
            anzahl.textContent = '12 Bewertungen';
            el.appendChild(anzahl);
            const sterne = hoehe();
            return { kreisel, keine, sterne };
        }, slot);
    } finally { await ctx.close(); }
}

for (const [name, viewport] of [['Handy', { width: 390, height: 844 }], ['Rechner', { width: 1280, height: 800 }]]) {
    test(`Werkseite (${name}): der Kopf ist beim Laden so hoch wie danach`, { skip: fehltPlaywright, timeout: 60000 }, async () => {
        const h = await kopfHoehen('#/opera/tosca', '#operaRating', viewport);
        assert.equal(h.kreisel, h.sterne, JSON.stringify(h));
        assert.equal(h.keine, h.sterne, JSON.stringify(h));
    });
}

test('Hausseite: der Kopf ist beim Laden so hoch wie danach', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const h = await kopfHoehen('#/house/semperoper', '#houseRating', { width: 390, height: 844 });
    assert.equal(h.kreisel, h.sterne, JSON.stringify(h));
    assert.equal(h.keine, h.sterne, JSON.stringify(h));
});
