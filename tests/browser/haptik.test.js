// Haptisches Feedback (src/haptik.js): ein kurzes Klicken beim Stern, beim
// Speichern, bei Gefällt mir, Wunschliste, Vormerken und beim nächsten
// Termin unter "Demnächst". Android vibriert; das iPhone bekommt das
// Klicken über einen unsichtbaren Ein/Aus-Schalter, dessen Klick nirgends
// ankommen darf.

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
const FREMD = '22222222-2222-2222-2222-222222222222';
const iso = (tage) => { const d = new Date(); d.setDate(d.getDate() + tage); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const SPIELPLAN = `
export const SPIELPLAN_STAND = '${iso(-1)}';
export const SPIELPLAN_ZUSATZWERKE = [];
export const spielplan = [
  { werk: 'tosca', haus: 'semperoper', url: 'https://www.semperoper.de/tosca', termine: ['${iso(5)}', '${iso(9)}'] },
];`;

async function oeffne(hash, { iphone = false, besuche = [], follows = [], plaene = [] } = {}) {
    const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 }, serviceWorkers: 'block',
        ...(iphone ? { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' } : {}),
    });
    const p = await ctx.newPage();
    await p.route('**/src/data/spielplan.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: SPIELPLAN }));
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await p.addInitScript(([b, f, pl]) => {
        window.__besucheVorgabe = b; window.__followsVorgabe = f; window.__geplantVorgabe = pl;
        window.__vibriert = [];
        Object.defineProperty(Navigator.prototype, 'vibrate', { configurable: true, value: (ms) => { window.__vibriert.push(ms); return true; } });
    }, [besuche, follows, plaene]);
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html${hash}`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await vorhangAuf(p);
    return { ctx, p, fehler };
}

const vibriert = p => p.evaluate(() => window.__vibriert.length);

test('Android: Stern und Speichern vibrieren kurz', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/log?house=semperoper&opera=tosca');
    try {
        await p.waitForSelector('#ratingWidget .star');
        assert.equal(await vibriert(p), 0);
        const stern = p.locator('#ratingWidget .star').nth(3);
        const box = await stern.boundingBox();
        await p.mouse.click(box.x + box.width * 0.75, box.y + box.height / 2);
        assert.deepEqual(await p.evaluate(() => window.__vibriert), [10]);
        await p.click('#logForm button[type="submit"]');
        await p.waitForFunction(() => window.__besuchVersuche.length === 1);
        assert.equal(await vibriert(p), 2);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Android: Wunschliste und Gefällt mir vibrieren', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const besuch = { id: 'aaaaaaaa-1111-4000-8000-000000000009', user_id: FREMD, opera_id: 'aida', house_id: 'oper-leipzig', date: '2026-04-01', rating: 5 };
    const { ctx, p } = await oeffne('#/opera/tosca', { besuche: [besuch], follows: [{ follower_id: UID, following_id: FREMD }] });
    try {
        await p.waitForSelector('#wishlistToggle');
        await p.click('#wishlistToggle');
        await p.waitForFunction(() => window.__vibriert.length === 1);
        await p.evaluate(() => { location.hash = '#/'; });
        await p.waitForSelector('.feed-list [data-action="like"]');
        await p.click('.feed-list [data-action="like"]');
        await p.waitForFunction(() => window.__vibriert.length === 2);
    } finally { await ctx.close(); }
});

test('Android: Vormerken im Termin-Fenster vibriert', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await oeffne('#/opera/tosca');
    try {
        await p.click('#termineToggle');
        await p.click('#operaTermine .spielplan-zeile__kalender');
        await p.waitForSelector('.kalender-wahl__vormerken');
        assert.equal(await vibriert(p), 0);
        await p.click('.kalender-wahl__vormerken');
        await p.waitForFunction(() => window.__geplant.length === 1);
        assert.equal(await vibriert(p), 1);
    } finally { await ctx.close(); }
});

test('Android: unter "Demnächst" klickt der Schritt zum nächsten Abend', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const plaene = [['tosca', 5], ['aida', 9]].map(([werk, tage], i) => (
        { id: `aaaaaaaa-0000-4000-8000-00000000003${i}`, user_id: UID, opera_id: werk, house_id: 'semperoper', datum: iso(tage), zeit: null }));
    const { ctx, p } = await oeffne('#/', { plaene });
    try {
        await p.waitForSelector('.demnaechst__pfeil');
        assert.equal(await vibriert(p), 0);
        await p.click('[data-schritt="1"]');
        await p.waitForFunction(() => document.querySelector('.demnaechst__zahl')?.textContent === '2 / 2');
        await p.waitForFunction(() => window.__vibriert.length === 1);
    } finally { await ctx.close(); }
});

// iPhone (iOS 26.5+): nur eine echte Berührung des Schalters oder seines
// Labels klickt. Deshalb liegt auf jeder Stelle ein unsichtbares Label; der
// Klick muss trotzdem genau einmal bei der Stelle ankommen.
// Wie oft ein Schalter umgelegt wurde – das ist der Moment, in dem das iPhone klickt.
const umgelegtZaehlen = p => p.evaluate(() => {
    window.__umgelegt = 0;
    if (window.__zaehlerDa) return;
    window.__zaehlerDa = true;
    document.addEventListener('change', (e) => { if (e.target.matches?.('.haptik-flaeche input[switch]')) window.__umgelegt++; }, true);
});
const umgelegt = p => p.evaluate(() => window.__umgelegt);

test('iPhone: Stern und Speichern – Fläche getroffen, Schalter umgelegt, alles genau einmal', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/log?house=semperoper&opera=tosca', { iphone: true });
    try {
        await p.waitForSelector('#ratingWidget .star > .haptik-flaeche');
        await p.waitForSelector('#logForm button[type="submit"] > .haptik-flaeche');
        await umgelegtZaehlen(p);
        // Rechte Hälfte des vierten Sterns: vier Sterne.
        const stern = p.locator('#ratingWidget .star').nth(3);
        const box = await stern.boundingBox();
        await p.mouse.click(box.x + box.width * 0.75, box.y + box.height / 2);
        // Der Klick kommt einen Augenblick später an der Stelle an (siehe haptik.js).
        await p.waitForFunction(() => [...document.querySelectorAll('#ratingWidget .star')].filter(s => s.textContent.includes('★')).length === 4);
        await p.click('#logForm button[type="submit"]');
        await p.waitForFunction(() => window.__besuchVersuche.length >= 1);
        await p.waitForTimeout(300);
        assert.equal(await p.evaluate(() => window.__besuchVersuche.length), 1);
        assert.equal(await p.evaluate(() => window.__besuchVersuche[0].rating), 4);
        assert.equal(await umgelegt(p), 2);
        // Auf dem iPhone vibriert nichts – das Klicken kommt vom Schalter.
        assert.equal(await vibriert(p), 0);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('iPhone: Wunschliste, Gefällt mir, Vormerken, Demnächst – je genau einmal', { skip: fehltPlaywright, timeout: 90000 }, async () => {
    const besuch = { id: 'aaaaaaaa-1111-4000-8000-000000000009', user_id: FREMD, opera_id: 'aida', house_id: 'oper-leipzig', date: '2026-04-01', rating: 5 };
    // Nicht Tosca am 5. Tag: den merkt der Test unten im Termin-Fenster vor.
    const plaene = [['rigoletto', 6], ['aida', 9], ['carmen', 12]].map(([werk, tage], i) => (
        { id: `aaaaaaaa-0000-4000-8000-00000000004${i}`, user_id: UID, opera_id: werk, house_id: 'semperoper', datum: iso(tage), zeit: null }));
    const { ctx, p, fehler } = await oeffne('#/opera/tosca', { iphone: true, besuche: [besuch], follows: [{ follower_id: UID, following_id: FREMD }], plaene });
    try {
        await p.waitForSelector('#wishlistToggle > .haptik-flaeche');
        await umgelegtZaehlen(p);
        await p.click('#wishlistToggle');
        await p.waitForFunction(() => document.querySelector('#wishlistToggle')?.textContent.includes('Auf der Wunschliste'));
        assert.equal(await umgelegt(p), 1);

        // Vormerken im Termin-Fenster: einmal an, nicht an und gleich wieder aus.
        const vorher = await p.evaluate(() => window.__geplant.length);
        await p.click('#termineToggle');
        await p.click('#operaTermine .spielplan-zeile__kalender');
        await p.waitForSelector('.kalender-wahl__vormerken > .haptik-flaeche');
        await p.locator('.kalender-wahl__vormerken').first().click();
        await p.waitForFunction(n => window.__geplant.length === n + 1, vorher);
        await p.waitForTimeout(300);
        assert.equal(await p.evaluate(() => window.__geplant.length), vorher + 1);
        assert.equal(await umgelegt(p), 2);
        await p.click('#kalenderWahlAbbrechen');
        await p.waitForFunction(() => !history.state?.opernlogFenster);

        await p.evaluate(() => { location.hash = '#/'; });
        await p.waitForSelector('.feed-list [data-action="like"] > .haptik-flaeche');
        await umgelegtZaehlen(p);
        await p.click('.feed-list [data-action="like"]');
        await p.waitForFunction(() => document.querySelector('.feed-list [data-action="like"] .btn-icon__count')?.textContent === '1');
        await p.waitForTimeout(300);
        assert.equal(await p.textContent('.feed-list [data-action="like"] .btn-icon__count'), '1');
        assert.equal(await umgelegt(p), 1);

        // Ein Schritt weiter, nicht zwei.
        await p.click('.demnaechst__pfeil[data-schritt="1"]');
        await p.waitForFunction(() => /^2 \//.test(document.querySelector('.demnaechst__zahl')?.textContent || ''));
        await p.waitForTimeout(500);
        assert.match(await p.textContent('.demnaechst__zahl'), /^2 \//);
        assert.equal(await umgelegt(p), 2);
        assert.equal(await vibriert(p), 0);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('ohne iPhone keine Flächen', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await oeffne('#/log?house=semperoper&opera=tosca');
    try {
        await p.waitForSelector('#ratingWidget .star');
        await p.waitForTimeout(300);
        assert.equal(await p.locator('.haptik-flaeche').count(), 0);
    } finally { await ctx.close(); }
});
