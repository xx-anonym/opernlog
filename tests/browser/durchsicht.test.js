// Was die Durchsicht vom 23.09.2026 gefunden hat, im Browser geprüft:
//
// - die Anmeldeseite hatte ungestaltete Eingabefelder (seit dem ersten Commit),
// - die Startseite versprach abgemeldet ein Tagebuch ohne Konto,
// - die Suche fand "zauberflote" und "zurich" nicht,
// - das Log-Formular nahm zwischen 0 und 2 Uhr den Vortag und lehnte heute ab,
// - die Rückkehr in die App zeichnete neu und warf angefangenen Text weg.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { starteServer, ladePlaywright, starteBrowser, ersetzeSupabase } from './umgebung.js';

const HANDY = { width: 390, height: 900 };
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

async function oeffne(hash = '', optionen = {}) {
    const ctx = await browser.newContext({ viewport: HANDY, ...optionen });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html${hash}`);
    await p.waitForSelector('.main-content', { timeout: 15000 });
    return { ctx, p, fehler };
}

// ── Anmeldeseite ─────────────────────────────────────────────────────────

test('die Felder der Anmeldeseite sind gestaltet und füllen die Breite', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffne();
    try {
        // Direkt einhängen wie in passwort.test.js: der Stub ist immer angemeldet.
        await p.evaluate(async () => {
            const m = await import('/src/pages/Auth.js');
            document.body.innerHTML = '';
            document.body.appendChild(m.AuthPage());
        });
        const mass = await p.evaluate(() => {
            const feld = document.querySelector('#loginEmail');
            const form = document.querySelector('#loginForm');
            const label = document.querySelector('label[for="loginEmail"]');
            return {
                feld: feld.getBoundingClientRect().width,
                form: form.getBoundingClientRect().width,
                labelDisplay: getComputedStyle(label).display,
                radius: getComputedStyle(feld).borderRadius,
            };
        });
        assert.ok(mass.feld > mass.form * 0.95, `Feld ${mass.feld}px bei Formular ${mass.form}px`);
        assert.equal(mass.labelDisplay, 'block', 'das Label steht neben statt über dem Feld');
        assert.equal(mass.radius, '10px');
        // Damit Schlüsselbund und Passwortmanager wissen, was wohin gehört.
        assert.equal(await p.getAttribute('#loginPassword', 'autocomplete'), 'current-password');
        assert.equal(await p.getAttribute('#regPassword', 'autocomplete'), 'new-password');
    } finally { await ctx.close(); }
});

test('abgemeldet verspricht die Startseite kein Tagebuch ohne Konto', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffne();
    try {
        await p.evaluate(async () => {
            const { store } = await import('/src/store/store.js');
            store._session = null;
            store._cloudMode = false;
            const { HomePage } = await import('/src/pages/Home.js');
            const inhalt = document.querySelector('.main-content');
            inhalt.innerHTML = '';
            inhalt.appendChild(HomePage());
        });
        const text = await p.locator('.feed-leer__text').innerText();
        assert.doesNotMatch(text, /auch ohne/, 'das Tagebuch verlangt eine Anmeldung');
        assert.match(text, /Mit einem Konto/);
    } finally { await ctx.close(); }
});

// ── Suche ohne Umlaute ───────────────────────────────────────────────────

test('die Suche findet Werke und Häuser auch ohne Umlaute', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffne('#/operas');
    try {
        await p.waitForSelector('#operaSearch');
        await p.fill('#operaSearch', 'zauberflote');
        await p.waitForTimeout(400);
        assert.match(await p.locator('.opera-card').first().innerText(), /Zauberflöte/);

        await p.evaluate(() => { location.hash = '#/houses'; });
        await p.waitForSelector('#houseSearch');
        await p.fill('#houseSearch', 'zurich');
        await p.waitForTimeout(400);
        assert.match(await p.locator('.house-card').first().innerText(), /Zürich/);
    } finally { await ctx.close(); }
});

test('im Log-Formular ebenso', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffne('#/log');
    try {
        await p.waitForSelector('#operaInput');
        await p.fill('#operaInput', 'zauberfloete');
        await p.waitForSelector('#operaList .autocomplete__item');
        assert.match(await p.locator('#operaList .autocomplete__item').first().innerText(), /Zauberflöte/);
    } finally { await ctx.close(); }
});

// ── Datum kurz nach Mitternacht ──────────────────────────────────────────

test('um 0:30 Uhr steht heute im Formular und lässt sich speichern', { skip: fehltPlaywright }, async () => {
    // 0:30 Uhr am 24. September in Berlin ist in UTC noch der 23.
    const ctx = await browser.newContext({ viewport: HANDY, timezoneId: 'Europe/Berlin' });
    const p = await ctx.newPage();
    await p.clock.setFixedTime(new Date('2026-09-23T22:30:00Z'));
    await ersetzeSupabase(p);
    try {
        await p.goto(`${server.url}/index.html#/log?house=semperoper&opera=tosca`);
        await p.waitForSelector('#visitDate');
        assert.equal(await p.inputValue('#visitDate'), '2026-09-24');
        assert.equal(await p.getAttribute('#visitDate', 'max'), '2026-09-24');

        // Speichern nur mitschreiben: geprüft wird die Datumsprüfung davor.
        await p.evaluate(async () => {
            const { store } = await import('/src/store/store.js');
            window.__gespeichert = [];
            store.addVisit = async (v) => { window.__gespeichert.push(v); return v; };
        });
        await p.locator('#ratingWidget .star').nth(3).click();
        await p.click('#logForm button[type="submit"]');
        await p.waitForTimeout(400);
        const gespeichert = await p.evaluate(() => window.__gespeichert);
        assert.equal(gespeichert.length, 1, 'der heutige Tag galt als Zukunft');
        assert.equal(gespeichert[0].date, '2026-09-24');
    } finally { await ctx.close(); }
});

