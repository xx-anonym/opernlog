// Der Umzug nach opernlog.de (src/umzug.js), so weit er sich hier zeigen
// lässt: die Seite läuft unter 127.0.0.1, also wie unter der neuen Adresse.
//
//   - Ein Code aus #/umzug wird beim Start eingelöst, wenn die Seite von
//     opernlog.vercel.app kam – danach ist man angemeldet und an der alten
//     Stelle.
//   - Von anderswo wird er nicht eingelöst (sonst ließe sich jemand in ein
//     fremdes Konto schieben); die Adresse wird trotzdem aufgeräumt.
//   - Der Hinweis für installierte Apps öffnet am iPhone das echte Safari.

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

const UEBERGABE = `#/umzug?code=umzugcode1234&weiter=${encodeURIComponent('#/opera/tosca')}`;

async function ankommen(referer) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await ersetzeSupabase(p);
    await p.addInitScript(() => { window.__ohneSitzungVorgabe = true; });
    await p.goto(`${server.url}/index.html${UEBERGABE}`, { referer });
    return { ctx, p, fehler };
}

test('von opernlog.vercel.app: Code eingelöst, angemeldet, an der alten Stelle', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await ankommen('https://opernlog.vercel.app/');
    try {
        assert.equal(await p.evaluate(() => document.referrer), 'https://opernlog.vercel.app/');
        await p.waitForFunction(() => import('/src/store/store.js').then(m => m.store.isCloud), null, { timeout: 15000 });
        assert.equal(await p.evaluate(() => location.hash), '#/opera/tosca');
        const eingeloest = await p.evaluate(() => window.__codeEingeloest);
        assert.deepEqual(eingeloest, [{ token_hash: 'umzugcode1234', type: 'email' }]);
        // Der Code steht nicht mehr im Verlauf.
        assert.doesNotMatch(await p.evaluate(() => location.href), /umzug|umzugcode/);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('von fremder Seite: kein Einlösen, abgemeldet, Adresse aufgeräumt', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await ankommen('https://boese.example/');
    try {
        await p.waitForSelector('.main-content', { timeout: 15000 });
        assert.deepEqual(await p.evaluate(() => window.__codeEingeloest || []), []);
        assert.equal(await p.evaluate(() => location.hash), '#/opera/tosca');
        assert.equal(await p.evaluate(() => import('/src/store/store.js').then(m => m.store.isCloud)), false);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Hinweis für die installierte App: am iPhone ins echte Safari, sonst neuer Tab', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    for (const [ua, erwartet] of [
        ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', 'x-safari-https://opernlog.de/'],
        ['Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36', 'https://opernlog.de/'],
    ]) {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: ua });
        const p = await ctx.newPage();
        try {
            await ersetzeSupabase(p);
            await p.goto(`${server.url}/index.html`);
            await p.waitForSelector('.main-content', { timeout: 15000 });
            await p.evaluate(() => import('/src/components/UmzugHinweis.js').then(m => m.umzugHinweisFenster()));
            assert.equal(await p.getAttribute('#umzugOeffnen', 'href'), erwartet, ua);
            assert.match(await p.textContent('#umzugTitel'), /umgezogen/);
            await p.click('#umzugSpaeter');
            assert.equal(await p.locator('.umzug-hinweis').count(), 0);
        } finally { await ctx.close(); }
    }
});
