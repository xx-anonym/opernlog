// Browser-Tests für die Stellen, an denen sich Fehler nicht im Code zeigen,
// sondern erst im Layout: ein Fenster, das hinter der Kopfzeile liegt, sieht
// im Quelltext richtig aus.
//
// Sie brauchen Playwright. Fehlt es, überspringen sie sich – ein
// Entwicklungsrechner ohne Browser soll nicht rot werden, nur weil die
// Unit-Tests grün sind.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { operas } from '../../src/data/operas.js';
import { STUB } from './supabaseStub.js';
import { starteServer, ladePlaywright, starteBrowser } from './umgebung.js';

const HANDY = { width: 390, height: 844 };      // iPhone 14/15
const RECHNER = { width: 1200, height: 900 };

// Fünf Abende, davon zweimal dasselbe Werk, in zwei Häusern.
const GELOGGT = ['la-traviata', 'aida', 'rigoletto', 'aida', 'tristan'];
const BESUCHE = GELOGGT.map((operaId, i) => ({
    id: 'v' + i, userId: 'user-me', operaId, houseId: i < 3 ? 'semperoper' : 'bayerische-staatsoper',
    date: `2026-01-0${i + 1}`, rating: 4, likes: 0, likedBy: [], comments: [],
}));

// Dazu genug markierte Werke, dass die Liste länger wird als der Bildschirm –
// sonst passt das Fenster ohnehin ins Sichtfeld und der Test über die
// Kopfzeile prüfte nichts. Der ursprüngliche Fehler zeigte sich bei 19
// Einträgen auf einem iPhone.
const MARKIERT = operas.map(o => o.id).filter(id => !GELOGGT.includes(id)).slice(0, 16);
const GESEHEN_GESAMT = new Set(GELOGGT).size + MARKIERT.length;

// Ganz oben, nicht in before(): node:test wertet die skip-Angabe schon beim
// Anmelden der Tests aus, und das passiert vor jedem before().
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

/** Eine Seite mit angemeldetem Testnutzer, Besuchen und Markierungen. */
async function oeffneProfil(viewport) {
    const ctx = await browser.newContext({ viewport });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));

    // Das echte Supabase-Skript kommt vom CDN und wird durch den Ersatz ersetzt.
    await p.route('**/cdn.jsdelivr.net/**', r =>
        r.fulfill({ status: 200, contentType: 'text/javascript', body: STUB }));

    await p.goto(`${server.url}/index.html`);
    await p.waitForSelector('#app', { state: 'attached' });
    await p.waitForFunction(() => !!document.querySelector('.stat-card, .auth-page, main'), null, { timeout: 15000 });

    await p.evaluate(v => import('/src/store/store.js').then(m => { m.store.data.myVisits = v; }), BESUCHE);
    await p.evaluate(ids => import('/src/store/store.js')
        .then(m => Promise.all(ids.map(id => m.store.markSeenOpera(id)))), MARKIERT);

    // Über eine andere Seite gehen, damit das Profil neu gezeichnet wird.
    await p.evaluate(() => { window.location.hash = '#/houses'; });
    await p.waitForTimeout(300);
    await p.evaluate(() => { window.location.hash = '#/profile/user-me'; });
    await p.waitForSelector('#seenOperasCard', { timeout: 15000 });

    return { ctx, p, fehler };
}

test('die Kachel zählt geloggte und markierte Werke zusammen', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffneProfil(RECHNER);
    try {
        const zahl = await p.textContent('#seenOperasCard .stat-card__number');
        assert.equal(zahl.trim(), String(GESEHEN_GESAMT),
            `${new Set(GELOGGT).size} verschiedene geloggte Werke + ${MARKIERT.length} markierte`);
    } finally { await ctx.close(); }
});

test('die Liste hinter der Kachel zeigt genauso viele Zeilen, wie die Kachel nennt', { skip: fehltPlaywright }, async () => {
    // Zahl und Liste kommen aus derselben Funktion – sie dürfen nicht
    // auseinanderlaufen.
    const { ctx, p } = await oeffneProfil(RECHNER);
    try {
        await p.click('#seenOperasCard');
        await p.waitForSelector('.modal--active');
        const { titel, zeilen } = await p.evaluate(() => {
            const m = document.querySelector('.modal--active');
            return {
                titel: m.querySelector('.modal__title').textContent.trim(),
                zeilen: m.querySelectorAll('.listmodal__row').length,
            };
        });
        assert.equal(zeilen, GESEHEN_GESAMT);
        assert.equal(titel.replace(/\s+/g, ' '), `Gesehene Werke (${GESEHEN_GESAMT})`);
    } finally { await ctx.close(); }
});

