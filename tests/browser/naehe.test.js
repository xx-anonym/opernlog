// "In der Nähe": die Abende im Umkreis, nach Datum, mit Kalender.
//
// Der Spielplan ist durch feste Daten ersetzt (wie in kalender.test.js), der
// Standort auf Dresden gesetzt.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { starteServer, ladePlaywright, starteBrowser, ersetzeSupabase } from './umgebung.js';

const HANDY = { width: 390, height: 900 };
const DRESDEN = { latitude: 51.05, longitude: 13.74 };

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
export const SPIELPLAN_ZUSATZWERKE = [];
export const spielplan = [
  { werk: 'tosca', haus: 'semperoper', url: 'https://www.semperoper.de/tosca', termine: ['${iso(-2)}', '${iso(3)}', '${iso(40)}'],
    zeiten: { '${iso(3)}': '19:00-22:00' } },
  { werk: 'carmen', haus: 'oper-leipzig', url: 'https://www.oper-leipzig.de/carmen', termine: ['${iso(2)}'], zeiten: { '${iso(2)}': '18:00' } },
  { werk: 'aida', haus: 'wiener-staatsoper', url: 'https://www.wiener-staatsoper.at/aida', termine: ['${iso(5)}'] },
];`;

async function naehe({ standort = true, merker = null, touch = false } = {}) {
    const ctx = await browser.newContext({ viewport: HANDY, acceptDownloads: true, hasTouch: touch,
        ...(standort ? { geolocation: DRESDEN, permissions: ['geolocation'] } : {}) });
    if (merker) await ctx.addInitScript(m => localStorage.setItem('opernlog_naehe', JSON.stringify(m)), merker);
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await p.route('**/src/data/spielplan.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: SPIELPLAN }));
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html#/naehe`);
    await p.waitForSelector('#naeheListe');
    // Bis der Vorhang weg ist: vorher gehen Klicks an ihn.
    await p.waitForSelector('#splash', { state: 'detached', timeout: 15000 });
    if (standort) await p.waitForFunction(() => document.querySelector('#naeheStandort')?.textContent.includes('Standort.'));
    return { ctx, p, fehler };
}

/** Den Schieber auf eine Entfernung stellen, wie beim Ziehen und Loslassen. */
async function umkreis(p, km) {
    await p.evaluate(km => import('/src/pages/Naehe.js').then(({ UMKREIS_STUFEN }) => {
        const s = document.querySelector('#naeheUmkreis');
        s.value = String(UMKREIS_STUFEN.indexOf(km));
        s.dispatchEvent(new Event('input'));
        s.dispatchEvent(new Event('change'));
    }), km);
    await p.waitForTimeout(150);   // gezeichnet wird im nächsten Bild
}

const zeilen = (p) => p.$$eval('.naehe-abend', els => els.map(e => e.querySelector('.naehe-abend__werk').textContent.trim()));

test('im Umkreis nach Datum, Vergangenes und Fernes nicht', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await naehe();
    try {
        // Voreinstellung: 100 km, 30 Tage. Leipzig (100 km) ja, Wien nein, Tosca in 40 Tagen nein.
        assert.deepEqual(await zeilen(p), ['Carmen', 'Tosca']);
        assert.match(await p.locator('.naehe-abend').nth(1).innerText(), /19:00[\s\S]*Semperoper[\s\S]*km/);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Umkreis und Zeitraum lassen sich weiten, und die Wahl bleibt', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await naehe();
    try {
        await p.click('#naeheAlle');
        await p.selectOption('#naeheZeitraum', 'alle');
        assert.deepEqual(await zeilen(p), ['Carmen', 'Tosca', 'Aida', 'Tosca']);
        const gemerkt = await p.evaluate(() => JSON.parse(localStorage.getItem('opernlog_naehe')));
        assert.deepEqual({ umkreis: gemerkt.umkreis, tage: gemerkt.tage }, { umkreis: null, tage: null });
    } finally { await ctx.close(); }
});

