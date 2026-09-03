// Ohne Netz muss die App etwas zeigen.
//
// Vorher tat sie das nicht: nach dem Vorhang blieb ein grauer Bildschirm. Zwei
// Ursachen, beide hier festgehalten –
//
//   1. Die Supabase-Bibliothek kam von cdn.jsdelivr.net. Der Service Worker
//      überspringt fremde Hosts, sie lag also in keinem Cache; ohne Netz war
//      window.supabase undefined und der Start warf.
//   2. Der Start wartete den Abgleich mit der Cloud ab, bevor er überhaupt
//      etwas zeichnete. Ohne Netz laufen dabei mehrere Abfragen samt
//      Wiederholungen ins Leere.
//
// Der Ablauf hier ist der echte: einmal online öffnen, damit sich der Service
// Worker einrichtet, dann Flugmodus, dann neu laden. Alles muss aus dem Cache
// kommen – das prüft nebenbei, ob die Liste im Service Worker vollständig ist.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { starteServer, ladePlaywright, starteBrowser } from './umgebung.js';

const pw = await ladePlaywright();
const fehltPlaywright = pw ? false : 'Playwright ist nicht installiert';

const REF = 'gqdblqymteclmdlushox';          // aus src/config.js
const UID = '11111111-1111-1111-1111-111111111111';

/** Eine gespeicherte Sitzung, wie supabase-js sie ablegt. */
function sitzung() {
    const ablauf = Math.floor(Date.now() / 1000) + 3600;
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({
        sub: UID, aud: 'authenticated', role: 'authenticated', exp: ablauf,
        iat: Math.floor(Date.now() / 1000),
    })}.unsigniert`;
    return {
        access_token: jwt, refresh_token: 'r-1', token_type: 'bearer',
        expires_in: 3600, expires_at: ablauf,
        user: {
            id: UID, aud: 'authenticated', role: 'authenticated', email: 'test@opernlog.test',
            app_metadata: {}, user_metadata: {}, created_at: '2024-01-01T00:00:00Z',
        },
    };
}

// So sieht der lokale Zwischenspeicher nach einem gelungenen Abgleich aus.
const LOKAL = {
    version: 3,
    currentUser: { id: UID, name: 'Testnutzer', avatar: 'TN', avatarIcon: '', bio: '', joined: '2024-01-01' },
    friends: [], follows: [], myLists: [], seenOperas: [],
    myVisits: [
        { id: 'v1', userId: UID, operaId: 'la-traviata', houseId: 'semperoper', date: '2026-01-04', rating: 5, likes: 0, likedBy: [], comments: [] },
        { id: 'v2', userId: UID, operaId: 'tristan', houseId: 'bayerische-staatsoper', date: '2026-02-11', rating: 4, likes: 0, likedBy: [], comments: [] },
    ],
};

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
 * Öffnet die App einmal online, wartet den Service Worker ab und schaltet dann
 * das Netz ab. Gibt die Seite im Flugmodus zurück.
 */
async function imFlugmodus(hash = '#/diary') {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));

    // Es gibt hier kein echtes Supabase-Projekt und keine Bilder – beides
    // abweisen, damit der erste Aufruf nicht daran hängt.
    for (const muster of ['**://*.supabase.co/**', '**://upload.wikimedia.org/**', '**://fonts.googleapis.com/**']) {
        await p.route(muster, r => r.abort());
    }

    // Vor den Skripten der Seite: der Store liest localStorage beim Laden des
    // Moduls und schreibt seinen Stand später zurück.
    await p.addInitScript(({ ref, s, l }) => {
        if (!localStorage.getItem(`sb-${ref}-auth-token`)) localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify(s));
        if (!localStorage.getItem('opernlog_data')) localStorage.setItem('opernlog_data', JSON.stringify(l));
    }, { ref: REF, s: sitzung(), l: LOKAL });

    await p.goto(`${server.url}/index.html`);
    await p.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.active,
        null, { timeout: 30000 });
    await p.waitForTimeout(2500);   // dem Cache Zeit zum Füllen geben

    await ctx.setOffline(true);
    await p.goto(`${server.url}/index.html${hash}`);
    await p.waitForSelector('.main-nav', { timeout: 20000 });
    await p.waitForTimeout(1500);

    return { ctx, p, fehler };
}

test('der Service Worker hat die App-Dateien im Cache', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await imFlugmodus();
    try {
        const anzahl = await p.evaluate(async () => {
            const namen = await caches.keys();
            const c = await caches.open(namen.find(n => n.startsWith('opernlog-v')));
            return (await c.keys()).length;
        });
        assert.ok(anzahl > 40, `nur ${anzahl} Dateien im Cache`);
    } finally { await ctx.close(); }
});

test('ohne Netz kommt die App hoch statt eines grauen Bildschirms', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await imFlugmodus();
    try {
        assert.equal(await p.evaluate(() => navigator.onLine), false, 'der Test muss wirklich offline sein');
        assert.ok(await p.$('.main-nav'), 'keine Navigation – die App ist gar nicht gestartet');
        const text = await p.evaluate(() => document.querySelector('main')?.innerText || '');
        assert.ok(text.trim().length > 0, 'leerer Inhalt');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('ohne Netz steht das eigene Tagebuch da, nicht die Anmeldemaske', { skip: fehltPlaywright }, async () => {
    // Supabase kann die Sitzung ohne Netz nicht bestätigen und meldet "keine
    // Sitzung". Das darf nicht als Abmeldung durchgehen: die Daten liegen
    // vollständig lokal.
    const { ctx, p } = await imFlugmodus('#/diary');
    try {
        assert.equal(await p.$('.auth-page'), null, 'Anmeldemaske trotz angemeldetem Nutzer');
        const text = await p.evaluate(() => document.querySelector('main').innerText);
        assert.match(text, /2 Besuche/);
        assert.match(text, /Tristan/);
    } finally { await ctx.close(); }
});

test('ohne Netz ist der Katalog vollständig da', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await imFlugmodus('#/operas');
    try {
        const karten = await p.$$eval('.opera-card', k => k.length);
        assert.ok(karten > 50, `nur ${karten} Werke`);
    } finally { await ctx.close(); }
});

test('ohne Netz zeigt das Profil die eigenen Zahlen', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await imFlugmodus('#/profile/user-me');
    try {
        const text = await p.evaluate(() => document.querySelector('main').innerText);
        assert.match(text, /Testnutzer/);
        assert.match(text, /2\s*Besuche/);
        assert.deepEqual(fehler, [], 'das Profil stürzte hier an einem fehlenden myLists ab');
    } finally { await ctx.close(); }
});

test('ohne Netz sagt das Loggen klar, dass es Netz braucht', { skip: fehltPlaywright }, async () => {
    // Ein Formular, das beim Absenden scheitert, ist ärgerlicher als ein
    // Hinweis vorher – und die Anmeldemaske wäre schlicht falsch.
    const { ctx, p } = await imFlugmodus('#/log');
    try {
        assert.ok(await p.$('.offline-hinweis'), 'kein Hinweis auf das fehlende Netz');
        assert.equal(await p.$('.auth-page'), null);
        assert.equal(await p.$('#logForm, form'), null, 'das Formular wird ohne Netz nicht angeboten');
    } finally { await ctx.close(); }
});
