// Ohne Netz öffnet sich jede nachgeladene Seite aus dem Cache.
//
// Seit main.js die meisten Seiten erst beim ersten Aufruf lädt (SEITEN_MODULE),
// hängt der Offline-Modus daran, dass der Service Worker sie vorher vollständig
// zwischengespeichert hat. offlineLoggen.test.js scheiterte unter Last immer
// wieder mit "Failed to fetch dynamically imported module: …/LogVisit.js".
// Die Ursache: der Test schaltete das Netz ab, während der Worker noch seine
// App-Shell lud. addAll scheiterte, und sw.js fing den Fehler ab – die
// Installation galt als gelungen, und ein Worker mit LEEREM Cache übernahm
// die Seite. Ohne Netz fand er LogVisit.js nirgends. Weil sw.js sich danach
// nicht ändert, richtete er sich auch beim nächsten Start nicht neu ein: die
// App blieb bis zur nächsten Version ohne Offline-Seiten.
//
// Nachgestellt wird das hier, ohne auf Last zu hoffen: der Server reißt die
// Verbindung für eine Datei der App-Shell ab, solange der Worker sie lädt.
// Abgeschaltet wird das Netz am Server (jede Anfrage bricht ab) und im
// Browser – so kann auch ein Worker, der neu aufwacht, nicht still doch noch
// das Netz erreichen.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { starteServer, ladePlaywright, starteBrowser, ersetzeSupabase, offlineBereit, WURZEL } from './umgebung.js';

const HANDY = { width: 390, height: 900 };

const pw = await ladePlaywright();
const fehltPlaywright = pw ? false : 'Playwright ist nicht installiert';

// Was der Server gerade tut: alles ausliefern, eine Datei abbrechen oder –
// "kein Netz" – jede Anfrage abbrechen.
let netz = { aus: false, sperre: null, abgebrochen: 0 };
const abbrechen = (pfad) => {
    const ja = netz.aus || pfad === netz.sperre;
    if (ja) netz.abgebrochen++;
    return ja;
};

let browser, server;

before(async () => {
    if (!pw) return;
    server = await starteServer({ abbrechen });
    browser = await starteBrowser(pw.chromium);
}, { timeout: 120000 });

after(async () => {
    await browser?.close();
    await server?.schliessen();
});

