// "E-Mails" im Fenster "Profil bearbeiten": Mail bei Freundschaftsanfragen
// ein- und ausschalten.
//
// Ohne Zeile in mail_einstellungen ist sie eingeschaltet – so bekommen alle
// die Mail, bis sie sie abschalten. Der Bereich steht auch da, wo der Browser
// keine Push-Mitteilungen kann: Mails gelten fürs Konto, nicht fürs Gerät.

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

async function bearbeiten({ vorgabe = null } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 } });
    // Kein Push im Browser: der Mail-Bereich muss trotzdem da sein.
    await ctx.addInitScript(() => { delete window.PushManager; delete window.Notification; });
    if (vorgabe) await ctx.addInitScript(v => { window.__mailEinstellungVorgabe = v; }, vorgabe);
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await p.waitForSelector('#splash', { state: 'detached' }).catch(() => {});
    await p.evaluate(() => { window.location.hash = '#/profile'; });
    await p.waitForSelector('#editProfileBtn', { timeout: 15000 });
    await p.click('#editProfileBtn');
    await p.waitForSelector('#editProfileModal .mail-einstellungen #mailAnfrageBtn');
    return { ctx, p, fehler };
}

const stand = p => p.textContent('#editProfileModal .mail-einstellungen__stand');

test('ohne Einstellung eingeschaltet; Ausschalten speichert und bleibt', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await bearbeiten();
    try {
        assert.equal(await p.isVisible('#editProfileModal .mitteilungen'), false, 'ohne Push gar kein Push-Bereich');
        assert.match(await stand(p), /bekommst du eine Mail/);
        assert.equal((await p.textContent('#mailAnfrageBtn')).trim(), 'Ausschalten');

        await p.click('#mailAnfrageBtn');
        await p.waitForFunction(() => document.querySelector('#mailAnfrageBtn')?.textContent.trim() === 'Einschalten');
        assert.match(await stand(p), /kommt keine Mail/);
        const geschrieben = await p.evaluate(() => window.__mailSchreiben);
        assert.equal(geschrieben.length, 1);
        assert.equal(geschrieben[0].bei_anfrage, false);
        assert.match(geschrieben[0].user_id, /^[0-9a-f-]{36}$/);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('abgeschaltet bleibt abgeschaltet und lässt sich wieder einschalten', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await bearbeiten({ vorgabe: { bei_anfrage: false } });
    try {
        assert.match(await stand(p), /kommt keine Mail/);
        await p.click('#mailAnfrageBtn');
        await p.waitForFunction(() => document.querySelector('#mailAnfrageBtn')?.textContent.trim() === 'Ausschalten');
        assert.equal((await p.evaluate(() => window.__mailSchreiben))[0].bei_anfrage, true);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('scheitert das Speichern, bleibt der Stand und es gibt eine Meldung', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await bearbeiten();
    try {
        await p.evaluate(() => { window.__mailFehler = 'TypeError: Failed to fetch'; });
        await p.click('#mailAnfrageBtn');
        await p.waitForSelector('#editProfileModal .mail-einstellungen__fehler:not([hidden])');
        assert.match(await stand(p), /bekommst du eine Mail/);
        assert.equal((await p.textContent('#mailAnfrageBtn')).trim(), 'Ausschalten');
        assert.equal(await p.isDisabled('#mailAnfrageBtn'), false);
    } finally { await ctx.close(); }
});
