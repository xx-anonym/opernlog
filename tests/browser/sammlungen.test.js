// Sammlungen: im Profil die drei vordersten mit Balken, unter #/sammlungen
// alle mit ihren Teilen. Gezählt wird Geloggtes und "schon gesehen"; zu
// einem fehlenden Werk steht, wo es als Nächstes läuft. Der Spielplan ist
// durch feste Daten ersetzt (wie in kalender.test.js).

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
const heute = new Date();
const iso = tage => { const d = new Date(heute); d.setDate(d.getDate() + tage); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const SPIELPLAN = `
export const SPIELPLAN_STAND = '${iso(-1)}';
export const SPIELPLAN_ZUSATZWERKE = [];
export const spielplan = [
  { werk: 'ring-siegfried', haus: 'oper-leipzig', url: 'https://www.oper-leipzig.de/siegfried', termine: ['${iso(12)}'] },
];`;

// Walküre geloggt, Rheingold als gesehen markiert: Ring 2 von 4.
const BESUCHE = [
    { id: 'v1', user_id: UID, opera_id: 'ring-walkuere', house_id: 'staatsoper-berlin', date: '2026-05-01', rating: 4 },
];

async function oeffne(hash) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await p.route('**/src/data/spielplan.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: SPIELPLAN }));
    await p.addInitScript(([b, s]) => { window.__besucheVorgabe = b; window.__seenVorgabe = s; }, [BESUCHE, ['ring-rheingold']]);
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html${hash}`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await vorhangAuf(p);
    return { ctx, p, fehler };
}

test('im Profil: die vordersten Sammlungen mit Stand, der Ring zuerst', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/profile');
    try {
        await p.waitForSelector('.profil-sammlungen .sammlung__kopf');
        const zeilen = await p.$$eval('.profil-sammlungen .sammlung__kopf', zs => zs.map(z => z.textContent.replace(/\s+/g, ' ').trim()));
        assert.equal(zeilen.length, 3);
        assert.match(zeilen[0], /Der Ring des Nibelungen 2 von 4/);
        // Die Berliner Häuser: ein Abend in der Staatsoper.
        assert.ok(zeilen.some(z => /Die drei Berliner Opernhäuser 1 von 3/.test(z)), zeilen.join(' | '));
        assert.equal(await p.getAttribute('.profil-sammlungen .sammlung__balken', 'aria-label'), '2 von 4');

        // Die Zeile führt zur Sammlung, aufgeklappt.
        await p.click('.profil-sammlungen .sammlung__kopf');
        await p.waitForSelector('#sammlung-ring[open]');
        assert.equal(await p.locator('.page--sammlungen details[open]').count(), 1);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('#/sammlungen: gesehene Teile abgehakt, beim fehlenden Werk der nächste Termin', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/sammlungen/ring');
    try {
        await p.waitForSelector('#sammlung-ring[open]');
        const gesehen = await p.$$eval('#sammlung-ring .sammlung__gesehen', ts => ts.map(t => t.textContent.trim()));
        assert.deepEqual(gesehen, ['Das Rheingold', 'Die Walküre']);
        // Siegfried läuft demnächst in Leipzig: goldener Punkt, Termin im
        // Hinweis darüber und beim Überfahren.
        const siegfried = p.locator('#sammlung-ring a[href="#/opera/ring-siegfried"]');
        assert.match(await siegfried.getAttribute('class'), /blindspot__work--laeuft/);
        assert.match(await siegfried.getAttribute('title'), /^Oper Leipzig · ab /);
        assert.match(await p.textContent('#sammlung-ring .sammlung__hinweis'), /Oper Leipzig · ab /);
        // Ohne Termin im Spielplan kein Punkt.
        const goetterdaemmerung = p.locator('#sammlung-ring a[href="#/opera/ring-goetterdaemmerung"]');
        assert.doesNotMatch(await goetterdaemmerung.getAttribute('class'), /laeuft/);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});