test('ohne Standort alle Häuser, mit Knopf für den Standort', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await naehe({ standort: false });
    try {
        await p.waitForSelector('#naeheStandortFragen');
        assert.deepEqual(await zeilen(p), ['Carmen', 'Tosca', 'Aida']);
        assert.equal(await p.isDisabled('#naeheUmkreis'), true);
    } finally { await ctx.close(); }
});

test('nur Werke der Wunschliste, mit Stern', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await naehe({ merker: { umkreis: null, tage: null } });
    try {
        await p.evaluate(async () => {
            const { store } = await import('/src/store/store.js');
            store.data.myLists = [{ id: 'w', type: 'wishlist', name: 'Wunschliste', items: ['tosca'] }];
            location.hash = '#/houses';
        });
        await p.waitForTimeout(200);
        await p.evaluate(() => { location.hash = '#/naehe'; });
        await p.waitForSelector('#naeheNurWunschliste');
        assert.equal(await p.locator('.naehe-abend__stern').count(), 2, 'Tosca ohne Stern');
        await p.check('#naeheNurWunschliste');
        assert.deepEqual(await zeilen(p), ['Tosca', 'Tosca']);
    } finally { await ctx.close(); }
});

test('der Kalender nimmt genau diesen Abend', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await naehe();
    try {
        const [download] = await Promise.all([p.waitForEvent('download'), p.locator('.naehe-abend__kalender').nth(1).click()]);
        assert.equal(download.suggestedFilename(), `tosca-semperoper-${iso(3)}.ics`);
        const ics = fs.readFileSync(await download.path(), 'utf8');
        assert.match(ics, new RegExp(`DTSTART;TZID=Europe/Berlin:${iso(3).replace(/-/g, '')}T190000`));
        assert.match(ics, /LOCATION:Semperoper\\, Dresden/);
    } finally { await ctx.close(); }
});

test('die Seite steht in der Navigation, und das Werk führt zu seiner Seite', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await naehe();
    try {
        assert.equal(await p.locator('.nav-link[data-nav="#/naehe"]').count(), 1);
        await p.locator('.naehe-abend__werk').first().click();
        await p.waitForFunction(() => location.hash === '#/opera/carmen');
    } finally { await ctx.close(); }
});

