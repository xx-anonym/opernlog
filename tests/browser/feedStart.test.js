// Der Feed beim Start (src/feedVorrat.js):
//
//   - Der Vorhang geht erst auf, wenn der frische Feed da ist – wenn die
//     Seite hinter ihm erscheint, steht der Feed schon da, kein Spinner (bis
//     zur Frist von drei Sekunden).
//   - Gezeigt wird beim Start nur Frisches; ein gemerkter Stand vom letzten
//     Mal erscheint nicht als Vorschau.
//   - Scheitert die Anfrage, steht der gemerkte Feed da, mit seinem Stand.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { starteServer, ladePlaywright, starteBrowser, ersetzeSupabase } from './umgebung.js';

const ICH = '11111111-1111-1111-1111-111111111111';
const FREUND = '22222222-2222-2222-2222-222222222222';

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

const besuch = (id, opera, datum) => ({
    id, user_id: FREUND, opera_id: opera, house_id: 'semperoper', date: datum, rating: 4,
    created_at: `${datum}T20:00:00Z`,
    profiles: { id: FREUND, username: 'Freundin', avatar_initials: 'FR', avatar_icon: null },
});

async function starten({ besuche, verzoegerung = 0, lesefehler = null, gemerkt = null }) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await ersetzeSupabase(p);
    await p.addInitScript(({ b, f, l, g, ich, v }) => {
        window.__besucheVorgabe = b;
        window.__followsVorgabe = f;
        if (l) window.__lesefehlerVorgabe = l;
        if (g) localStorage.setItem('opernlog:feed', JSON.stringify({ nutzer: ich, zeit: Date.UTC(2026, 10, 23, 20, 40), feed: g }));
        // Jede Antwort der "Datenbank" so lange verzögert – wie ein langsames Netz.
        if (v) Object.defineProperty(window, '__verzoegerung', { get: () => v, set: () => {}, configurable: true });
    }, { b: besuche, f: [{ follower_id: ICH, following_id: FREUND }], l: lesefehler, g: gemerkt, ich: ICH, v: verzoegerung });
    await p.goto(`${server.url}/index.html`);
    return { ctx, p, fehler };
}

/**
 * Sieht in dem Moment nach, in dem der Feed-Abschnitt zum ersten Mal auf der
 * Seite steht – also wenn er hinter dem aufgehenden Vorhang sichtbar wird.
 */
async function beimErscheinen(p) {
    return p.evaluate(() => new Promise(fertig => {
        const nachsehen = () => {
            const feed = [...document.querySelectorAll('.section')].find(x => x.textContent.includes('Von deinen Freunden'));
            if (!feed) return false;
            const s = document.getElementById('splash');
            fertig({
                karten: feed.querySelectorAll('.review-card').length,
                spinner: !!feed.querySelector('.loading-spinner'),
                vorhangDa: !!s,
            });
            return true;
        };
        if (nachsehen()) return;
        const b = new MutationObserver(() => { if (nachsehen()) b.disconnect(); });
        b.observe(document.documentElement, { subtree: true, childList: true });
    }));
}

test('langsames Netz: der Vorhang wartet auf den frischen Feed', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await starten({ besuche: [besuch('b1', 'tosca', '2026-11-20')], verzoegerung: 700 });
    try {
        const stand = await beimErscheinen(p);
        assert.equal(stand.vorhangDa, true, 'der Feed kam erst nach dem Vorhang');
        assert.equal(stand.spinner, false, 'hinter dem Vorhang drehte sich noch der Spinner');
        assert.equal(stand.karten, 1);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('beim Start nur Frisches: der gemerkte Stand vom letzten Mal erscheint nicht', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const alt = [besuch('alt1', 'carmen', '2026-11-01')];
    const { ctx, p, fehler } = await starten({ besuche: [besuch('b1', 'tosca', '2026-11-20')], verzoegerung: 400, gemerkt: alt });
    try {
        // Zu keinem Zeitpunkt darf die Carmen vom letzten Mal auf der Seite stehen.
        await p.evaluate(() => {
            window.__altGesehen = false;
            new MutationObserver(() => {
                if (document.querySelector('.review-card') && document.body.textContent.includes('Carmen')) window.__altGesehen = true;
            }).observe(document.body, { subtree: true, childList: true });
        });
        await p.waitForSelector('.review-card', { timeout: 15000 });
        await p.waitForTimeout(500);
        assert.equal(await p.evaluate(() => window.__altGesehen), false);
        assert.match(await p.textContent('.feed-list'), /Tosca/);
        assert.equal(await p.locator('.feed-stand').count(), 0);
        // Der frische Feed ist jetzt gemerkt.
        const gemerkt = await p.evaluate(() => JSON.parse(localStorage.getItem('opernlog:feed')));
        assert.deepEqual(gemerkt.feed.map(v => v.id), ['b1']);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Feed nicht erreichbar: der gemerkte Stand, als solcher gekennzeichnet', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const alt = [besuch('alt1', 'carmen', '2026-11-01')];
    const { ctx, p, fehler } = await starten({ besuche: [], lesefehler: { follows: 'kein Netz' }, gemerkt: alt });
    try {
        await p.waitForSelector('.feed-stand', { timeout: 15000 });
        assert.match(await p.textContent('.feed-stand'), /^Stand: 23\.11\., \d\d:40 – gerade nicht aktualisierbar$/);
        assert.match(await p.textContent('.feed-list'), /Carmen/);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Abmelden löscht den gemerkten Feed', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await starten({ besuche: [besuch('b1', 'tosca', '2026-11-20')] });
    try {
        await p.waitForSelector('.review-card', { timeout: 15000 });
        assert.ok(await p.evaluate(() => localStorage.getItem('opernlog:feed')));
        await p.evaluate(() => import('/src/store/store.js').then(m => m.store.logout()));
        assert.equal(await p.evaluate(() => localStorage.getItem('opernlog:feed')), null);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});
