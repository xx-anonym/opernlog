// Der Einstieg (Jonas, 9.11.2026): von acht Konten hatten zwei je einen Abend
// eingetragen. Drei Dinge sollen den Anfang leichter machen:
//
//   Willkommen     das Karussell "Was hast du schon gesehen?" beim ersten
//                  Anmelden eines neuen, leeren Kontos
//                  (src/components/Willkommen.js)
//   Leiste unten   am Handy: Feed, Opern, Loggen, Tagebuch, Profil
//                  (src/components/Navigation.js)
//   Leere Start-   erst "In deiner Nähe" und "Was dir noch fehlt", dann die
//   seite          Freunde (src/pages/Home.js)

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { starteServer, ladePlaywright, starteBrowser, ersetzeSupabase, vorhangAuf } from './umgebung.js';
import { beliebteWerke } from '../../src/data/beliebt.js';

const HANDY = { width: 390, height: 844 };
const RECHNER = { width: 1280, height: 800 };
const LEIPZIG = { lat: 51.34, lon: 12.37 };
const UID = '11111111-1111-1111-1111-111111111111';
const EIN_ABEND = [{ id: 'aaaaaaaa-1111-4000-8000-000000000001', user_id: UID, opera_id: 'tosca', house_id: 'oper-leipzig', date: '2026-10-31', rating: 4, created_at: '2026-10-31T22:00:00Z' }];

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
 * @param {object} o
 * @param {boolean} [o.neu]      das Konto ist von heute (sonst von 2024)
 * @param {Array}   [o.besuche]  Abende, die schon in der Cloud stehen
 * @param {Array}   [o.gesehen]  schon markierte Werke
 * @param {object}  [o.position] ein Standort vom letzten Mal
 */
