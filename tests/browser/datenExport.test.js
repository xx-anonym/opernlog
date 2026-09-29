// "Meine Daten herunterladen" im Fenster "Profil bearbeiten": die Datei
// kommt an, enthält die eigenen Abende und nur die – und auf dem iPhone geht
// sie über das Teilen-Blatt.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { starteServer, ladePlaywright, starteBrowser, ersetzeSupabase } from './umgebung.js';

const UID = '11111111-1111-1111-1111-111111111111';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

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

async function oeffneKontoBereich({ userAgent, vorher } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 1000 }, userAgent, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await ersetzeSupabase(p);
    if (vorher) await p.addInitScript(vorher);
    await p.goto(`${server.url}/index.html`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await p.evaluate((uid) => {
        window.__visits = [
            { id: 'v1', user_id: uid, opera_id: 'tosca', house_id: 'semperoper', date: '2026-05-01', rating: 5, review: 'Großartig', cast_list: 'Netrebko' },
            // Ein fremder Abend: visits ist öffentlich lesbar, darf aber nicht in die Datei.
            { id: 'v2', user_id: 'fremd', opera_id: 'aida', house_id: 'semperoper', date: '2026-05-02', rating: 2 },
        ];
        window.__passkeys = [{ id: 'pk-1', friendly_name: 'iCloud', created_at: '2026-09-01T10:00:00Z', last_used_at: null }];
        window.location.hash = '#/profile';
    }, UID);
    await p.waitForSelector('#editProfileBtn', { timeout: 15000 });
    await p.click('#editProfileBtn');
    await p.waitForSelector('#datenExportBtn');
    return { ctx, p, fehler };
}

test('der Knopf lädt eine JSON-Datei mit den eigenen Abenden herunter, ohne fremde', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffneKontoBereich();
    try {
        const [download] = await Promise.all([p.waitForEvent('download'), p.click('#datenExportBtn')]);
        assert.match(download.suggestedFilename(), /^opernlog-daten-\d{4}-\d{2}-\d{2}\.json$/);
        const daten = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));

        assert.equal(daten.konto.email, 'test@opernlog.test');
        assert.equal(daten.profil.username, 'Testnutzer');
        assert.deepEqual(daten.abende.map(a => [a.id, a.werk, a.haus, a.cast_list]), [['v1', 'Tosca', 'Semperoper', 'Netrebko']]);
        assert.deepEqual(daten.passkeys.map(k => k.friendly_name), ['iCloud']);

        // Danach steht der Knopf wieder bereit.
        await p.waitForFunction(() => !document.querySelector('#datenExportBtn').disabled);
        assert.match(await p.textContent('#datenExportBtn'), /Meine Daten herunterladen/);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('scheitert eine Abfrage, kommt keine halbe Datei, sondern eine Meldung', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await oeffneKontoBereich();
    try {
        await p.evaluate(() => { window.__lesefehler = { visits: 'Dienst nicht erreichbar' }; });
        let heruntergeladen = false;
        p.on('download', () => { heruntergeladen = true; });
        await p.click('#datenExportBtn');
        await p.waitForSelector('.daten-export__fehler:not([hidden])');
        assert.match(await p.textContent('.daten-export__fehler'), /ließen sich gerade nicht zusammenstellen/);
        assert.equal(await p.isDisabled('#datenExportBtn'), false);
        await p.waitForTimeout(500);
        assert.equal(heruntergeladen, false);
    } finally { await ctx.close(); }
});

// Auf dem iPhone lädt <a download> nichts; die Datei geht über das
// Teilen-Blatt. Das öffnet Safari nur innerhalb der Nutzergeste – ist sie
// nach dem Zusammenstellen verbraucht (NotAllowedError), muss der nächste
// Tipp die schon fertige Datei teilen, ohne erneut zu laden.
const TEILEN_NACHGESTELLT = () => {
    window.__geteilt = [];
    window.__teilenFehler = [];
    navigator.canShare = () => true;
    navigator.share = async (angaben) => {
        const datei = angaben.files[0];
        window.__geteilt.push({ name: datei.name, typ: datei.type, text: await datei.text() });
        const fehler = window.__teilenFehler.shift();
        if (fehler) throw new DOMException('nachgestellt', fehler);
    };
};

test('iPhone: die Datei geht über das Teilen-Blatt', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await oeffneKontoBereich({ userAgent: IPHONE, vorher: TEILEN_NACHGESTELLT });
    try {
        let heruntergeladen = false;
        p.on('download', () => { heruntergeladen = true; });
        await p.click('#datenExportBtn');
        await p.waitForFunction(() => window.__geteilt.length === 1);
        const [geteilt] = await p.evaluate(() => window.__geteilt);
        assert.match(geteilt.name, /^opernlog-daten-.*\.json$/);
        assert.equal(geteilt.typ, 'application/json');
        assert.equal(JSON.parse(geteilt.text).abende[0].werk, 'Tosca');
        assert.equal(heruntergeladen, false);
    } finally { await ctx.close(); }
});

test('iPhone: ist die Geste verbraucht, teilt der nächste Tipp die fertige Datei', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await oeffneKontoBereich({ userAgent: IPHONE, vorher: TEILEN_NACHGESTELLT });
    try {
        await p.evaluate(() => { window.__teilenFehler = ['NotAllowedError']; });
        await p.click('#datenExportBtn');
        await p.waitForFunction(() => /Datei sichern/.test(document.querySelector('#datenExportBtn').textContent));

        // Liefe der zweite Tipp noch einmal zur Datenbank, scheiterte er jetzt.
        await p.evaluate(() => { window.__lesefehler = { visits: 'Dienst nicht erreichbar' }; });
        await p.click('#datenExportBtn');
        await p.waitForFunction(() => window.__geteilt.length === 2);
        assert.equal(await p.isHidden('.daten-export__fehler'), true);
        await p.waitForFunction(() => /Meine Daten herunterladen/.test(document.querySelector('#datenExportBtn').textContent));
    } finally { await ctx.close(); }
});
