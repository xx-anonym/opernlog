// Feedback und Fehler melden (seit 17.11.2026), dezent an zwei Stellen:
//   - unten in "Profil bearbeiten" als "Feedback", in einer Zeile mit
//     Datenschutz und Bildnachweise,
//   - als "Melden" in roten Fehlermeldungen – nur bei echten Fehlern der App,
//     nicht bei "kein Netz" oder "Standort fehlt".
// Beides ist ein mailto-Link an support@opernlog.de.

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

async function seite(hash) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html${hash}`);
    return { ctx, p, fehler };
}

const mailTeile = (href) => {
    const p = new URLSearchParams(href.split('?')[1]);
    return { an: href.split('?')[0], betreff: p.get('subject'), text: p.get('body') };
};

test('"Profil bearbeiten": "Feedback · Datenschutz · Bildnachweise" in einer Zeile', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await seite('#/profile/user-me');
    try {
        await p.waitForSelector('#editProfileBtn', { timeout: 15000 });
        await vorhangAuf(p);
        await p.click('#editProfileBtn');
        const link = p.locator('#editProfileModal .rechtstext-link', { hasText: 'Feedback' });
        assert.equal(await link.count(), 1);
        // Nebeneinander, nicht untereinander: alle drei auf einer Höhe.
        const oben = await p.$$eval('#editProfileModal .rechtstext-zeile .rechtstext-link',
            as => as.map(a => Math.round(a.getBoundingClientRect().top)));
        assert.equal(oben.length, 3);
        assert.equal(new Set(oben).size, 1, `untereinander: ${oben}`);
        const m = mailTeile(await link.getAttribute('href'));
        assert.equal(m.an, 'mailto:support@opernlog.de');
        assert.equal(m.betreff, 'OpernLog: Feedback');
        assert.match(m.text, /^Seite: #\/profile\/user-me$/m);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('eine Fehlermeldung bietet "Melden" an, mit der Meldung im Text', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await seite('#/');
    try {
        await p.waitForSelector('.main-content', { timeout: 15000 });
        await p.evaluate(() => import('/src/components/Toast.js').then(m => m.showError('Like konnte nicht gespeichert werden')));
        const link = p.locator('.toast--error .toast__melden');
        await link.waitFor();
        assert.equal(await link.textContent(), 'Melden');
        const m = mailTeile(await link.getAttribute('href'));
        assert.equal(m.betreff, 'OpernLog: Fehler');
        assert.match(m.text, /^Fehler: Like konnte nicht gespeichert werden$/m);
        // Der Text der Meldung bleibt, "Melden" steht dahinter.
        assert.match(await p.locator('.toast--error').textContent(), /^Like konnte nicht gespeichert werden Melden$/);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('kein "Melden" bei Hinweisen, die kein Fehler der App sind, und bei grünen Meldungen', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await seite('#/');
    try {
        await p.waitForSelector('.main-content', { timeout: 15000 });
        await p.evaluate(() => import('/src/components/Toast.js').then(m => {
            m.showError('Der Browser hat das Fenster blockiert.', { melden: false });
            m.showToast('Gespeichert');
        }));
        await p.waitForSelector('.toast--error');
        await p.waitForSelector('.toast--info');
        assert.equal(await p.locator('.toast__melden').count(), 0);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});
