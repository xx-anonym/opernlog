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

async function oeffne(hash, { besuche = BESUCHE, seenFremd = {}, gesehen = ['ring-rheingold'] } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await p.route('**/src/data/spielplan.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: SPIELPLAN }));
    await p.addInitScript(([b, s, f]) => { window.__besucheVorgabe = b; window.__seenVorgabe = s; window.__seenFremd = f; },
        [besuche, gesehen, seenFremd]);
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

// Bei anderen zählen ihre Abende und ihre Markierungen – beide öffentlich –,
// nicht die des Betrachters.
test('auf dem Profil eines anderen: seine begonnenen Sammlungen', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const FREMD = '22222222-2222-2222-2222-222222222222';
    const { ctx, p, fehler } = await oeffne(`#/profile/${FREMD}`, {
        besuche: [...BESUCHE, { id: 'v9', user_id: FREMD, opera_id: 'ring-walkuere', house_id: 'semperoper', date: '2026-04-01', rating: 5 }],
        seenFremd: { [FREMD]: ['ring-siegfried'] },
    });
    try {
        await p.waitForSelector('.profil-sammlungen details.sammlung__zeile');
        const ring = p.locator('.profil-sammlungen details.sammlung__zeile', { hasText: 'Der Ring des Nibelungen' });
        assert.match((await ring.locator('summary').textContent()).replace(/\s+/g, ' '), /2 von 4/);
        await ring.locator('summary').click();
        const gesehen = await ring.locator('.sammlung__gesehen').allTextContents();
        assert.deepEqual(gesehen.map(t => t.trim()), ['Die Walküre', 'Siegfried']);
        // Nur begonnene; der Link "Alle" führt zu den eigenen, fehlt hier.
        assert.equal(await p.locator('.profil-sammlungen__alle').count(), 0);
        // Auch "Werke gesehen" zählt die Markierung mit.
        assert.equal((await p.textContent('.profile-stats')).match(/(\d+)\s*Werke gesehen/)?.[1], '2');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

// Eine Sammlung erscheint erst mit dem ersten Treffer – "0 von 10"
// demotiviert (Jonas, 1.10.2026).
test('ohne Treffer: kein Abschnitt im Profil, auf #/sammlungen eine leere Seite', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/profile', { besuche: [], gesehen: [] });
    try {
        await p.waitForSelector('#editProfileBtn');
        await p.waitForTimeout(300);
        assert.equal(await p.locator('.profil-sammlungen').count(), 0);
        await p.evaluate(() => { location.hash = '#/sammlungen'; });
        await p.waitForSelector('.page--sammlungen .leer');
        assert.equal((await p.textContent('.leer__titel')).trim(), 'Noch keine Sammlung begonnen');
        assert.equal(await p.locator('.sammlung__zeile').count(), 0);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('#/sammlungen: nur begonnene, keine "0 von", dazu die Zahl der übrigen', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/sammlungen');
    try {
        await p.waitForSelector('.sammlung__zeile');
        const zahlen = await p.$$eval('.sammlung__zahl', zs => zs.map(z => z.textContent.replace(/\s+/g, ' ').trim()));
        assert.ok(zahlen.length > 0);
        assert.ok(zahlen.every(z => !/^0 von/.test(z)), zahlen.join(' | '));
        const { SAMMLUNGEN } = await import('../../src/data/sammlungen.js');
        assert.equal(await p.textContent('.sammlung__weitere'), `${SAMMLUNGEN.length - zahlen.length} weitere erscheinen mit dem ersten passenden Abend.`);
        // Im Profil ebenso.
        await p.evaluate(() => { location.hash = '#/profile'; });
        await p.waitForSelector('.profil-sammlungen .sammlung__zahl');
        const imProfil = await p.$$eval('.profil-sammlungen .sammlung__zahl', zs => zs.map(z => z.textContent.trim()));
        assert.ok(imProfil.every(z => !/^0/.test(z)), imProfil.join(' | '));
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('ein Link auf eine noch nicht begonnene Sammlung zeigt sie trotzdem', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await oeffne('#/sammlungen/salzburg');
    try {
        await p.waitForSelector('#sammlung-salzburg[open]');
        assert.match((await p.textContent('#sammlung-salzburg .sammlung__zahl')).replace(/\s+/g, ' '), /^0 von 3/);
    } finally { await ctx.close(); }
});
