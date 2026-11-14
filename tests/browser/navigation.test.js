// Rückmeldungen eines neuen Mitglieds (14.11.2026):
//   - auf manchen Unterseiten fehlte der Zurück-Pfeil
//   - der Menüknopf gab keinerlei Rückmeldung
//   - "Opern" heißt "Opernwerke"
//   - der Feed lässt sich nicht von Hand aktualisieren (oben ziehen)

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

/**
 * @param {string} hash
 * @param {object} [o]
 * @param {boolean} [o.installiert]  als App vom Home-Bildschirm (navigator.standalone)
 * @param {boolean} [o.iphone]
 */
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

async function oeffne(hash, { installiert = false, iphone = false } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', hasTouch: true, ...(iphone ? { userAgent: IPHONE } : {}) });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await p.addInitScript((inst) => {
        window.__vibriert = [];
        Object.defineProperty(Navigator.prototype, 'vibrate', { configurable: true, value: (ms) => { window.__vibriert.push(ms); return true; } });
        if (inst) Object.defineProperty(Navigator.prototype, 'standalone', { configurable: true, get: () => true });
        localStorage.setItem('opernlog:willkommenGesehen:11111111-1111-1111-1111-111111111111', '1');
    }, installiert);
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html${hash}`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await vorhangAuf(p);
    return { ctx, p, fehler };
}

const gehe = async (p, hash) => {
    await p.evaluate(h => { location.hash = h; }, hash);
    await p.waitForFunction(h => location.hash === h, hash);
    await p.waitForTimeout(150);
};

test('"Opern" heißt jetzt "Opernwerke" – in der Leiste und im Menü', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/');
    try {
        await p.waitForSelector('.tab-leiste__punkt[data-page="operas"]');
        assert.equal((await p.textContent('.tab-leiste__punkt[data-page="operas"] .tab-leiste__text')).trim(), 'Opernwerke');
        assert.equal((await p.textContent('.nav-link[data-page="operas"] span')).trim(), 'Opernwerke');
        // Passt in die Leiste: kein Umbruch, nichts abgeschnitten.
        const passt = await p.$eval('.tab-leiste__punkt[data-page="operas"] .tab-leiste__text', el => el.scrollWidth <= el.clientWidth + 1 && el.getClientRects().length === 1);
        assert.ok(passt, 'der Text passt nicht in die Leiste');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('der Menüknopf: Kreuz, aria-expanded, Haptik, und das Menü gleitet auf und zu', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/');
    try {
        await p.waitForSelector('#mobileMenuToggle');
        assert.equal(await p.getAttribute('#mobileMenuToggle', 'aria-expanded'), 'false');
        assert.equal(await p.isVisible('.nav-links .nav-link[data-page="houses"]'), false);

        await p.click('#mobileMenuToggle');
        await p.waitForFunction(() => document.querySelector('#mobileMenuToggle').getAttribute('aria-expanded') === 'true');
        assert.ok(await p.$eval('#mobileMenuToggle', el => el.classList.contains('nav-mobile-toggle--offen')));
        assert.equal(await p.evaluate(() => window.__vibriert.length), 1);
        // Es bewegt sich: der obere Strich dreht sich zum Kreuz, das Menü blendet auf.
        const bewegt = await p.evaluate(() => ({
            strich: getComputedStyle(document.querySelector('.nav-mobile-toggle__strich--oben')).transitionDuration,
            menue: getComputedStyle(document.querySelector('.nav-links')).transitionProperty,
        }));
        assert.notEqual(bewegt.strich, '0s');
        assert.match(bewegt.menue, /opacity/);
        await p.waitForTimeout(400);
        assert.equal(await p.isVisible('.nav-links .nav-link[data-page="houses"]'), true);
        // Ein symmetrisches Kreuz: beide Striche haben ihre Mitte in der Mitte
        // des Zeichens (14.11.2026 stand es schief – falsche Reihenfolge von
        // Schieben und Drehen).
        const mitten = await p.evaluate(() => {
            const svg = document.querySelector('#mobileMenuToggle svg').getBoundingClientRect();
            return [...document.querySelectorAll('.nav-mobile-toggle__strich--oben, .nav-mobile-toggle__strich--unten')].map((l) => {
                const b = l.getBoundingClientRect();
                return [b.x + b.width / 2 - svg.x - svg.width / 2, b.y + b.height / 2 - svg.y - svg.height / 2];
            });
        });
        for (const [dx, dy] of mitten) assert.ok(Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5, `Strich neben der Mitte: ${dx}, ${dy}`);

        await p.click('#mobileMenuToggle');
        await p.waitForFunction(() => document.querySelector('#mobileMenuToggle').getAttribute('aria-expanded') === 'false');
        assert.equal(await p.evaluate(() => window.__vibriert.length), 2);
        await p.waitForTimeout(400);
        assert.equal(await p.isVisible('.nav-links .nav-link[data-page="houses"]'), false);

        // Ein Menüpunkt schließt das Menü, und der Knopf wird wieder zu drei Strichen.
        await p.click('#mobileMenuToggle');
        await p.waitForTimeout(400);
        await p.click('.nav-links--open .nav-link[data-page="wishlist"]');
        await p.waitForFunction(() => location.hash === '#/wishlist');
        await p.waitForFunction(() => document.querySelector('#mobileMenuToggle').getAttribute('aria-expanded') === 'false');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('iPhone: der Menüknopf klickt über seine Fläche und öffnet das Menü genau einmal', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/', { iphone: true });
    try {
        await p.waitForSelector('#mobileMenuToggle > .haptik-flaeche', { state: 'attached' });
        const schalter = () => p.$eval('#mobileMenuToggle .haptik-flaeche input', el => el.checked);
        const vorher = await schalter();
        // Der Finger trifft die Fläche, nicht den Knopf darunter.
        const oben = await p.evaluate(() => {
            const r = document.querySelector('#mobileMenuToggle').getBoundingClientRect();
            return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.className;
        });
        assert.equal(oben, 'haptik-flaeche');
        await p.click('#mobileMenuToggle');
        await p.waitForTimeout(200);
        assert.notEqual(await schalter(), vorher, 'der Schalter wurde nicht umgelegt');
        assert.equal(await p.getAttribute('#mobileMenuToggle', 'aria-expanded'), 'true');
        await p.click('#mobileMenuToggle');
        await p.waitForTimeout(200);
        assert.equal(await p.getAttribute('#mobileMenuToggle', 'aria-expanded'), 'false');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

const UNTERSEITEN = ['#/houses', '#/wishlist', '#/naehe', '#/lists', '#/community', '#/sammlungen',
    '#/bildnachweise', '#/datenschutz', '#/opera/tosca', '#/house/semperoper', '#/composer/giacomo-puccini',
    '#/profile/22222222-2222-2222-2222-222222222222'];
const LEISTE = ['#/', '#/operas', '#/diary', '#/profile/user-me'];

test('jede Seite außerhalb der Leiste hat einen Zurück-Pfeil, die Seiten der Leiste keinen', { skip: fehltPlaywright, timeout: 120000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/');
    try {
        const ohne = [];
        for (const h of UNTERSEITEN) {
            await gehe(p, h);
            const da = await p.waitForSelector('.main-content a[data-zurueck]', { timeout: 5000 }).then(() => true, () => false);
            if (!da) ohne.push(h);
        }
        assert.deepEqual(ohne, [], 'ohne Zurück-Pfeil');
        const mit = [];
        for (const h of LEISTE) {
            await gehe(p, h);
            await p.waitForTimeout(300);
            if (await p.locator('.main-content a[data-zurueck]').count()) mit.push(h);
        }
        assert.deepEqual(mit, [], 'Leistenseiten mit Zurück-Pfeil');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Zurück führt eine Seite zurück – auch nach Hin und Zurück –, von außen geöffnet zur Ersatzseite', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/diary');
    try {
        await p.waitForTimeout(300);
        await gehe(p, '#/wishlist');
        await p.click('.main-content a[data-zurueck]');
        await p.waitForFunction(() => location.hash === '#/diary');

        // Vor und wieder zurück: die Wunschliste ist danach nicht mehr die erste Seite.
        await gehe(p, '#/houses');
        await gehe(p, '#/opera/tosca');
        await p.click('.main-content a[data-zurueck]');
        await p.waitForFunction(() => location.hash === '#/houses');
        await p.click('.main-content a[data-zurueck]');
        await p.waitForFunction(() => location.hash === '#/diary');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }

    // Direkt auf einer Werkseite geöffnet: kein "davor" in der App.
    const zwei = await oeffne('#/opera/tosca');
    try {
        await zwei.p.waitForSelector('.main-content a[data-zurueck]');
        await zwei.p.click('.main-content a[data-zurueck]');
        await zwei.p.waitForFunction(() => location.hash === '#/operas');
        assert.match(zwei.p.url(), /index\.html#\/operas$/);
        // Nach dem Neuladen weiß die Seite noch, dass es ein "davor" gibt.
        await gehe(zwei.p, '#/opera/aida');
        await zwei.p.reload();
        await zwei.p.waitForFunction(() => !!window.supabase);
        await vorhangAuf(zwei.p);
        await zwei.p.waitForSelector('.main-content a[data-zurueck]');
        await zwei.p.click('.main-content a[data-zurueck]');
        await zwei.p.waitForFunction(() => location.hash === '#/operas');
        assert.deepEqual(zwei.fehler, []);
    } finally { await zwei.ctx.close(); }
});

/** Ein Finger, der von y0 nach y1 zieht und loslässt. */
async function ziehe(p, y0, y1, { schritte = 8 } = {}) {
    await p.evaluate(async ([a, b, n]) => {
        const ziel = document.querySelector('.page--home') || document.body;
        const finger = y => new Touch({ identifier: 1, target: ziel, clientX: 200, clientY: y });
        const senden = (art, y) => document.dispatchEvent(new TouchEvent(art, {
            bubbles: true, cancelable: true,
            touches: art === 'touchend' ? [] : [finger(y)],
            changedTouches: [finger(y)],
        }));
        senden('touchstart', a);
        for (let i = 1; i <= n; i++) {
            senden('touchmove', a + (b - a) * i / n);
            await new Promise(r => requestAnimationFrame(r));
        }
        senden('touchend', b);
    }, [y0, y1, schritte]);
}

test('installiert: im Feed oben ziehen aktualisiert, kurzes Ziehen nicht', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/', { installiert: true });
    try {
        await p.waitForSelector('.page--home .ziehen', { state: 'attached' });
        await p.evaluate(() => { document.querySelector('.page--home').dataset.alt = '1'; window.scrollTo({ top: 0, behavior: 'instant' }); });

        // Zu kurz: schnappt zurück, nichts wird neu geladen.
        await ziehe(p, 200, 260);
        await p.waitForTimeout(400);
        assert.equal(await p.locator('.page--home[data-alt]').count(), 1);
        assert.equal(await p.$eval('.ziehen', el => el.offsetHeight), 0);
        assert.equal(await p.evaluate(() => window.__vibriert.length), 0);

        // Weit genug: der Pfeil dreht sich um (Vibration), loslassen lädt neu.
        await ziehe(p, 200, 400);
        await p.waitForFunction(() => !document.querySelector('.page--home[data-alt]') && !!document.querySelector('.page--home'), null, { timeout: 10000 });
        assert.equal(await p.evaluate(() => window.__vibriert.length), 1);

        // Gleich noch einmal: die 30-Sekunden-Sperre gilt fürs Ziehen nicht.
        await p.evaluate(() => { document.querySelector('.page--home').dataset.alt = '2'; });
        await ziehe(p, 200, 400);
        await p.waitForFunction(() => !document.querySelector('.page--home[data-alt]') && !!document.querySelector('.page--home'), null, { timeout: 10000 });
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('installiert: auch auf der Seite Freunde aktualisiert Ziehen – der offene Tab bleibt offen', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/community', { installiert: true });
    try {
        await p.waitForSelector('.page--community .ziehen', { state: 'attached' });
        await p.click('.community-tabs .tab[data-tab="feed"]');
        await p.waitForFunction(() => !document.querySelector('#communityContent .loading-spinner'));
        await p.evaluate(() => {
            window.scrollTo({ top: 0, behavior: 'instant' });
            window.__inhalt = document.querySelector('#communityContent').firstElementChild;
            window.__seite = document.querySelector('.page--community');
        });
        await ziehe(p, 200, 400);
        // Neu geladen: der Inhalt ist ein anderer, Seite und Tab sind dieselben.
        await p.waitForFunction(() => {
            const jetzt = document.querySelector('#communityContent').firstElementChild;
            return jetzt && jetzt !== window.__inhalt && !jetzt.classList.contains('loading-spinner');
        }, null, { timeout: 10000 });
        assert.ok(await p.evaluate(() => window.__seite === document.querySelector('.page--community')));
        assert.equal(await p.getAttribute('.community-tabs .tab--active', 'data-tab'), 'feed');
        await p.waitForTimeout(400);
        assert.equal(await p.$eval('.page--community .ziehen', el => el.offsetHeight), 0, 'der Kreis schnappte nicht zurück');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('installiert: weiter unten gescrollt oder seitwärts gewischt wird nicht aktualisiert', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await oeffne('#/', { installiert: true });
    try {
        await p.waitForSelector('.page--home .ziehen', { state: 'attached' });
        await p.evaluate(() => {
            document.querySelector('.page--home').dataset.alt = '1';
            document.querySelector('.page--home').style.minHeight = '3000px';
            window.scrollTo({ top: 400, behavior: 'instant' });
        });
        assert.ok(await p.evaluate(() => window.scrollY) >= 300, 'nicht gescrollt');
        await ziehe(p, 200, 450);
        await p.waitForTimeout(500);
        assert.equal(await p.locator('.page--home[data-alt]').count(), 1);

        await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        await p.evaluate(async () => {
            const ziel = document.body;
            const f = (x, y) => new Touch({ identifier: 1, target: ziel, clientX: x, clientY: y });
            const s = (art, x, y) => document.dispatchEvent(new TouchEvent(art, { bubbles: true, cancelable: true, touches: art === 'touchend' ? [] : [f(x, y)], changedTouches: [f(x, y)] }));
            s('touchstart', 100, 200);
            for (let i = 1; i <= 8; i++) s('touchmove', 100 + 30 * i, 200 + 12 * i);
            s('touchend', 340, 296);
        });
        await p.waitForTimeout(500);
        assert.equal(await p.locator('.page--home[data-alt]').count(), 1);
    } finally { await ctx.close(); }
});

test('im Browser-Tab kein eigenes Ziehen – dort hat der Browser seines', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await oeffne('#/');
    try {
        await p.waitForSelector('.page--home');
        await p.waitForTimeout(300);
        assert.equal(await p.locator('.ziehen').count(), 0);
    } finally { await ctx.close(); }
});