/** Die Pfade aus SEITEN_MODULE in src/main.js – so kommt jede neue Seite von selbst dazu. */
function seitenPfade() {
    const main = fs.readFileSync(path.join(WURZEL, 'src/main.js'), 'utf8');
    const anfang = main.indexOf('const SEITEN_MODULE = {');
    assert.notEqual(anfang, -1, 'SEITEN_MODULE nicht in src/main.js gefunden');
    const block = main.slice(anfang, main.indexOf('};', anfang));
    const pfade = [...block.matchAll(/(\w+):\s*\[/g)].map(m => m[1]);
    assert.ok(pfade.length > 10, `nur ${pfade.length} Pfade in SEITEN_MODULE erkannt`);
    return pfade;
}

// Seiten, die einen Teil hinter dem Pfad brauchen. Ob es den Eintrag gibt,
// ist gleich: geprüft wird, dass die Seite lädt, nicht was sie findet.
const ZUSATZ = {
    house: 'semperoper', opera: 'tosca', composer: 'alban-berg', person: 'Anna%20Netrebko',
    visit: 'unbekannt', list: 'unbekannt', profile: 'user-me', invite: 'unbekannt',
};

async function angemeldet() {
    netz = { aus: false, sperre: null, abgebrochen: 0 };
    const ctx = await browser.newContext({ viewport: HANDY });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    // main.js meldet ein gescheitertes Nachladen mit console.error('[Seite laden]', …).
    await p.addInitScript(() => {
        window.__ladefehler = [];
        const echt = console.error;
        console.error = (...a) => {
            if (a[0] === '[Seite laden]') window.__ladefehler.push(a.map(String).join(' '));
            echt.apply(console, a);
        };
    });
    await ersetzeSupabase(p);
    return { ctx, p, fehler };
}

async function starten(p) {
    await p.goto(`${server.url}/index.html`);
    await p.waitForSelector('.main-content', { timeout: 15000 });
    await p.waitForFunction(() => import('/src/store/store.js').then(m => m.store.isCloud && m.store.data.currentUser.id !== 'user-me'));
}

async function netzAus(ctx) {
    netz.aus = true;
    await ctx.setOffline(true);
}

/**
 * Zur Seite gehen und abwarten, bis sie steht oder das Nachladen gescheitert
 * ist. Gibt den Fehler zurück, sonst null.
 */
async function oeffne(p, hash) {
    await p.evaluate((h) => {
        window.__ladefehler.length = 0;
        document.querySelector('.main-content').firstElementChild?.setAttribute('data-alt', '');
        location.hash = h;
    }, hash);
    await p.waitForFunction(() => {
        const neu = document.querySelector('.main-content').firstElementChild;
        return window.__ladefehler.length > 0 || (neu && !neu.hasAttribute('data-alt'));
    }, null, { timeout: 20000 });
    return p.evaluate(() => window.__ladefehler[0] || null);
}

test('bricht das Netz ab, während der Worker die App lädt, übernimmt kein Worker mit leerem Cache', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await angemeldet();
    try {
        // LogVisit.js holt beim ersten Start nur der Worker (die Seite selbst
        // lädt sie erst beim Aufruf) – genau dieser Abruf geht verloren.
        netz.sperre = '/src/pages/LogVisit.js';
        await starten(p);
        await p.waitForFunction(() => navigator.serviceWorker.getRegistration()
            .then(r => !!r?.installing || !!r?.active), null, { timeout: 30000 });
        // Die Installation ist vorbei, wenn nichts mehr installiert wird.
        await p.waitForFunction(() => navigator.serviceWorker.getRegistration()
            .then(r => !r || (!r.installing && !r.waiting)), null, { timeout: 30000 });
        assert.ok(netz.abgebrochen > 0, 'der Worker hat LogVisit.js gar nicht angefragt');

        const stand = await p.evaluate(async () => {
            const r = await navigator.serviceWorker.getRegistration();
            return {
                aktiv: !!r?.active,
                steuert: !!navigator.serviceWorker.controller,
                imCache: !!(await caches.match(new URL('src/pages/LogVisit.js', location.href).href)),
            };
        });
        assert.equal(stand.aktiv, false,
            `ein Worker ist aktiv, obwohl seine App-Shell unvollständig ist (steuert: ${stand.steuert}, LogVisit.js im Cache: ${stand.imCache})`);

        // Der nächste Start, diesmal mit Netz, richtet ihn vollständig ein.
        netz.sperre = null;
        await starten(p);
        await offlineBereit(p);
        await netzAus(ctx);
        assert.equal(await oeffne(p, '#/log'), null, 'ohne Netz kein Formular');
        await p.waitForSelector('#logForm');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('sobald der Worker die Seite steuert, öffnet sich ohne Netz jede nachgeladene Seite', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await angemeldet();
    try {
        await starten(p);
        // Sofort abschalten, sobald der Worker steuert – das knappste Timing,
        // das ein Nutzer erwischen kann.
        await offlineBereit(p);
        await netzAus(ctx);
        // Unter Last oder nach einer Weile im Hintergrund beendet der Browser
        // den Worker. Ohne Netz muss er kalt aufwachen und aus dem Cache
        // liefern. (Erst nach setOffline: Playwright wartet sonst ewig auf den
        // angehaltenen Worker, um ihm das Netz abzustellen.)
        const cdp = await ctx.newCDPSession(p);
        await cdp.send('ServiceWorker.enable');
        await cdp.send('ServiceWorker.stopAllWorkers');

        const gescheitert = [];
        for (const pfad of seitenPfade()) {
            const hash = `#/${pfad}${ZUSATZ[pfad] ? `/${ZUSATZ[pfad]}` : ''}`;
            const f = await oeffne(p, hash);
            if (f) gescheitert.push(`${hash}: ${f}`);
        }
        assert.deepEqual(gescheitert, [], 'ohne Netz nicht geladen');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});
