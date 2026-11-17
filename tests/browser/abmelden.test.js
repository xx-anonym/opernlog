// Abmelden ohne Neuladen.
//
// Bis 17.11.2026 lud die App nach dem Abmelden die Seite neu, damit vom alten
// Konto nichts im Speicher blieb. Man sah die Anmeldung, dann den
// Ladebildschirm (später: einen dunklen Moment), dann wieder die Anmeldung –
// das wirkte wie ein Fehler (Jonas). Jetzt baut die App die Oberfläche an Ort
// und Stelle neu (App.nachAbmeldung() in main.js).
//
// Damit muss alles, was das Neuladen weggeräumt hat, ausdrücklich weg: die
// Daten im Store, die Leiste samt Punkt für offene Anfragen, die
// Scrollpositionen. Und das nächste Konto muss sich in derselben Seite
// anmelden können.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { starteServer, ladePlaywright, starteBrowser, ersetzeSupabase, vorhangAuf } from './umgebung.js';

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

test('Abmelden führt ohne Neuladen zur Anmeldung, und man kann sich gleich wieder anmelden', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const ctx = await browser.newContext({ viewport: HANDY });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    let geladen = 0;
    p.on('load', () => { geladen++; });
    try {
        await ersetzeSupabase(p);
        await p.goto(`${server.url}/index.html#/profile/user-me`);
        await p.waitForSelector('#logoutBtn', { timeout: 15000 });
        await vorhangAuf(p);
        await p.waitForFunction(() => import('/src/store/store.js').then(m => m.store.isCloud));
        assert.equal(geladen, 1);
        // Ein Punkt für offene Anfragen, wie ihn die Leiste beim alten Konto trug.
        await p.evaluate(() => {
            const dot = document.createElement('span');
            dot.className = 'notification-dot';
            document.querySelector('.main-nav [data-page="home"]').appendChild(dot);
        });
        // Wie bei Supabase: nach signOut() gibt es keine Sitzung mehr.
        await p.evaluate(() => import('/src/store/supabase.js').then(m => {
            const sb = m.getSupabase();
            const echt = sb.auth.signOut.bind(sb.auth);
            sb.auth.signOut = async (o) => { const r = await echt(o); window.__ohneSitzung = true; return r; };
        }));

        await p.click('#logoutBtn');
        await p.waitForSelector('#loginEmail', { state: 'visible' });
        assert.equal(await p.evaluate(() => location.hash), '#/auth');
        assert.equal(geladen, 1, 'die Seite wurde neu geladen');
        assert.equal(await p.locator('#splash:not(.splash--hidden)').count(), 0, 'der Ladebildschirm kam wieder');
        assert.equal(await p.locator('#loginEmail').count(), 1, 'die Anmeldung steht doppelt da');
        assert.equal(await p.locator('.notification-dot').count(), 0, 'der Punkt des alten Kontos ist noch da');
        assert.equal(await p.isVisible('.tab-leiste'), false, 'die Leiste steht über der Anmeldung');
        const nachher = await p.evaluate(() => import('/src/store/store.js').then(({ store }) => ({
            cloud: store.isCloud, abende: store.data.visits?.length ?? 0, vorschlaege: store.pendingSuggestions,
        })));
        assert.deepEqual(nachher, { cloud: false, abende: 0, vorschlaege: { opera: false, house: false } });

        // Geschützte Seiten führen weiter zur Anmeldung.
        await p.evaluate(() => { location.hash = '#/diary'; });
        await p.waitForFunction(() => location.hash === '#/diary' && !!document.querySelector('#loginEmail'));

        // Und wieder anmelden, in derselben Seite.
        await p.fill('#loginEmail', 'fan@opernlog.de');
        await p.click('#loginSubmitBtn');
        await p.waitForSelector('#codeInput', { state: 'visible' });
        await p.type('#codeInput', '123456');
        await p.waitForFunction(() => import('/src/store/store.js').then(m => m.store.isCloud));
        await p.waitForFunction(() => !document.querySelector('#loginEmail'));
        assert.equal(await p.isVisible('.tab-leiste'), true, 'nach dem Anmelden fehlt die Leiste');
        assert.equal(geladen, 1, 'die Seite wurde neu geladen');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});