test('die Karte zeigt die Häuser mit Abenden; ein Tipp schränkt die Liste ein', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await naehe();
    try {
        await p.waitForSelector('#naeheKarte .housemap__svg--ausschnitt');
        const leuchtend = await p.$$eval('.housemap__dot--besucht', els => els.map(e => e.dataset.houseId).sort());
        assert.deepEqual(leuchtend, ['oper-leipzig', 'semperoper']);
        assert.equal(await p.locator('.housemap__standort').count(), 1, 'kein Standort auf der Karte');

        await p.dispatchEvent('.housemap__dot--besucht[data-house-id="semperoper"]', 'click');
        await p.waitForSelector('.naehe-hausfilter');
        assert.match(await p.locator('.naehe-hausfilter').innerText(), /Nur Semperoper/);
        assert.deepEqual(await zeilen(p), ['Tosca']);

        await p.click('#naeheAlleHaeuser');
        assert.deepEqual(await zeilen(p), ['Carmen', 'Tosca']);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('die Karte lässt sich zuklappen, und das bleibt so', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await naehe();
    try {
        await p.click('.naehe-karte__schalter');
        assert.equal(await p.evaluate(() => document.querySelector('#naeheKarte').open), false);
        // Das toggle-Ereignis kommt erst nach dem Klick.
        await p.waitForFunction(() => JSON.parse(localStorage.getItem('opernlog_naehe') || '{}').karte === false);
    } finally { await ctx.close(); }
});

test('der Umkreis lässt sich frei einstellen, Karte und Liste folgen', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await naehe();
    try {
        // 60 km: Leipzig (100 km) fällt heraus, die Semperoper bleibt.
        await umkreis(p, 60);
        assert.equal(await p.locator('#naeheUmkreisWert').innerText(), 'bis 60 km');
        assert.deepEqual(await zeilen(p), ['Tosca']);
        assert.match(await p.locator('.housemap__umkreis-text').textContent(), /60 km/);
        // Gemerkt wird die Wahl.
        await p.waitForFunction(() => JSON.parse(localStorage.getItem('opernlog_naehe')).umkreis === 60);

        // "Alle Häuser" und zurück: der Schieber kehrt auf 60 km zurück.
        await p.click('#naeheAlle');
        assert.equal(await p.getAttribute('#naeheAlle', 'aria-pressed'), 'true');
        assert.deepEqual(await zeilen(p), ['Carmen', 'Tosca', 'Aida']);
        await p.click('#naeheAlle');
        assert.equal(await p.locator('#naeheUmkreisWert').innerText(), 'bis 60 km');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('ein gemerkter Umkreis zwischen den Stufen bleibt, nur gerundet', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await naehe({ merker: { umkreis: 93, tage: 30 } });
    try {
        assert.equal(await p.locator('#naeheUmkreisWert').innerText(), 'bis 95 km');
        // Der Schieber steht an der nächsten Stufe.
        assert.equal(await p.inputValue('#naeheUmkreis'), '10');
    } finally { await ctx.close(); }
});

test('die Karte zeigt Ländergrenzen, größere Punkte für mehr Abende und Städtenamen', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await naehe({ merker: { umkreis: 300, tage: null } });
    try {
        await p.waitForSelector('#naeheKarte .housemap__land--kern');
        const r = await p.$$eval('.housemap__dot--besucht', els => Object.fromEntries(els.map(e => [e.dataset.houseId, Number(e.getAttribute('r'))])));
        // Tosca läuft zweimal an der Semperoper, Carmen einmal in Leipzig.
        assert.ok(r.semperoper > r['oper-leipzig'], `Semperoper ${r.semperoper}, Leipzig ${r['oper-leipzig']}`);
        const namen = await p.$$eval('.housemap__name', els => els.map(e => e.textContent));
        assert.ok(namen.includes('Dresden') && namen.includes('Leipzig'), namen.join(', '));
    } finally { await ctx.close(); }
});

/**
 * Zwei Finger auf die Karte, von einem Abstand zum anderen, und wieder los –
 * als echte Touch-Eingabe über das DevTools-Protokoll, also so, wie der
 * Browser sie vom Bildschirm bekäme, samt Scrollen und Abbrechen.
 * Die Finger wandern schräg, mit senkrechtem Anteil: genau dabei brach die
 * Geste auf dem iPhone ab, weil der Browser Scrollen daraus machte.
 */
async function zweiFinger(p, von, bis) {
    const cdp = await p.context().newCDPSession(p);
    await p.locator('#naeheKarte .housemap__svg').scrollIntoViewIfNeeded();
    const k = await p.locator('#naeheKarte .housemap__svg').boundingBox();
    const mx = k.x + k.width / 2, my = k.y + k.height / 2;
    const punkte = d => [
        { x: mx - d / 2 * 0.8, y: my - d / 2 * 0.6, id: 1 },
        { x: mx + d / 2 * 0.8, y: my + d / 2 * 0.6, id: 2 },
    ];
    const vorher = await p.evaluate(() => ({ box: document.querySelector('#naeheKarte .housemap__svg').getAttribute('viewBox'), y: scrollY }));
    await p.evaluate(() => { window.__svg = document.querySelector('#naeheKarte .housemap__svg'); });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: punkte(von) });
    for (let i = 1; i <= 10; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: punkte(von + (bis - von) * i / 10) });
        await p.waitForTimeout(25);
    }
    const mitten = await p.evaluate(() => ({
        wert: document.querySelector('#naeheUmkreisWert').textContent,
        dieselbe: window.__svg.isConnected,
        box: window.__svg.getAttribute('viewBox'),
        transform: window.__svg.style.transform,
        y: scrollY,
        leicht: !!document.querySelector('#naeheKarte .housemap--zoomt'),
    }));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.waitForTimeout(250);
    return { vorher, mitten };
}

