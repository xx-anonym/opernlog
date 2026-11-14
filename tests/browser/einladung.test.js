// Einladungen, die erst nach dem Anmelden angenommen werden können.
//
// Am 26.10. und 2.11.2026 (Jonas) registrierten sich Eingeladene, ohne dass
// sie mit ihm befreundet waren: angenommen wurde nur, wenn die Anmeldung auf
// der Einladungsseite zu Ende ging. Der Bestätigungslink aus der Mail führte
// aber auf die Startseite. Jetzt merkt sich das Gerät den Code
// (src/einladung.js), und main.js nimmt die Einladung an, wo immer der
// Angemeldete ankommt.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { starteServer, ladePlaywright, starteBrowser, ersetzeSupabase, vorhangAuf } from './umgebung.js';

const HANDY = { width: 390, height: 844 };
const OFFEN = 'opernlog:einladung';
const DU = '22222222-2222-2222-2222-222222222222';

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

/**
 * @param {string} hash
 * @param {object} [o]
 * @param {boolean} [o.abgemeldet]  ohne Sitzung starten
 * @param {string|null} [o.wartet]  dieser Code wartet schon im Speicher
 * @param {string|null} [o.fehler]  accept_invite scheitert damit
 */
async function oeffne(hash, { abgemeldet = false, wartet = null, fehler = null } = {}) {
    const ctx = await browser.newContext({ viewport: HANDY, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    const seitenfehler = [];
    p.on('pageerror', e => seitenfehler.push(e.message));
    await p.addInitScript(([ab, w, f, du, schluessel]) => {
        window.__ohneSitzungVorgabe = ab;
        window.__einladerVorgabe = du;
        window.__fremderNameVorgabe = 'Jonas';
        window.__einladungFehlerVorgabe = f;
        // Nur beim ersten Laden: nach einem Neuladen gilt, was die Seite selbst gemerkt hat.
        if (w && !sessionStorage.getItem('gesetzt')) {
            localStorage.setItem(schluessel, JSON.stringify({ code: w, seit: Date.now() - 60e3 }));
            sessionStorage.setItem('gesetzt', '1');
        }
        // Das Karussell gehört nicht hierher.
        localStorage.setItem('opernlog:willkommenGesehen:11111111-1111-1111-1111-111111111111', '1');
    }, [abgemeldet, wartet, fehler, DU, OFFEN]);
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html${hash}`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await vorhangAuf(p);
    return { ctx, p, seitenfehler };
}

const gemerkt = p => p.evaluate(k => { try { return JSON.parse(localStorage.getItem(k))?.code ?? null; } catch { return null; } }, OFFEN);

test('abgemeldet auf einem Einladungslink: der Code wird gemerkt', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, seitenfehler } = await oeffne('#/invite/ab3k9z', { abgemeldet: true });
    try {
        await p.waitForSelector('.invite-auth-header');
        await p.waitForSelector('#loginForm');
        assert.equal(await gemerkt(p), 'AB3K9Z');
        assert.deepEqual(await p.evaluate(() => window.__einladungAngenommen), []);
        assert.deepEqual(seitenfehler, []);
    } finally { await ctx.close(); }
});

test('mit Code auf der Einladungsseite angemeldet: angenommen, und vergessen', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, seitenfehler } = await oeffne('#/invite/AB3K9Z', { abgemeldet: true });
    try {
        await p.waitForSelector('#loginForm');
        await p.fill('#loginEmail', 'neu@opernlog.de');
        await p.click('#loginSubmitBtn');
        await p.waitForSelector('#codeForm', { state: 'visible' });
        await p.type('#codeInput', '123456');
        await p.waitForSelector('.invite-success', { timeout: 15000 });
        assert.deepEqual(await p.evaluate(() => window.__einladungAngenommen), ['AB3K9Z']);
        assert.equal(await gemerkt(p), null);
        assert.deepEqual(seitenfehler, []);
    } finally { await ctx.close(); }
});

test('angemeldet woanders angekommen – Startseite nach Bestätigungslink oder Google: die Einladung wird dort angenommen', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    // So war es am 26.10. und 2.11.2026: der Code wartete, aber niemand nahm ihn an.
    const { ctx, p, seitenfehler } = await oeffne('#/', { wartet: 'AB3K9Z' });
    try {
        await p.waitForFunction(() => window.__einladungAngenommen.length === 1);
        assert.deepEqual(await p.evaluate(() => window.__einladungAngenommen), ['AB3K9Z']);
        await p.waitForSelector('.toast');
        assert.match(await p.textContent('.toast'), /Du und Jonas seid jetzt befreundet/);
        assert.equal(await gemerkt(p), null);

        // Kein zweites Mal – auch nicht beim nächsten Start.
        await p.evaluate(() => { location.hash = '#/diary'; });
        await p.waitForTimeout(300);
        await p.reload();
        await p.waitForFunction(() => !!window.supabase);
        await vorhangAuf(p);
        await p.waitForTimeout(500);
        assert.deepEqual(await p.evaluate(() => window.__einladungAngenommen), []);
        assert.deepEqual(seitenfehler, []);
    } finally { await ctx.close(); }
});

test('abgemeldet: nichts wird angenommen, der Code wartet weiter', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await oeffne('#/', { abgemeldet: true, wartet: 'AB3K9Z' });
    try {
        await p.waitForTimeout(800);
        assert.deepEqual(await p.evaluate(() => window.__einladungAngenommen), []);
        assert.equal(await gemerkt(p), 'AB3K9Z');
    } finally { await ctx.close(); }
});

test('ein abgelaufener Link: Meldung, und der Code wird vergessen', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await oeffne('#/', { wartet: 'AB3K9Z', fehler: 'Ungültiger oder abgelaufener Einladungslink' });
    try {
        await p.waitForFunction(() => window.__einladungAngenommen.length === 1);
        await p.waitForSelector('.toast--error');
        assert.match(await p.textContent('.toast--error'), /abgelaufener Einladungslink/);
        assert.equal(await gemerkt(p), null);
    } finally { await ctx.close(); }
});

test('scheitert es an etwas Vorübergehendem, bleibt der Code für den nächsten Start', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await oeffne('#/', { wartet: 'AB3K9Z', fehler: 'Failed to fetch' });
    try {
        await p.waitForFunction(() => window.__einladungAngenommen.length === 1);
        await p.waitForTimeout(300);
        assert.equal(await gemerkt(p), 'AB3K9Z');
        assert.equal(await p.locator('.toast--error').count(), 0);
    } finally { await ctx.close(); }
});