// ── Rückkehr in die App ──────────────────────────────────────────────────

/** Wie das Zurückkehren aus dem Hintergrund. */
const zurueck = (p) => p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));

test('ein angefangener Kommentar überlebt die Rückkehr in die App', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await oeffne();
    try {
        await p.evaluate(({ ich, freund }) => {
            window.__follows = [{ follower_id: ich, following_id: freund }];
            window.__visits = [{ id: 'f1', user_id: freund, opera_id: 'tosca', house_id: 'semperoper', date: '2026-05-01', rating: 5,
                profiles: { id: freund, username: 'Freundin', avatar_initials: 'FR', avatar_icon: null } }];
            location.hash = '#/houses';
        }, { ich: ICH, freund: FREUND });
        await p.waitForTimeout(200);
        await p.evaluate(() => { location.hash = '#/'; });
        await p.waitForSelector('.feed-list .review-card');

        await p.click('.feed-list .review-card [data-action="comment"]');
        await p.fill('.feed-list .review-card .comment-input', 'Brava, Tosca!');
        await zurueck(p);
        await p.waitForTimeout(800);

        assert.equal(await p.inputValue('.feed-list .review-card .comment-input'), 'Brava, Tosca!');
        assert.ok(await p.isVisible('.feed-list .review-card .comment-input'), 'das Eingabefeld ist wieder zu');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('ohne angefangenen Text zeichnet die Rückkehr neu, mit frischen Daten', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffne();
    try {
        await p.evaluate(() => { location.hash = '#/houses'; });
        await p.waitForTimeout(200);
        await p.evaluate(() => { location.hash = '#/'; });
        await p.waitForSelector('.feed-leer');
        // In der Zwischenzeit hat eine Freundin etwas geloggt.
        await p.evaluate(({ ich, freund }) => {
            window.__follows = [{ follower_id: ich, following_id: freund }];
            window.__visits = [{ id: 'f2', user_id: freund, opera_id: 'aida', house_id: 'semperoper', date: '2026-05-02', rating: 4,
                profiles: { id: freund, username: 'Freundin', avatar_initials: 'FR', avatar_icon: null } }];
        }, { ich: ICH, freund: FREUND });
        await zurueck(p);
        await p.waitForSelector('.feed-list .review-card', { timeout: 5000 });
    } finally { await ctx.close(); }
});

test('aufgeklappte Termine bleiben nach der Rückkehr offen', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffne('#/opera/tosca');
    try {
        await p.waitForSelector('#termineToggle');
        await p.click('#termineToggle');
        assert.equal(await p.getAttribute('#termineToggle', 'aria-expanded'), 'true');
        await zurueck(p);
        await p.waitForTimeout(800);
        assert.equal(await p.getAttribute('#termineToggle', 'aria-expanded'), 'true');
        assert.equal(await p.locator('#operaTermine').isHidden(), false);
    } finally { await ctx.close(); }
});

// ── Abgemeldet keine Wunschliste ─────────────────────────────────────────
//
// Gemeldet am 23.09.2026: abgemeldet ließ sich eine Wunschliste anlegen. Sie
// lag nur im Browser und gehörte zu keinem Konto.

async function abgemeldet(p) {
    await p.evaluate(async () => {
        const { store } = await import('/src/store/store.js');
        store._session = null;
        store._cloudMode = false;
        store.data.currentUser = { ...store.data.currentUser, id: 'user-me' };
        store.data.myLists = [];
        store.data.seenOperas = [];
    });
}

test('abgemeldet führt „Auf die Wunschliste“ zur Anmeldung, ohne etwas anzulegen', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffne();
    try {
        await abgemeldet(p);
        await p.evaluate(() => { location.hash = '#/opera/tosca'; });
        await p.waitForSelector('#wishlistToggle');
        await p.click('#wishlistToggle');
        await p.waitForFunction(() => location.hash === '#/auth');
        const stand = await p.evaluate(() => import('/src/store/store.js').then(m => ({
            listen: m.store.data.myLists.length, wunschliste: m.store.getWishlist(),
        })));
        assert.equal(stand.listen, 0, 'eine Liste ohne Konto angelegt');
        assert.equal(stand.wunschliste, null);
    } finally { await ctx.close(); }
});

test('abgemeldet: „Schon gesehen“ ebenso, und die Wunschliste selbst verlangt die Anmeldung', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffne();
    try {
        await abgemeldet(p);
        await p.evaluate(() => { location.hash = '#/opera/tosca'; });
        await p.waitForSelector('#seenToggle');
        await p.click('#seenToggle');
        await p.waitForFunction(() => location.hash === '#/auth');
        assert.deepEqual(await p.evaluate(() => import('/src/store/store.js').then(m => m.store.data.seenOperas)), []);

        await p.evaluate(() => { location.hash = '#/wishlist'; });
        await p.waitForSelector('#loginForm');
    } finally { await ctx.close(); }
});

test('auch am Store vorbei lässt sich abgemeldet keine Liste anlegen', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffne();
    try {
        await abgemeldet(p);
        const fehler = await p.evaluate(async () => {
            const { store } = await import('/src/store/store.js');
            const ergebnis = [];
            for (const f of [() => store.addToWishlist('tosca'), () => store.markSeenOpera('tosca'),
                () => store.addList({ name: 'x', type: 'operas', items: [] })]) {
                try { await f(); ergebnis.push('ging durch'); } catch (e) { ergebnis.push(e.code); }
            }
            return ergebnis;
        });
        assert.deepEqual(fehler, ['OHNE_KONTO', 'OHNE_KONTO', 'OHNE_KONTO']);
    } finally { await ctx.close(); }
});
