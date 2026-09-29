// Der Abgleich bei der Rückkehr in die App darf nichts überschreiben, was
// man geändert hat, während er unterwegs war. Seine Antwort trägt den Stand
// von vor der Änderung. Früher übernahm er sie trotzdem: die gerade gesetzte
// Markierung, der vorgemerkte Abend, der Wunschlisten-Eintrag verschwanden,
// ein gelöschter Abend stand wieder im Tagebuch – bis zum nächsten Abgleich.
// Ein zweiter Tipp auf "Vormerken" wäre dann an der Datenbank gescheitert.
// Dasselbe, wenn das Speichern noch hängt und der Abgleich vorher zurückkommt.
//
// Der Stub hält dafür das Lesen oder Schreiben einer Tabelle an, bis der Test
// es freigibt (__anhalten, __freigeben). Die Änderung fällt in diese Lücke.

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
const heute = new Date();
const iso = tage => { const d = new Date(heute); d.setDate(d.getDate() + tage); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

const SPIELPLAN = `
export const SPIELPLAN_STAND = '${iso(-1)}';
export const SPIELPLAN_ZUSATZWERKE = [];
export const spielplan = [
  { werk: 'tosca', haus: 'semperoper', url: 'https://www.semperoper.de/tosca', termine: ['${iso(5)}'] },
];`;

async function oeffne(hash, { besuche = [] } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 900 }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await p.route('**/src/data/spielplan.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: SPIELPLAN }));
    await p.addInitScript(v => { window.__besucheVorgabe = v; }, besuche);
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html${hash}`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await p.waitForSelector('.main-content', { timeout: 15000 });
    await vorhangAuf(p);
    await p.waitForFunction(() => window.__unterwegs === 0);
    return { ctx, p, fehler };
}

/**
 * Stößt den Abgleich an wie die Rückkehr in die App. Die Seite wird vorher
 * markiert: nach dem Abgleich baut die App sie neu, daran ist sein Ende zu
 * erkennen (abgleichFertig).
 */
async function abgleichStarten(p) {
    await p.evaluate(() => {
        document.querySelector('.main-content > *').dataset.vorAbgleich = '1';
        document.dispatchEvent(new Event('visibilitychange'));
    });
}

/** Wie abgleichStarten, aber das Lesen von `tabelle` bleibt hängen. */
async function abgleichHaengtBeim(p, tabelle) {
    await p.evaluate(t => { window.__anhalten = { [t]: 'lesen' }; }, tabelle);
    await abgleichStarten(p);
    await p.waitForFunction(() => window.__angehalten > 0);
}

async function abgleichFertig(p) {
    await p.waitForFunction(() => {
        const seite = document.querySelector('.main-content > *');
        return seite && !seite.dataset.vorAbgleich;
    }, null, { timeout: 15000 });
}

const lokal = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('opernlog_data')));

test('"Schon gesehen", während der Abgleich unterwegs ist, bleibt gesetzt', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/opera/tosca');
    try {
        await p.waitForSelector('#seenToggle.btn--outline');
        await abgleichHaengtBeim(p, 'seen_operas');
        await p.click('#seenToggle');
        await p.waitForFunction(() => window.__seen.includes('tosca'));
        await p.evaluate(() => window.__freigeben());
        await abgleichFertig(p);

        assert.deepEqual((await lokal(p)).seenOperas, ['tosca']);
        assert.match(await p.getAttribute('#seenToggle', 'class'), /btn--seen-active/);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('"Schon gesehen", dessen Speichern noch hängt, übersteht einen Abgleich, der vorher zurückkommt', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/opera/tosca');
    try {
        await p.waitForSelector('#seenToggle.btn--outline');
        await p.evaluate(() => { window.__anhalten = { seen_operas: 'schreiben' }; });
        await p.click('#seenToggle');
        await p.waitForFunction(() => window.__angehalten > 0);
        await abgleichStarten(p);
        await abgleichFertig(p);
        assert.deepEqual(await p.evaluate(() => window.__seen), [], 'das Speichern hing nicht');
        await p.evaluate(() => window.__freigeben());
        await p.waitForFunction(() => window.__seen.includes('tosca') && window.__unterwegs === 0);

        assert.deepEqual((await lokal(p)).seenOperas, ['tosca']);
        assert.match(await p.getAttribute('#seenToggle', 'class'), /btn--seen-active/);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('ein Abend, vorgemerkt während der Abgleich unterwegs ist, bleibt vorgemerkt', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/opera/tosca');
    try {
        await abgleichHaengtBeim(p, 'geplante_besuche');
        await p.click('#termineToggle');
        await p.click('#operaTermine .spielplan-zeile__kalender');
        await p.click('.kalender-wahl__vormerken');
        await p.waitForFunction(() => window.__geplant.length === 1);
        await p.waitForSelector('.kalender-wahl__vormerken--an');
        await p.click('#kalenderWahlAbbrechen');
        await p.evaluate(() => window.__freigeben());
        await abgleichFertig(p);

        const plaene = (await lokal(p)).geplant;
        assert.deepEqual(plaene.map(pl => [pl.operaId, pl.datum]), [['tosca', iso(5)]]);
        await p.evaluate(() => { location.hash = '#/'; });
        await p.waitForSelector('.demnaechst');
        assert.match(await p.textContent('.demnaechst'), /Tosca/);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('ein Werk, auf die Wunschliste gesetzt während der Abgleich unterwegs ist, bleibt darauf', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/opera/tosca');
    try {
        await p.waitForSelector('#wishlistToggle.btn--outline');
        await abgleichHaengtBeim(p, 'lists');
        await p.click('#wishlistToggle');
        await p.waitForSelector('#wishlistToggle.btn--wishlist-active');
        assert.deepEqual(await p.evaluate(() => window.__lists.map(l => l.items)), [['tosca']]);
        await p.evaluate(() => window.__freigeben());
        await abgleichFertig(p);

        const listen = (await lokal(p)).myLists;
        assert.deepEqual(listen.map(l => [l.type, l.items]), [['wishlist', ['tosca']]]);
        assert.match(await p.getAttribute('#wishlistToggle', 'class'), /btn--wishlist-active/);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('ein Abend, gelöscht während der Abgleich unterwegs ist, kommt nicht zurück', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const besuch = { id: 'v1', user_id: UID, opera_id: 'tosca', house_id: 'semperoper', date: '2026-05-01', rating: 4 };
    const { ctx, p, fehler } = await oeffne('#/diary', { besuche: [besuch] });
    try {
        await p.waitForSelector('.diary-entry');
        p.on('dialog', d => d.accept());
        await abgleichHaengtBeim(p, 'visits');
        await p.click('.diary-entry__delete');
        await p.waitForFunction(() => window.__visits.length === 0);
        await p.waitForSelector('.diary-entry', { state: 'detached' });
        await p.evaluate(() => window.__freigeben());
        await abgleichFertig(p);

        assert.deepEqual((await lokal(p)).myVisits, []);
        assert.equal(await p.locator('.diary-entry').count(), 0);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});