test('die Überschrift des Listenfensters liegt auf dem Handy unter der Kopfzeile', { skip: fehltPlaywright }, async () => {
    // Der Fehler, der das nötig macht: das Fenster wird im Sichtfeld
    // zentriert, die Navigation liegt aber fest in dessen oberen 68 px. Bei
    // vielen Einträgen rutschte die Überschrift dahinter – sichtbar war nur
    // noch die Liste, und niemand wusste, was er da vor sich hat.
    const { ctx, p } = await oeffneProfil(HANDY);
    try {
        // Die Kopfzeile wird vor dem Öffnen gemessen: die Überlagerung des
        // Fensters liegt selbst fest und über die ganze Seite und würde sonst
        // für die Kopfzeile gehalten – dann prüft der Test nichts mehr.
        const kopfUnten = await p.evaluate(() => {
            const kopf = [...document.querySelectorAll('body *')]
                .map(el => ({ s: getComputedStyle(el), b: el.getBoundingClientRect() }))
                .filter(o => o.s.position === 'fixed' && o.b.top <= 0 && o.b.height > 0
                    && o.b.width >= window.innerWidth - 1
                    && o.b.bottom > 0 && o.b.bottom < window.innerHeight / 2)
                .sort((a, b) => b.b.bottom - a.b.bottom)[0];
            return kopf ? kopf.b.bottom : 0;
        });
        assert.ok(kopfUnten > 0, 'auf dem Handy wird oben eine feste Kopfzeile erwartet');

        await p.click('#seenOperasCard');
        await p.waitForSelector('.modal--active');

        const laeuftUeber = await p.evaluate(() => {
            const l = document.querySelector('.modal--active .listmodal');
            return l.scrollHeight > l.clientHeight + 4;
        });
        assert.ok(laeuftUeber,
            'die Testliste passt auf den Bildschirm – dann prüft dieser Test den Fehler nicht');

        const mass = await p.evaluate((kopfUnten) => {
            const t = document.querySelector('.modal--active .modal__title').getBoundingClientRect();
            const knopf = document.querySelector('.modal--active .close-modal').getBoundingClientRect();
            return {
                kopfUnten,
                titelOben: t.top, titelUnten: t.bottom,
                knopfUnten: knopf.bottom, hoehe: window.innerHeight,
            };
        }, kopfUnten);

        assert.ok(mass.titelOben >= mass.kopfUnten,
            `Überschrift beginnt bei ${mass.titelOben}, die Kopfzeile endet erst bei ${mass.kopfUnten}`);
        assert.ok(mass.titelUnten <= mass.hoehe, 'Überschrift ragt unten heraus');
        assert.ok(mass.knopfUnten <= mass.hoehe,
            `Schließen-Knopf endet bei ${mass.knopfUnten}, das Fenster ist ${mass.hoehe} hoch`);
    } finally { await ctx.close(); }
});

test('beim Rollen bleibt die Überschrift stehen und nur die Liste bewegt sich', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffneProfil(HANDY);
    try {
        await p.click('#seenOperasCard');
        await p.waitForSelector('.modal--active');
        const vorher = await p.evaluate(() =>
            document.querySelector('.modal--active .modal__title').getBoundingClientRect().top);
        await p.evaluate(() => { document.querySelector('.modal--active .listmodal').scrollTop = 400; });
        await p.waitForTimeout(120);
        const nachher = await p.evaluate(() =>
            document.querySelector('.modal--active .modal__title').getBoundingClientRect().top);
        assert.equal(Math.round(vorher), Math.round(nachher));
    } finally { await ctx.close(); }
});

test('die Kachel "Häuser besucht" listet die besuchten Häuser', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffneProfil(RECHNER);
    try {
        await p.click('#visitedHousesCard');
        await p.waitForSelector('.modal--active');
        const zeilen = await p.$$eval('.modal--active .listmodal__row',
            rs => rs.map(r => r.querySelector('.listmodal__title').textContent.trim()));
        assert.equal(zeilen.length, 2, 'Semperoper und Bayerische Staatsoper');
        assert.deepEqual([...zeilen].sort(), ['Bayerische Staatsoper', 'Semperoper']);
    } finally { await ctx.close(); }
});

test('ein Klick auf die Besuche führt ins Tagebuch', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffneProfil(RECHNER);
    try {
        // Ein echter Link, kein Knopf mit Klick-Zuhörer: so lässt er sich auch
        // lange antippen, in einem neuen Tab öffnen und vorlesen.
        const kachel = p.locator('a.stat-card[href="#/diary"]');
        assert.equal(await kachel.count(), 1, 'Besuche-Kachel ist kein Link auf das Tagebuch');
        await kachel.click();
        await p.waitForFunction(() => window.location.hash.startsWith('#/diary'), null, { timeout: 5000 });
        assert.match(await p.evaluate(() => window.location.hash), /^#\/diary/);
    } finally { await ctx.close(); }
});

test('das Listenfenster geht zu, wenn man weiternavigiert', { skip: fehltPlaywright }, async () => {
    // Sonst bliebe es über der neuen Seite liegen.
    const { ctx, p } = await oeffneProfil(RECHNER);
    try {
        await p.click('#seenOperasCard');
        await p.waitForSelector('.modal--active');
        await p.evaluate(() => { window.location.hash = '#/operas'; });
        await p.waitForTimeout(300);
        assert.equal(await p.$$eval('.modal--active', ms => ms.length), 0);
    } finally { await ctx.close(); }
});

test('das Profil kommt ohne Fehler in der Konsole hoch', { skip: fehltPlaywright }, async () => {
    const { ctx, fehler } = await oeffneProfil(RECHNER);
    try {
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});