async function oeffne(hash = '#/', { neu = false, besuche = [], gesehen = [], position = null, viewport = HANDY } = {}) {
    const ctx = await browser.newContext({ viewport, serviceWorkers: 'block', reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await p.addInitScript(([n, b, g, pos]) => {
        if (n) window.__profilErstellt = new Date().toISOString();
        window.__besucheVorgabe = b;
        window.__seenVorgabe = g;
        // Nur beim ersten Laden: nach einem Neuladen soll stehen, was die Seite selbst gemerkt hat.
        if (pos && !sessionStorage.getItem('gesetzt')) {
            localStorage.setItem('opernlog:position', JSON.stringify({ ...pos, at: Date.now() }));
            sessionStorage.setItem('gesetzt', '1');
        }
    }, [neu, besuche, gesehen, position]);
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html${hash}`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await vorhangAuf(p);
    return { ctx, p, fehler };
}

/**
 * Ob es ein Element gibt – als Wahrheitswert. Nie p.$() in eine Zusicherung
 * geben: scheitert sie, schreibt Node das ElementHandle samt der ganzen
 * Browser-Verbindung in die Meldung. Am 9.11.2026 wuchs der Testprozess
 * dabei auf über 150 GB und legte den Rechner lahm.
 */
const gibtEs = (p, selektor) => p.$$eval(selektor, es => es.length > 0);

/** Wartet, bis die Seite gezeichnet ist und das Willkommen entschieden hat. */
async function gezeichnet(p) {
    await p.waitForSelector('.page--home .feedkopf');
    await p.waitForFunction(() => !document.querySelector('.loading-spinner'));
}

// ── Willkommen ────────────────────────────────────────────

test('neues, leeres Konto: das Karussell kommt, Antippen markiert als gesehen und geht weiter', { skip: fehltPlaywright, timeout: 90000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/', { neu: true });
    try {
        await p.waitForSelector('.willkommen .willkommen__karte--mitte');
        const erwartet = beliebteWerke(24).map(w => w.id);
        assert.deepEqual(await p.$$eval('.willkommen__karte', ks => ks.map(k => k.dataset.werk)), erwartet);
        assert.equal((await p.textContent('.willkommen__fertig')).trim(), 'Überspringen');
        assert.equal(await p.getAttribute('.willkommen', 'data-mitte'), '0');

        await p.click('.willkommen__karte--mitte');
        // Gespeichert wird sofort, nicht erst am Ende.
        await p.waitForFunction(id => window.__seen.includes(id), erwartet[0]);
        assert.equal(await p.getAttribute(`.willkommen__karte[data-werk="${erwartet[0]}"]`, 'aria-pressed'), 'true');
        assert.equal((await p.textContent('.willkommen__fertig')).trim(), 'Weiter mit einem Werk');
        // Die nächste Karte rückt in die Mitte.
        await p.waitForFunction(() => document.querySelector('.willkommen').dataset.mitte === '1');
        assert.match(await p.textContent('.willkommen__stand'), /2 von 24 · 1 gesehen/);

        // Noch einmal antippen nimmt die Markierung zurück.
        await p.click(`.willkommen__karte[data-werk="${erwartet[0]}"]`);
        await p.waitForFunction(id => !window.__seen.includes(id), erwartet[0]);
        assert.equal(await p.getAttribute(`.willkommen__karte[data-werk="${erwartet[0]}"]`, 'aria-pressed'), 'false');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('nach "Weiter" ist das Fenster weg, die Startseite zeigt "Was dir noch fehlt", und es kommt nicht wieder', { skip: fehltPlaywright, timeout: 90000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/', { neu: true });
    try {
        await p.waitForSelector('.willkommen .willkommen__karte--mitte');
        // Traviata: von Verdi stehen genug andere Werke im Katalog, die dann fehlen.
        await p.click('.willkommen__karte[data-werk="la-traviata"]');
        await p.waitForFunction(() => window.__seen.includes('la-traviata'));
        await p.click('.willkommen__fertig');
        await p.waitForSelector('.willkommen', { state: 'detached' });
        await p.waitForSelector('.page--home .blindspots, .page--home [class*="blind"]');
        assert.match(await p.textContent('.page--home'), /Was dir noch fehlt/);
        assert.ok(await p.evaluate(() => !!localStorage.getItem('opernlog:willkommenGesehen')));

        await p.evaluate(() => new Promise(r => setTimeout(r, 300)));   // die Zurück-Geste räumt ihren Eintrag weg
        await p.reload();
        await p.waitForFunction(() => !!window.supabase);
        await vorhangAuf(p);
        await gezeichnet(p);
        assert.equal(await gibtEs(p, '.willkommen'), false);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('kein Karussell für alte Konten und für Konten, in denen schon etwas steht', { skip: fehltPlaywright, timeout: 120000 }, async () => {
    for (const [was, o] of [
        ['Konto von 2024', {}],
        ['neues Konto mit einem Abend', { neu: true, besuche: EIN_ABEND }],
        ['neues Konto mit einer Markierung', { neu: true, gesehen: ['tosca'] }],
    ]) {
        const { ctx, p } = await oeffne('#/', o);
        try {
            await gezeichnet(p);
            await p.evaluate(() => new Promise(r => setTimeout(r, 400)));
            assert.equal(await gibtEs(p, '.willkommen'), false, was);
        } finally { await ctx.close(); }
    }
});

test('solange die Abende noch unterwegs sind, wird nicht entschieden – ein volles Konto sieht nie ein Karussell', { skip: fehltPlaywright, timeout: 90000 }, async () => {
    // Die Oberfläche wartet höchstens drei Sekunden auf die Cloud und zeichnet
    // dann mit dem, was lokal liegt. Auf einem neuen Gerät ist das nichts –
    // jedes Konto sähe leer aus.
    const ctx = await browser.newContext({ viewport: HANDY, serviceWorkers: 'block', reducedMotion: 'reduce' });
    try {
        const p = await ctx.newPage();
        await p.addInitScript((b) => {
            window.__profilErstellt = new Date().toISOString();
            window.__besucheVorgabe = b;
        }, EIN_ABEND);
        await ersetzeSupabase(p);
        await p.addInitScript(() => {
            // Erst wenn der Ersatz steht: das Lesen der Abende aufhalten.
            const warte = setInterval(() => { if (window.__anhalten) { window.__anhalten.visits = 'lesen'; clearInterval(warte); } }, 1);
        });
        await p.goto(`${server.url}/index.html#/`);
        await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
        await vorhangAuf(p);
        await p.waitForSelector('.page--home .feedkopf');
        assert.ok(await p.evaluate(() => window.__angehalten > 0), 'das Lesen der Abende wurde nicht aufgehalten');
        assert.equal(await gibtEs(p, '.willkommen'), false, 'entschieden, bevor die Abende da waren');
        await p.evaluate(() => { window.__anhalten = {}; window.__freigeben(); });
        await p.waitForFunction(() => !document.querySelector('.feedkopf--neu'));
        await p.evaluate(() => new Promise(r => setTimeout(r, 300)));
        assert.equal(await gibtEs(p, '.willkommen'), false);
    } finally { await ctx.close(); }
});

