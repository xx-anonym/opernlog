// Was andere geschrieben haben, darf im eigenen Browser nichts anrichten.
//
// Benutzernamen, Werk- und Hauskennungen, Noten: das alles kommt aus der
// Datenbank, und dorthin schreibt jedes Konto selbst – über die App oder an
// ihr vorbei über die offene Schnittstelle. Nachgestellt am 22.09.2026:
//
// * Ein Benutzername wie <img onerror="…"> lief nach dem Annehmen einer
//   Einladung im Browser des Eingeladenen als Code.
// * Dasselbe als Werk eines Besuchs im Freunde-Feed.
// * Eine einzige Note über 5 legte den Freunde-Feed lahm.
//
// Die Datenbank lehnt Werk, Haus und Note inzwischen selbst ab (siehe
// visits_pruefungen_migration.sql). Diese Tests prüfen die App für den Fall,
// dass doch etwas durchkommt – Benutzernamen etwa prüft die Datenbank nicht.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { starteServer, ladePlaywright, starteBrowser, ersetzeSupabase } from './umgebung.js';

const RECHNER = { width: 1100, height: 900 };
const ICH = '11111111-1111-1111-1111-111111111111';
const DU = '22222222-2222-2222-2222-222222222222';
const SCHADCODE = '<img src=x onerror="window.__xss = (window.__xss || 0) + 1">';

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

async function starte() {
    const ctx = await browser.newContext({ viewport: RECHNER });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await p.waitForSelector('#splash', { state: 'detached' }).catch(() => {});
    return { ctx, p, fehler };
}

/** Öffnet unter Freunde den Reiter "Feed" mit einem Besuch des Gefolgten. */
async function freundesFeed(p, besuch) {
    await p.evaluate(({ ICH, DU, besuch }) => {
        window.__follows = [{ follower_id: ICH, following_id: DU }];
        window.__visits = [{ id: 'v1', user_id: DU, opera_id: 'tosca', house_id: 'semperoper',
            date: '2026-09-01', rating: 4, created_at: '2026-09-01T20:00:00Z', ...besuch }];
    }, { ICH, DU, besuch });
    await p.evaluate(() => { window.location.hash = '#/community'; });
    await p.waitForSelector('[data-tab="feed"]', { timeout: 15000 });
    await p.click('[data-tab="feed"]');
    await p.waitForSelector('.feed-card, .empty-state', { timeout: 15000 });
    await p.waitForTimeout(300);
}

test('ein Benutzername mit HTML läuft nach der Einladung nicht als Code', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await starte();
    try {
        await p.evaluate(({ DU, name }) => { window.__einlader = DU; window.__fremderName = name; }, { DU, name: SCHADCODE });
        await p.evaluate(() => { window.location.hash = '#/invite/ABCDEF'; });
        await p.waitForSelector('.invite-success', { timeout: 15000 });
        await p.waitForTimeout(300);

        assert.equal(await p.evaluate(() => window.__xss), undefined, 'der Name lief als Code');
        // Stattdessen steht er als Text da, so wie er gewählt wurde.
        assert.equal(await p.textContent('.invite-success strong'), SCHADCODE);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('ein Werk mit HTML läuft im Freunde-Feed nicht als Code', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await starte();
    try {
        await freundesFeed(p, { opera_id: SCHADCODE, house_id: SCHADCODE });
        assert.equal(await p.locator('.feed-card').count(), 1);
        assert.equal(await p.evaluate(() => window.__xss), undefined, 'Werk oder Haus lief als Code');
        assert.equal(await p.textContent('.feed-card h3'), SCHADCODE);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('eine Note über 5 legt den Freunde-Feed nicht lahm', { skip: fehltPlaywright }, async () => {
    // Vorher: "Fehler beim Laden: Invalid count value: -5" statt des Feeds.
    const { ctx, p } = await starte();
    try {
        await freundesFeed(p, { rating: 9.9 });
        assert.equal(await p.locator('.feed-card').count(), 1, 'der Feed fehlt');
        assert.doesNotMatch(await p.textContent('#app'), /Fehler beim Laden/);
        assert.match(await p.textContent('.feed-card__rating'), /^★★★★★ /);
    } finally { await ctx.close(); }
});

test('eine negative Note ebenso', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await starte();
    try {
        await freundesFeed(p, { rating: -9.9 });
        assert.equal(await p.locator('.feed-card').count(), 1);
        assert.match(await p.textContent('.feed-card__rating'), /^☆☆☆☆☆ /);
    } finally { await ctx.close(); }
});

test('eine Note über 5 legt auch das Profil nicht lahm', { skip: fehltPlaywright }, async () => {
    // Das Bewertungsdiagramm zeichnet den Durchschnitt als Sterne – dieselbe Falle.
    const { ctx, p, fehler } = await starte();
    try {
        await p.evaluate(ICH => import('/src/store/store.js').then(m => {
            m.store.data.myVisits = [{ id: 'x', userId: ICH, operaId: 'tosca', houseId: 'semperoper', date: '2026-09-01', rating: 9.9 }];
        }), ICH);
        await p.evaluate(() => { window.location.hash = '#/profile'; });
        await p.waitForSelector('#profileHistogram', { timeout: 15000 });
        await p.waitForTimeout(400);
        assert.deepEqual(fehler, [], 'das Profil warf beim Zeichnen');
        assert.match(await p.textContent('.ratings-histogram__avg-stars'), /^★★★★★$/);
    } finally { await ctx.close(); }
});

test('Abmelden meldet nur dieses Gerät ab', { skip: fehltPlaywright }, async () => {
    // Ohne Angabe meldet Supabase auf allen Geräten ab. Am 22.09.2026 flog so
    // das iPhone raus, weil am Mac jemand auf "Abmelden" getippt hatte.
    const { ctx, p } = await starte();
    try {
        await p.evaluate(() => import('/src/store/store.js').then(m => m.store.logout()));
        assert.equal(await p.evaluate(() => window.__abgemeldet), 1);
        assert.equal(await p.evaluate(() => window.__abmeldeArt), 'local');
    } finally { await ctx.close(); }
});
