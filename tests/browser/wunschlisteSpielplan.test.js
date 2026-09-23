// "Läuft demnächst" in der Wunschliste.
//
// Die echte Datei src/data/spielplan.js ändert sich jede Spielzeit. Der Test
// ersetzt sie deshalb durch feste Daten und prüft, was die Seite daraus
// macht: nur Kommendes, Links auf die Häuser, nichts als HTML, und ein
// ehrlicher Satz, wenn ein Werk nirgends läuft.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { starteServer, ladePlaywright, starteBrowser, ersetzeSupabase } from './umgebung.js';

const HANDY = { width: 390, height: 900 };

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

const heute = new Date();
const iso = tage => { const d = new Date(heute); d.setDate(d.getDate() + tage); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const SPIELPLAN = `
export const SPIELPLAN_STAND = '${iso(-1)}';
export const spielplan = [
  { werk: 'tosca', haus: 'semperoper', url: 'https://www.semperoper.de/tosca', termine: ['${iso(-3)}', '${iso(5)}', '${iso(9)}', '${iso(12)}', '${iso(20)}', '${iso(30)}'] },
  { werk: 'tosca', haus: 'wiener-staatsoper', url: 'https://www.wiener-staatsoper.at/tosca', termine: ['${iso(2)}'] },
  { werk: 'tosca', haus: 'oper-frankfurt', url: 'https://oper-frankfurt.de/tosca', termine: ['${iso(40)}'] },
  { werk: 'tosca', haus: 'hamburgische-staatsoper', url: 'https://www.staatsoper-hamburg.de/tosca', termine: ['${iso(50)}'] },
  { werk: 'carmen', haus: 'semperoper', url: 'javascript:alert(1)" onmouseover="window.__xss=1', termine: ['${iso(-2)}'] },
];`;

async function starte(wunschliste, { position = null, geraet = null } = {}) {
    // geraet: der Standort, den das Gerät auf Nachfrage meldet
    const ctx = await browser.newContext(geraet
        ? { viewport: HANDY, geolocation: geraet, permissions: ['geolocation'] }
        : { viewport: HANDY });
    if (position) {
        await ctx.addInitScript(p => {
            localStorage.setItem('opernlog:position', JSON.stringify({ ...p, at: Date.now() }));
        }, position);
    }
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await p.route('**/src/data/spielplan.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: SPIELPLAN }));
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await p.waitForSelector('#splash', { state: 'detached' }).catch(() => {});
    await p.evaluate(items => import('/src/store/store.js').then(m => {
        m.store.data.myLists = [{ id: 'wl', type: 'wishlist', name: 'Wunschliste', userId: 'user-me', items }];
    }), wunschliste);
    await p.evaluate(() => { location.hash = '#/wishlist'; });
    await p.waitForSelector('.list-detail-card', { timeout: 15000 });
    await p.waitForTimeout(300);
    return { ctx, p, fehler };
}

const karte = (p, titel) => p.locator('.list-detail-card', { hasText: titel });

test('ein Werk auf der Wunschliste zeigt, wo es demnächst läuft', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await starte(['tosca']);
    try {
        const k = karte(p, 'Tosca');
        assert.match(await k.locator('.spielplan-block__titel').textContent(), /Läuft demnächst/);
        // Ohne Standort nach dem nächsten Termin: Wien (in 2 Tagen) vor Dresden (in 5).
        const haeuser = await k.locator('.spielplan-block > .spielplan-eintrag .spielplan-zeile__haus').allTextContents();
        assert.match(haeuser[0], /^Wiener Staatsoper/);
        assert.match(haeuser[1], /^Semperoper/);
        assert.equal(haeuser.length, 3, 'mehr als drei Häuser stehen offen da');
        assert.match(await k.locator('.spielplan-block__weitere summary').textContent(), /1 weiteres Haus/);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Vergangenes fällt weg, lange Listen werden gekürzt', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await starte(['tosca']);
    try {
        const semper = karte(p, 'Tosca').locator('.spielplan-zeile', { hasText: 'Semperoper' });
        const termine = await semper.locator('.spielplan-zeile__termine').textContent();
        // Sechs Termine, einer vorbei: drei stehen da, "+2" dahinter.
        assert.equal(termine.split('·').length, 3, termine);
        assert.match(termine, /\+2$/);
    } finally { await ctx.close(); }
});

test('jede Zeile führt in neuem Tab auf die Seite des Hauses', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await starte(['tosca']);
    try {
        const a = karte(p, 'Tosca').locator('a.spielplan-zeile').first();
        assert.equal(await a.getAttribute('href'), 'https://www.wiener-staatsoper.at/tosca');
        assert.equal(await a.getAttribute('target'), '_blank');
        assert.match(await a.getAttribute('rel'), /noopener/);
    } finally { await ctx.close(); }
});

test('mit Standort stehen nahe Häuser vorn, mit Entfernung', { skip: fehltPlaywright }, async () => {
    // Dresden.
    const { ctx, p } = await starte(['tosca'], { position: { lat: 51.05, lon: 13.74 } });
    try {
        const erste = karte(p, 'Tosca').locator('.spielplan-zeile').first();
        assert.match(await erste.textContent(), /Semperoper/);
        assert.match(await erste.locator('.spielplan-zeile__ort').textContent(), /\d+ km/);
    } finally { await ctx.close(); }
});

test('läuft ein Werk nirgends, steht das auch so da', { skip: fehltPlaywright }, async () => {
    // Carmen hat nur einen vergangenen Termin – und einen bösartigen Link, der
    // deshalb gar nicht erst auf der Seite landet.
    const { ctx, p, fehler } = await starte(['carmen', 'rigoletto']);
    try {
        for (const titel of ['Carmen', 'Rigoletto']) {
            assert.match(await karte(p, titel).locator('.spielplan-block__leer').textContent(), /an keinem Haus/);
        }
        assert.equal(await p.locator('a.spielplan-zeile').count(), 0);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Stand und Hinweis auf die Häuser stehen unter der Liste', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await starte(['tosca']);
    try {
        assert.match(await p.textContent('.spielplan-quelle'), /Stand \d+\.\d+\.20\d\d.*maßgeblich ist die Seite des Hauses/);
    } finally { await ctx.close(); }
});

test('eine Adresse, die keine https-Seite ist, wird kein Link', { skip: fehltPlaywright }, async () => {
    const boese = SPIELPLAN.replace("termine: ['" + iso(-2) + "']", "termine: ['" + iso(3) + "']");
    const ctx = await browser.newContext({ viewport: HANDY });
    const p = await ctx.newPage();
    await p.route('**/src/data/spielplan.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: boese }));
    await ersetzeSupabase(p);
    try {
        await p.goto(`${server.url}/index.html`);
        await p.waitForFunction(() => !!window.supabase);
        await p.evaluate(() => import('/src/store/store.js').then(m => { m.store.data.myLists = [{ id: 'wl', type: 'wishlist', name: 'Wunschliste', userId: 'user-me', items: ['carmen'] }]; }));
        await p.evaluate(() => { location.hash = '#/wishlist'; });
        await p.waitForSelector('.spielplan-zeile');
        await p.hover('.spielplan-zeile');
        await p.click('.spielplan-zeile');
        assert.equal(await p.evaluate(() => window.__xss), undefined);
        assert.equal(await p.locator('.spielplan-zeile').getAttribute('onmouseover'), null);
        // Keine https-Adresse: die Zeile steht da, ist aber kein Link.
        assert.equal(await p.locator('a.spielplan-zeile').count(), 0, 'javascript: wurde zum Link');
        assert.match(await p.textContent('.spielplan-zeile'), /Semperoper/);
    } finally { await ctx.close(); }
});

test('die Wunschliste fragt nach dem Standort und ordnet die Häuser danach', { skip: fehltPlaywright }, async () => {
    // Nichts gespeichert, das Gerät steht in Hamburg: ohne Nachfrage stünde
    // Wien vorn (nächster Termin), Hamburg (Termin in 50 Tagen) ganz hinten.
    const { ctx, p } = await starte(['tosca'], { geraet: { latitude: 53.55, longitude: 9.99 } });
    const erste = karte(p, 'Tosca').locator('.spielplan-block > .spielplan-eintrag > .spielplan-zeile').first();
    await erste.filter({ hasText: 'Hamburg' }).waitFor({ timeout: 5000 });
    assert.match(await erste.innerText(), /km/);
    const gespeichert = await p.evaluate(() => JSON.parse(localStorage.getItem('opernlog:position')));
    assert.ok(Math.abs(gespeichert.lat - 53.55) < 0.01);
    await ctx.close();
});