test('lässt sich eine Markierung nicht speichern, verschwindet sie wieder – mit Meldung', { skip: fehltPlaywright, timeout: 90000 }, async () => {
    const { ctx, p } = await oeffne('#/', { neu: true });
    try {
        await p.waitForSelector('.willkommen .willkommen__karte--mitte');
        await p.evaluate(() => { window.__seenFehler = 'kein Netz'; });
        await p.click('.willkommen__karte--mitte');
        await p.waitForSelector('.toast--error');
        assert.equal(await p.getAttribute('.willkommen__karte[data-nr="0"]', 'aria-pressed'), 'false');
        assert.equal((await p.textContent('.willkommen__fertig')).trim(), 'Überspringen');
    } finally { await ctx.close(); }
});

test('die Zurück-Geste schließt das Karussell wie "Überspringen"', { skip: fehltPlaywright, timeout: 90000 }, async () => {
    const { ctx, p } = await oeffne('#/', { neu: true });
    try {
        await p.waitForSelector('.willkommen .willkommen__karte--mitte');
        await p.waitForFunction(() => Number(history.state?.opernlogFenster) >= 1);
        await p.goBack();
        await p.waitForSelector('.willkommen', { state: 'detached' });
        assert.ok(await p.evaluate(() => !!localStorage.getItem('opernlog:willkommenGesehen')));
        assert.equal(new URL(p.url()).hash, '#/');
    } finally { await ctx.close(); }
});

test('auf einem kleinen Handy ragt keine Karte unter den Zähler', { skip: fehltPlaywright, timeout: 90000 }, async () => {
    const { ctx, p } = await oeffne('#/', { neu: true, viewport: { width: 320, height: 568 } });
    try {
        await p.waitForSelector('.willkommen .willkommen__karte--mitte');
        const m = await p.evaluate(() => {
            const r = s => document.querySelector(s).getBoundingClientRect();
            return { karte: r('.willkommen__karte--mitte'), kopf: r('.willkommen__kopf'), stand: r('.willkommen__stand'), knopf: r('.willkommen__fertig') };
        });
        assert.ok(m.karte.top >= m.kopf.bottom - 1, `Karte ${m.karte.top} beginnt über dem Ende des Kopfs ${m.kopf.bottom}`);
        assert.ok(m.karte.bottom <= m.stand.top + 1, `Karte ${m.karte.bottom} reicht unter den Zähler ${m.stand.top}`);
        assert.ok(m.knopf.bottom <= 568, 'der Knopf liegt außerhalb des Bildes');
    } finally { await ctx.close(); }
});

// ── Leiste unten ──────────────────────────────────────────

