// Geplante Besuche: im Termin-Fenster vormerken, auf der Startseite unter
// "Demnächst" sehen, nach dem Abend "Wie war …?" – Loggen mit ausgefülltem
// Formular, danach ist der Plan weg. Der Spielplan ist durch feste Daten
// ersetzt (wie in kalender.test.js).

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
  { werk: 'tosca', haus: 'semperoper', url: 'https://www.semperoper.de/tosca', termine: ['${iso(5)}', '${iso(9)}'],
    zeiten: { '${iso(5)}': '19:00-22:30' } },
];`;

async function oeffne(hash, { plaene = [] } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await p.route('**/src/data/spielplan.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: SPIELPLAN }));
    await p.addInitScript(v => { window.__geplantVorgabe = v; }, plaene);
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html${hash}`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await vorhangAuf(p);
    return { ctx, p, fehler };
}

test('im Termin-Fenster vormerken, auf der Startseite sehen, wieder entfernen', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/opera/tosca');
    try {
        await p.click('#termineToggle');
        await p.click('#operaTermine .spielplan-zeile__kalender');
        const knopf = p.locator('.kalender-wahl__vormerken').first();
        assert.equal((await knopf.textContent()).trim(), 'Vormerken');
        await knopf.click();
        await p.waitForFunction(() => window.__geplant.length === 1);
        // Die Zeile ist schon in der Datenbank, bevor der Knopf umschaltet –
        // auf den Knopf warten, nicht gleich lesen.
        await p.waitForSelector('.kalender-wahl__vormerken--an');
        assert.equal((await knopf.textContent()).trim(), '✓ Vorgemerkt');
        const [zeile] = await p.evaluate(() => window.__geplant);
        assert.deepEqual({ werk: zeile.opera_id, haus: zeile.house_id, datum: zeile.datum, zeit: zeile.zeit },
            { werk: 'tosca', haus: 'semperoper', datum: iso(5), zeit: '19:00-22:30' });
        // Das Fenster bleibt offen – man merkt sich oft zwei Abende.
        assert.equal(await p.locator('.kalender-wahl').count(), 1);
        await p.click('#kalenderWahlAbbrechen');
        // Das Schließen nimmt den Verlaufseintrag des Fensters verzögert weg
        // (zurueckGeste.js). Erst abwarten – sonst kommt der Rücksprung nach
        // dem Wechsel zur Startseite an und führt wieder zum Werk.
        await p.waitForFunction(() => !history.state?.opernlogFenster);

        await p.evaluate(() => { location.hash = '#/'; });
        await p.waitForSelector('.demnaechst');
        const text = await p.textContent('.demnaechst');
        assert.match(text, /Tosca/);
        assert.match(text, /Semperoper/);
        assert.match(text, /19:00–22:30/);

        await p.click('.demnaechst__weg');
        await p.waitForFunction(() => window.__geplant.length === 0);
        await p.waitForSelector('.demnaechst', { state: 'detached' });
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

// Demnächst zeigt nur den nächsten Abend; die späteren per Pfeil oder Wischen
// (Jonas, 1.10.2026: die Liste war zu voll). Gewischt wird über das seitliche
// Scrollen des Bands – das ist hier scrollTo.
test('Demnächst: ein Abend sichtbar, Pfeile und Wischen blättern, Entfernen zählt mit', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const plaene = [['tosca', 5], ['aida', 9], ['carmen', 12]].map(([werk, tage], i) => (
        { id: `aaaaaaaa-0000-4000-8000-00000000001${i}`, user_id: UID, opera_id: werk, house_id: 'semperoper', datum: iso(tage), zeit: null }));
    const { ctx, p, fehler } = await oeffne('#/', { plaene });
    const zahl = () => p.textContent('.demnaechst__zahl');
    const warteAuf = text => p.waitForFunction(t => document.querySelector('.demnaechst__zahl')?.textContent === t, text);
    // Bis das sanfte Blättern eingerastet ist – die Zahl springt schon auf halber Strecke um.
    const eingerastet = () => p.waitForFunction(() => {
        const band = document.querySelector('.demnaechst__liste');
        return band.scrollLeft % band.clientWidth === 0;
    });
    // Was ganz im Band zu sehen ist.
    const sichtbar = () => p.evaluate(() => {
        const band = document.querySelector('.demnaechst__liste').getBoundingClientRect();
        return [...document.querySelectorAll('.demnaechst__zeile')]
            .filter((z) => { const r = z.getBoundingClientRect(); return r.left >= band.left - 1 && r.right <= band.right + 1; })
            .map(z => z.querySelector('strong').textContent);
    });
    try {
        await p.waitForSelector('.demnaechst');
        assert.equal(await zahl(), '1 / 3');
        assert.deepEqual(await sichtbar(), ['Tosca']);
        assert.equal(await p.isDisabled('[data-schritt="-1"]'), true);

        await p.click('[data-schritt="1"]');
        await warteAuf('2 / 3');
        await eingerastet();
        assert.deepEqual(await sichtbar(), ['Aida']);
        await p.click('[data-schritt="1"]');
        await warteAuf('3 / 3');
        await eingerastet();
        assert.deepEqual(await sichtbar(), ['Carmen']);
        assert.equal(await p.isDisabled('[data-schritt="1"]'), true);

        // Zurückwischen an den Anfang.
        await p.evaluate(() => document.querySelector('.demnaechst__liste').scrollTo({ left: 0 }));
        await warteAuf('1 / 3');
        await eingerastet();
        assert.deepEqual(await sichtbar(), ['Tosca']);

        await p.click('.demnaechst__zeile:first-child .demnaechst__weg');
        await p.waitForFunction(() => window.__geplant.length === 2);
        await warteAuf('1 / 2');
        await eingerastet();
        assert.deepEqual(await sichtbar(), ['Aida']);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('nur ein Abend vorgemerkt: keine Pfeile', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const plan = { id: 'aaaaaaaa-0000-4000-8000-000000000020', user_id: UID, opera_id: 'tosca', house_id: 'semperoper', datum: iso(5), zeit: null };
    const { ctx, p } = await oeffne('#/', { plaene: [plan] });
    try {
        await p.waitForSelector('.demnaechst');
        assert.equal(await p.isVisible('.demnaechst__blaettern'), false);
    } finally { await ctx.close(); }
});

test('ein zweiter Klick nimmt die Vormerkung zurück', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await oeffne('#/opera/tosca');
    try {
        await p.click('#termineToggle');
        await p.click('#operaTermine .spielplan-zeile__kalender');
        const knopf = p.locator('.kalender-wahl__vormerken').nth(1);
        await knopf.click();
        await p.waitForFunction(() => window.__geplant.length === 1);
        await knopf.click();
        await p.waitForFunction(() => window.__geplant.length === 0);
        await p.waitForSelector('.kalender-wahl__vormerken--an', { state: 'detached' });
        assert.equal((await knopf.textContent()).trim(), 'Vormerken');
    } finally { await ctx.close(); }
});

// "In der Nähe" und "Demnächst hier" zeigen jeden Abend einzeln, ohne das
// Termin-Fenster – dort steht das Lesezeichen in der Zeile.
for (const [wo, hash] of [['In der Nähe', '#/naehe'], ['Demnächst hier', '#/house/semperoper']]) {
    test(`${wo}: das Lesezeichen merkt den Abend mit Uhrzeit vor und nimmt ihn zurück`, { skip: fehltPlaywright, timeout: 60000 }, async () => {
        const { ctx, p, fehler } = await oeffne(hash);
        try {
            const knopf = p.locator(`.naehe-abend__vormerken[data-werk="tosca"][data-datum="${iso(5)}"]`);
            await knopf.waitFor();
            assert.equal(await knopf.getAttribute('aria-pressed'), 'false');
            await knopf.click();
            await p.waitForFunction(() => window.__geplant.length === 1);
            const [zeile] = await p.evaluate(() => window.__geplant);
            assert.deepEqual({ werk: zeile.opera_id, haus: zeile.house_id, datum: zeile.datum, zeit: zeile.zeit },
                { werk: 'tosca', haus: 'semperoper', datum: iso(5), zeit: '19:00-22:30' });
            await p.waitForSelector('.naehe-abend__vormerken--an');
            assert.equal(await knopf.getAttribute('aria-pressed'), 'true');
            // Das Zeichen ist gefüllt, solange der Abend vorgemerkt ist.
            assert.equal(await knopf.locator('svg').getAttribute('fill'), 'currentColor');

            await knopf.click();
            await p.waitForFunction(() => window.__geplant.length === 0);
            await p.waitForSelector('.naehe-abend__vormerken--an', { state: 'detached' });
            assert.equal(await knopf.getAttribute('aria-pressed'), 'false');
            assert.deepEqual(fehler, []);
        } finally { await ctx.close(); }
    });
}

test('ein vorgemerkter Abend steht in "In der Nähe" schon als vorgemerkt da', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const plan = { id: 'aaaaaaaa-0000-4000-8000-000000000003', user_id: UID, opera_id: 'tosca', house_id: 'semperoper', datum: iso(9), zeit: null };
    const { ctx, p } = await oeffne('#/naehe', { plaene: [plan] });
    try {
        await p.waitForSelector('.naehe-abend__vormerken--an');
        const an = await p.$$eval('.naehe-abend__vormerken--an', ks => ks.map(k => k.dataset.datum));
        assert.deepEqual(an, [iso(9)]);
    } finally { await ctx.close(); }
});

test('nach dem Abend: "Wie war …?" – Loggen füllt das Formular, danach ist der Plan weg', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const plan = { id: 'aaaaaaaa-0000-4000-8000-000000000001', user_id: UID, opera_id: 'tosca', house_id: 'semperoper', datum: iso(-1), zeit: '19:00' };
    const { ctx, p, fehler } = await oeffne('#/', { plaene: [plan] });
    try {
        await p.waitForSelector('.plan-frage');
        assert.match(await p.textContent('.plan-frage__text'), /Wie war Tosca gestern\?/);
        await p.click('.plan-frage a.btn');
        await p.waitForSelector('#visitDate');
        assert.equal(await p.inputValue('#visitDate'), iso(-1));
        assert.equal(await p.inputValue('#houseId'), 'semperoper');
        assert.equal(await p.inputValue('#operaId'), 'tosca');

        // Bewerten und speichern: der Plan ist damit erledigt.
        const stern = p.locator('#ratingWidget .star').nth(3);
        const box = await stern.boundingBox();
        await p.mouse.click(box.x + box.width * 0.75, box.y + box.height / 2);
        await p.click('#logForm button[type="submit"]');
        await p.waitForFunction(() => window.__besuchVersuche.length === 1);
        await p.waitForFunction(() => window.__geplant.length === 0);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('"Nicht hingegangen" entfernt den Plan, die Frage verschwindet', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const plan = { id: 'aaaaaaaa-0000-4000-8000-000000000002', user_id: UID, opera_id: 'tosca', house_id: 'semperoper', datum: iso(-3), zeit: null };
    const { ctx, p } = await oeffne('#/', { plaene: [plan] });
    try {
        await p.waitForSelector('.plan-frage');
        await p.click('.plan-frage__nein');
        await p.waitForFunction(() => window.__geplant.length === 0);
        await p.waitForSelector('.plan-frage', { state: 'detached' });
    } finally { await ctx.close(); }
});

test('ein ins Datum geschriebener Tag in der Zukunft füllt das Formular nicht', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await oeffne(`#/log?house=semperoper&opera=tosca&datum=${iso(3)}`);
    try {
        await p.waitForSelector('#visitDate');
        assert.equal(await p.inputValue('#visitDate'), iso(0));
    } finally { await ctx.close(); }
});
