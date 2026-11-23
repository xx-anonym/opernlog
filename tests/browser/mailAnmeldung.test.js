// Angemeldet per Knopf in der Mail (src/mailAnmeldung.js):
//
//   - Abgemeldet: der Code aus #/mail wird eingelöst, man ist angemeldet und
//     an der Stelle, zu der der Knopf führen sollte. Ein Hinweis nennt das
//     Konto, mit "Nicht du? Abmelden".
//   - Schon angemeldet: kein Einlösen, kein Kontowechsel.
//   - Abgelaufen: abgemeldet, mit Hinweis; der Code steht nirgends mehr.

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

const link = code => `#/mail?code=${code}&weiter=${encodeURIComponent('#/opera/tosca')}`;

async function oeffnen(hash, { abgemeldet = true } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await ersetzeSupabase(p);
    if (abgemeldet) await p.addInitScript(() => { window.__ohneSitzungVorgabe = true; });
    await p.goto(`${server.url}/index.html${hash}`);
    return { ctx, p, fehler };
}

const istAngemeldet = p => p.evaluate(() => import('/src/store/store.js').then(m => !!m.store.isCloud));

test('abgemeldet: eingelöst, angemeldet, an der Stelle, Hinweis mit Abmelden', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffnen(link('mailcode1234'));
    try {
        await p.waitForFunction(() => import('/src/store/store.js').then(m => m.store.isCloud), null, { timeout: 15000 });
        assert.equal(await p.evaluate(() => location.hash), '#/opera/tosca');
        assert.deepEqual(await p.evaluate(() => window.__codeEingeloest), [{ token_hash: 'mailcode1234', type: 'email' }]);
        // Der Code steht weder in der Adresse noch im Verlauf.
        assert.doesNotMatch(await p.evaluate(() => location.href), /mailcode|#\/mail/);

        const hinweis = p.locator('.toast', { hasText: 'Angemeldet als Testnutzer.' });
        await hinweis.waitFor({ timeout: 15000 });
        await hinweis.getByRole('button', { name: 'Nicht du? Abmelden' }).click();
        await p.waitForFunction(() => import('/src/store/store.js').then(m => !m.store.isCloud), null, { timeout: 15000 });
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('schon angemeldet: kein Einlösen, kein Kontowechsel, kein Hinweis', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffnen(link('mailcode1234'), { abgemeldet: false });
    try {
        await p.waitForSelector('.main-content', { timeout: 15000 });
        assert.equal(await istAngemeldet(p), true);
        assert.deepEqual(await p.evaluate(() => window.__codeEingeloest || []), []);
        assert.equal(await p.evaluate(() => location.hash), '#/opera/tosca');
        await p.waitForTimeout(500);
        assert.equal(await p.locator('.toast', { hasText: 'Angemeldet als' }).count(), 0);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('abgelaufen: abgemeldet, Hinweis, Adresse aufgeräumt', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffnen(link('abgelaufen1234'));
    try {
        await p.locator('.toast', { hasText: 'Der Link aus der Mail ist abgelaufen' }).waitFor({ timeout: 15000 });
        assert.equal(await istAngemeldet(p), false);
        assert.equal(await p.evaluate(() => location.hash), '#/opera/tosca');
        assert.doesNotMatch(await p.evaluate(() => location.href), /abgelaufen1234/);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});