test('am Handy: fünf Punkte unten, Loggen in der Mitte führt zum Formular', { skip: fehltPlaywright, timeout: 90000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/', { besuche: EIN_ABEND });
    try {
        await gezeichnet(p);
        assert.deepEqual(await p.$$eval('.tab-leiste__punkt', ps => ps.map(x => x.dataset.page)), ['home', 'operas', 'log', 'diary', 'profile']);
        const leiste = await p.evaluate(() => {
            const r = document.querySelector('.tab-leiste').getBoundingClientRect();
            return { sichtbar: getComputedStyle(document.querySelector('.tab-leiste')).display !== 'none', unten: Math.round(r.bottom), hoehe: r.height };
        });
        assert.deepEqual({ sichtbar: leiste.sichtbar, unten: leiste.unten }, { sichtbar: true, unten: HANDY.height });
        assert.equal(await p.getAttribute('.tab-leiste__punkt--aktiv', 'data-page'), 'home');

        // Die Markierung folgt dem hashchange, also einen Augenblick nach der Adresse.
        const aktiv = seite => p.waitForFunction(s => document.querySelector('.tab-leiste__punkt--aktiv')?.dataset.page === s, seite);
        await p.click('.tab-leiste__punkt--loggen');
        await p.waitForSelector('.main-content form');
        assert.equal(new URL(p.url()).hash, '#/log');
        await aktiv('log');

        await p.click('.tab-leiste__punkt[data-page="diary"]');
        await p.waitForFunction(() => location.hash === '#/diary');
        await aktiv('diary');
        assert.equal(await p.$$eval('.tab-leiste__punkt--aktiv', ps => ps.length), 1);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('die Leiste verdeckt nichts: das Ende der Seite steht über ihr', { skip: fehltPlaywright, timeout: 90000 }, async () => {
    for (const hash of ['#/log', '#/diary', '#/profile/user-me']) {
        const { ctx, p } = await oeffne(hash, { besuche: EIN_ABEND });
        try {
            await p.waitForSelector('.main-content .page');
            await p.evaluate(() => new Promise(r => setTimeout(r, 300)));
            // Ohne Gleiten: die Seite scrollt sonst weich, und gemessen würde mitten in der Bewegung.
            await p.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
            await p.waitForFunction(() => Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 1);
            const m = await p.evaluate(() => {
                const seite = document.querySelector('.main-content .page');
                // Das letzte sichtbare Stück Inhalt der Seite.
                const letzte = [...seite.querySelectorAll('*')].filter(e => e.offsetParent !== null && e.getBoundingClientRect().height > 0)
                    .reduce((u, e) => Math.max(u, e.getBoundingClientRect().bottom), 0);
                return { letzte: Math.round(letzte), leiste: Math.round(document.querySelector('.tab-leiste').getBoundingClientRect().top) };
            });
            assert.ok(m.letzte <= m.leiste, `${hash}: Inhalt endet bei ${m.letzte}, die Leiste beginnt bei ${m.leiste}`);
        } finally { await ctx.close(); }
    }
});

test('am Rechner gibt es die Leiste nicht, mit der Tastatur im Bild auch am Handy nicht', { skip: fehltPlaywright, timeout: 90000 }, async () => {
    const breit = await oeffne('#/', { besuche: EIN_ABEND, viewport: RECHNER });
    try {
        await gezeichnet(breit.p);
        assert.equal(await breit.p.$eval('.tab-leiste', e => getComputedStyle(e).display), 'none');
    } finally { await breit.ctx.close(); }

    const { ctx, p } = await oeffne('#/diary', { besuche: EIN_ABEND });
    try {
        await p.waitForSelector('.main-content .page input');
        assert.notEqual(await p.$eval('.tab-leiste', e => getComputedStyle(e).display), 'none');
        await p.focus('.main-content .page input');
        assert.equal(await p.$eval('.tab-leiste', e => getComputedStyle(e).display), 'none');
    } finally { await ctx.close(); }
});

test('das aufgeklappte Menü endet über der Leiste', { skip: fehltPlaywright, timeout: 90000 }, async () => {
    const { ctx, p } = await oeffne('#/', { besuche: EIN_ABEND });
    try {
        await gezeichnet(p);
        await p.click('#mobileMenuToggle');
        await p.waitForSelector('.nav-links--open');
        const m = await p.evaluate(() => ({
            menue: Math.round(document.querySelector('.nav-links').getBoundingClientRect().bottom),
            leiste: Math.round(document.querySelector('.tab-leiste').getBoundingClientRect().top),
        }));
        assert.ok(m.menue <= m.leiste, `Menü bis ${m.menue}, Leiste ab ${m.leiste}`);
    } finally { await ctx.close(); }
});

// ── Leere Startseite ──────────────────────────────────────

test('leere Startseite: erst "In deiner Nähe", dann die Freunde – gefragt wird erst auf Antippen', { skip: fehltPlaywright, timeout: 90000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/');
    try {
        await gezeichnet(p);
        const titel = await p.$$eval('.page--home .section__title', hs => hs.map(h => h.textContent.trim()));
        assert.deepEqual(titel, ['In deiner Nähe', 'Von deinen Freunden']);
        assert.ok(await gibtEs(p, '#startNaeheOrten'), 'der Knopf für den Standort fehlt');
        assert.equal(await gibtEs(p, '.start-naehe__abend'), false);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('leere Startseite, aber Freunde mit Abenden: deren Feed bleibt oben', { skip: fehltPlaywright, timeout: 90000 }, async () => {
    const FREUND = '22222222-2222-2222-2222-222222222222';
    const ctx = await browser.newContext({ viewport: HANDY, serviceWorkers: 'block', reducedMotion: 'reduce' });
    try {
        const p = await ctx.newPage();
        await p.addInitScript(([ich, freund]) => {
            window.__followsVorgabe = [{ follower_id: ich, following_id: freund }];
            // Kein eigener Abend; der eine in der "Datenbank" gehört dem Freund.
            window.__besucheVorgabe = [{ id: 'bbbbbbbb-1111-4000-8000-000000000001', user_id: freund, opera_id: 'la-traviata', house_id: 'semperoper',
                date: '2026-05-01', rating: 5, review: '', created_at: '2026-05-01T22:00:00Z',
                profiles: { id: freund, username: 'Freundin', avatar_initials: 'FR', avatar_icon: null } }];
        }, [UID, FREUND]);
        await ersetzeSupabase(p);
        await p.goto(`${server.url}/index.html#/`);
        await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
        await vorhangAuf(p);
        await p.waitForSelector('.page--home .feed-list .review-card');
        const titel = await p.$$eval('.page--home .section__title', hs => hs.filter(h => !h.closest('[hidden]')).map(h => h.textContent.trim()));
        assert.deepEqual(titel.slice(0, 2), ['Von deinen Freunden', 'In deiner Nähe']);
    } finally { await ctx.close(); }
});

test('mit einem Standort vom letzten Mal stehen die nächsten Abende gleich da', { skip: fehltPlaywright, timeout: 90000 }, async () => {
    const { ctx, p } = await oeffne('#/', { position: LEIPZIG });
    try {
        await gezeichnet(p);
        const abende = await p.$$eval('.start-naehe__abend', as => as.map(a => ({ ziel: a.getAttribute('href'), wo: a.querySelector('.start-naehe__wo').textContent })));
        // Der Spielplan im Repo altert; steht noch etwas an, dann höchstens drei und alle im Umkreis.
        if (abende.length) {
            assert.ok(abende.length <= 3);
            for (const a of abende) {
                assert.match(a.ziel, /^#\/opera\/[a-z0-9-]+$/);
                const km = Number(/· (\d+) km/.exec(a.wo)?.[1]);
                assert.ok(km <= 100, `${a.wo} liegt weiter weg als 100 km`);
            }
            assert.equal(await p.getAttribute('.start-naehe__mehr', 'href'), '#/naehe');
        } else {
            assert.match(await p.textContent('.start-naehe'), /läuft im Umkreis von 100 km nichts/);
        }
        assert.equal(await gibtEs(p, '#startNaeheOrten'), false);
    } finally { await ctx.close(); }
});

test('"Standort verwenden" fragt und zeigt dann die Abende; ohne Erlaubnis steht ein Hinweis da', { skip: fehltPlaywright, timeout: 90000 }, async () => {
    const mit = await browser.newContext({ viewport: HANDY, serviceWorkers: 'block', geolocation: { latitude: LEIPZIG.lat, longitude: LEIPZIG.lon }, permissions: ['geolocation'] });
    try {
        const p = await mit.newPage();
        await ersetzeSupabase(p);
        await p.goto(`${server.url}/index.html#/`);
        await p.waitForFunction(() => !!window.supabase);
        await vorhangAuf(p);
        await p.click('#startNaeheOrten');
        await p.waitForSelector('.start-naehe__liste, .start-naehe__frage:not(:has(#startNaeheOrten))');
        assert.equal(await gibtEs(p, '#startNaeheOrten'), false);
    } finally { await mit.close(); }

    const ohne = await browser.newContext({ viewport: HANDY, serviceWorkers: 'block', permissions: [] });
    try {
        const p = await ohne.newPage();
        await ersetzeSupabase(p);
        await p.goto(`${server.url}/index.html#/`);
        await p.waitForFunction(() => !!window.supabase);
        await vorhangAuf(p);
        await p.click('#startNaeheOrten');
        await p.waitForSelector('.start-naehe__hinweis');
        assert.ok(await gibtEs(p, '#startNaeheOrten'), 'der Knopf muss für einen zweiten Versuch bleiben');
    } finally { await ohne.close(); }
});

test('wer schon Abende hat, sieht die Startseite wie bisher: ohne "In deiner Nähe", die Freunde vor den Empfehlungen', { skip: fehltPlaywright, timeout: 90000 }, async () => {
    const { ctx, p } = await oeffne('#/', { besuche: EIN_ABEND, position: LEIPZIG });
    try {
        await gezeichnet(p);
        assert.equal(await gibtEs(p, '.start-naehe'), false);
        const titel = await p.$$eval('.page--home .section__title', hs => hs.map(h => h.textContent.trim()));
        assert.equal(titel[0], 'Von deinen Freunden');
    } finally { await ctx.close(); }
});