test('zwei Finger auseinander: kleinerer Umkreis; zusammen: größerer, bis alle Häuser', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await naehe({ touch: true });
    try {
        const { vorher, mitten } = await zweiFinger(p, 100, 200);   // doppelt so weit: 100 km → 50 km
        assert.equal(mitten.wert, 'bis 50 km', 'keine Vorschau während der Geste');
        assert.ok(mitten.dieselbe && mitten.box !== vorher.box, 'die Karte folgt den Fingern nicht');
        assert.equal(mitten.transform, '', 'die Karte wird als Bild vergrößert');
        assert.equal(mitten.y, vorher.y, 'die Seite hat mitgescrollt – die Geste bräche ab');
        assert.equal(mitten.leicht, true, 'während der Geste mit allen Effekten gezeichnet');
        assert.equal(await p.locator('#naeheKarte .housemap--zoomt').count(), 0, 'nach der Geste ohne Effekte');
        assert.equal(await p.locator('#naeheUmkreisWert').innerText(), 'bis 50 km');
        assert.deepEqual(await zeilen(p), ['Tosca'], 'Leipzig liegt außerhalb von 50 km');
        await p.waitForFunction(() => JSON.parse(localStorage.getItem('opernlog_naehe')).umkreis === 50);

        await zweiFinger(p, 200, 20);           // weit zusammen: alle Häuser
        assert.equal(await p.getAttribute('#naeheAlle', 'aria-pressed'), 'true');
        assert.equal(await p.locator('.housemap__svg--ausschnitt').count(), 0, 'noch im Ausschnitt');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('am Rechner: Trackpad-Zoom (Strg + Mausrad) ändert den Umkreis ebenso', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await naehe();
    try {
        await p.evaluate(() => {
            const svg = document.querySelector('#naeheKarte .housemap__svg');
            for (let i = 0; i < 7; i++) svg.dispatchEvent(new WheelEvent('wheel', { deltaY: -10, ctrlKey: true, bubbles: true, cancelable: true }));
        });
        await p.waitForTimeout(500);    // Ende der Geste: eine Weile nichts
        assert.equal(await p.locator('#naeheUmkreisWert').innerText(), 'bis 50 km');
        // Ohne Strg bleibt das Mausrad ein Mausrad.
        const vorher = await p.locator('#naeheUmkreisWert').innerText();
        await p.evaluate(() => document.querySelector('#naeheKarte .housemap__svg')
            .dispatchEvent(new WheelEvent('wheel', { deltaY: 300, bubbles: true, cancelable: true })));
        await p.waitForTimeout(400);
        assert.equal(await p.locator('#naeheUmkreisWert').innerText(), vorher);
    } finally { await ctx.close(); }
});

test('zwei Finger auf der Karte halten den Browser vom Scrollen ab, einer nicht', { skip: fehltPlaywright }, async () => {
    // Das iPhone-Verhalten selbst lässt sich in Chromium nicht nachstellen:
    // Safari machte aus schrägen Fingerbewegungen Scrollen und brach die
    // Geste ab. Verhindern lässt sich das nur über touchmove mit
    // preventDefault() – genau das prüft der Test.
    const { ctx, p } = await naehe({ touch: true });
    try {
        const ergebnis = await p.evaluate(() => {
            const svg = document.querySelector('#naeheKarte .housemap__svg');
            const k = svg.getBoundingClientRect();
            const t = (id, dx) => new Touch({ identifier: id, target: svg, clientX: k.left + k.width / 2 + dx, clientY: k.top + k.height / 2 });
            const senden = (art, touches) => {
                const ev = new TouchEvent(art, { touches, targetTouches: touches, changedTouches: touches, bubbles: true, cancelable: true });
                svg.dispatchEvent(ev);
                return ev.defaultPrevented;
            };
            const einer = senden('touchmove', [t(1, 0)]);
            senden('touchstart', [t(1, -40), t(2, 40)]);
            const zwei = senden('touchmove', [t(1, -60), t(2, 60)]);
            senden('touchend', []);
            return { einer, zwei };
        });
        assert.equal(ergebnis.zwei, true, 'zwei Finger: der Browser darf scrollen und die Geste abbrechen');
        assert.equal(ergebnis.einer, false, 'ein Finger: die Seite muss weiter scrollen können');
    } finally { await ctx.close(); }
});
