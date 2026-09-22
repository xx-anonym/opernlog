// Push-Mitteilungen im Fenster "Profil bearbeiten".
//
// Einen echten Push-Dienst gibt es im Test nicht, und Chromium ohne Kopf kann
// sich bei keinem anmelden. Deshalb bekommt die Seite einen nachgebauten
// Browser: PushManager, Notification und die Registrierung des Service
// Workers, alles mitschreibend. Geprüft wird, was die App daraus macht – und
// ob beim iPhone im Safari-Tab der Hinweis aufs Installieren erscheint statt
// eines Knopfs, der nichts bewirken kann.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { starteServer, ladePlaywright, starteBrowser, ersetzeSupabase } from './umgebung.js';

const HANDY = { width: 390, height: 900 };
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7 Mobile/15E148 Safari/604.1';

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
 * Ersetzt Push im Browser. push: false nimmt PushManager und Notification
 * ganz weg – so sieht Safari im Tab auf dem iPhone aus.
 */
function pushNachbau({ push = true, erlaubnis = 'default', antwort = 'granted', schonAbonniert = false }) {
    window.__pushLog = { abonniert: 0, abbestellt: 0, gefragt: 0 };
    const machAbo = () => ({
        options: { applicationServerKey: null },
        toJSON: () => ({ endpoint: 'https://web.push.apple.com/QTestgeraet', keys: { p256dh: 'P'.repeat(87), auth: 'A'.repeat(22) } }),
        unsubscribe: async () => { window.__pushLog.abbestellt++; aktuell = null; return true; },
    });
    let aktuell = schonAbonniert ? machAbo() : null;
    const pushManager = {
        getSubscription: async () => aktuell,
        subscribe: async (o) => {
            window.__pushLog.abonniert++;
            window.__pushLog.schluesselLaenge = new Uint8Array(o.applicationServerKey).length;
            aktuell = machAbo();
            aktuell.options.applicationServerKey = o.applicationServerKey;
            return aktuell;
        },
    };
    Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: { register: async () => ({ scope: '/' }), ready: Promise.resolve({ pushManager }), addEventListener() {} },
    });
    if (!push) {
        delete window.PushManager;
        delete window.Notification;
        return;
    }
    window.PushManager = function PushManager() {};
    window.Notification = {
        permission: erlaubnis,
        requestPermission: async () => { window.__pushLog.gefragt++; window.Notification.permission = antwort; return antwort; },
    };
}

async function starte({ nachbau = {}, userAgent, neuesKonto = false } = {}) {
    const ctx = await browser.newContext({ viewport: HANDY, ...(userAgent ? { userAgent } : {}) });
    await ctx.addInitScript(pushNachbau, nachbau);
    // Die Frage nach Mitteilungen bekommen nur neue Konten. Das Testprofil ist
    // von 2024; neuesKonto macht es zwei Tage alt.
    if (neuesKonto) await ctx.addInitScript(() => { window.__profilErstellt = new Date(Date.now() - 2 * 864e5).toISOString(); });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await p.waitForSelector('#splash', { state: 'detached' }).catch(() => {});
    return { ctx, p, fehler };
}

async function bearbeiten(p) {
    await p.evaluate(() => { window.location.hash = '#/profile'; });
    await p.waitForSelector('#editProfileBtn', { timeout: 15000 });
    await p.click('#editProfileBtn');
    await p.waitForSelector('#editProfileModal', { state: 'visible' });
    await p.waitForTimeout(400);
}

const stand = p => p.textContent('.mitteilungen__stand');

test('einschalten fragt, abonniert und legt das Abo ab', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await starte();
    try {
        await bearbeiten(p);
        assert.equal(await p.isVisible('#editProfileModal .mitteilungen'), true);
        assert.match(await stand(p), /ausgeschaltet/);

        await p.click('#mitteilungenAnBtn');
        await p.waitForSelector('#mitteilungenAusBtn');
        const log = await p.evaluate(() => window.__pushLog);
        assert.equal(log.gefragt, 1);
        assert.equal(log.abonniert, 1);
        assert.equal(log.schluesselLaenge, 65, 'mit dem VAPID-Schlüssel des Servers abonniert');

        const abos = await p.evaluate(() => window.__pushAbos);
        assert.equal(abos.length, 1);
        assert.equal(abos[0].p_endpoint, 'https://web.push.apple.com/QTestgeraet');
        assert.equal(abos[0].p_p256dh.length, 87);
        assert.match(await stand(p), /eingeschaltet/);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('die Probe geht raus – höchstens eine pro Minute', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await starte({ nachbau: { erlaubnis: 'granted', schonAbonniert: true } });
    try {
        await p.evaluate(() => { window.__pushProben = [true, false]; });
        await bearbeiten(p);
        await p.waitForSelector('#mitteilungenProbeBtn');
        await p.click('#mitteilungenProbeBtn');
        await p.waitForTimeout(200);
        assert.match(await stand(p), /unterwegs/);
        await p.click('#mitteilungenProbeBtn');
        await p.waitForTimeout(200);
        assert.match(await stand(p), /In einer Minute/);
        assert.equal(await p.evaluate(() => window.__pushProbeGerufen), 2);
    } finally { await ctx.close(); }
});

test('ist das Gerät schon abonniert, steht es auf an und wird neu abgelegt', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await starte({ nachbau: { erlaubnis: 'granted', schonAbonniert: true } });
    try {
        await bearbeiten(p);
        await p.waitForSelector('#mitteilungenAusBtn');
        assert.equal((await p.evaluate(() => window.__pushAbos)).length, 1);
        assert.equal(await p.evaluate(() => window.__pushLog.gefragt), 0, 'ohne Grund nach Erlaubnis gefragt');
    } finally { await ctx.close(); }
});

test('ausschalten entfernt das Abo in Datenbank und Browser', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await starte({ nachbau: { erlaubnis: 'granted', schonAbonniert: true } });
    try {
        await bearbeiten(p);
        await p.waitForSelector('#mitteilungenAusBtn');
        await p.click('#mitteilungenAusBtn');
        await p.waitForSelector('#mitteilungenAnBtn');
        assert.deepEqual(await p.evaluate(() => window.__pushGeloescht), ['https://web.push.apple.com/QTestgeraet']);
        assert.equal(await p.evaluate(() => window.__pushLog.abbestellt), 1);
    } finally { await ctx.close(); }
});

test('auf dem iPhone im Safari-Tab steht der Hinweis aufs Installieren', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await starte({ nachbau: { push: false }, userAgent: IPHONE });
    try {
        await bearbeiten(p);
        assert.equal(await p.isVisible('.mitteilungen'), true);
        assert.match(await stand(p), /Home-Bildschirm/);
        assert.equal(await p.locator('.mitteilungen button').count(), 0, 'ein Knopf, der dort nichts bewirken kann');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('ohne Push und ohne iPhone gibt es den Bereich nicht', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await starte({ nachbau: { push: false } });
    try {
        await bearbeiten(p);
        assert.equal(await p.locator('.mitteilungen').count(), 0);
        assert.equal(await p.locator('.passkeys').count(), 1, 'der Rest des Fensters fehlt');
    } finally { await ctx.close(); }
});

test('in den Einstellungen blockiert: Hinweis statt Knopf', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await starte({ nachbau: { erlaubnis: 'denied' } });
    try {
        await bearbeiten(p);
        assert.match(await stand(p), /Einstellungen/);
        assert.equal(await p.locator('.mitteilungen button').count(), 0);
    } finally { await ctx.close(); }
});

test('wer die Frage ablehnt, bekommt kein Abo', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await starte({ nachbau: { antwort: 'denied' } });
    try {
        await bearbeiten(p);
        await p.click('#mitteilungenAnBtn');
        await p.waitForTimeout(300);
        assert.equal(await p.evaluate(() => window.__pushLog.abonniert), 0);
        assert.deepEqual(await p.evaluate(() => window.__pushAbos), []);
        assert.match(await stand(p), /Einstellungen/);
    } finally { await ctx.close(); }
});

test('scheitert das Ablegen, steht ein Fehler da und der Knopf geht wieder', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await starte();
    try {
        await p.evaluate(() => { window.__pushSpeichernFehler = 'Netz weg'; });
        await bearbeiten(p);
        await p.click('#mitteilungenAnBtn');
        await p.waitForSelector('.mitteilungen__fehler:not([hidden])');
        assert.match(await p.textContent('.mitteilungen__fehler'), /nicht einschalten/);
        assert.equal(await p.isDisabled('#mitteilungenAnBtn'), false);
    } finally { await ctx.close(); }
});

test('beim Abmelden verschwindet das Abo – vor dem Abmelden', { skip: fehltPlaywright }, async () => {
    // Danach gilt die Sitzung nicht mehr, und die Datenbank nähme das
    // Entfernen nicht mehr an.
    const { ctx, p } = await starte({ nachbau: { erlaubnis: 'granted', schonAbonniert: true } });
    try {
        await p.evaluate(() => import('/src/store/store.js').then(m => m.store.logout()));
        assert.deepEqual(await p.evaluate(() => window.__ablauf), ['push_abo_loeschen', 'signOut']);
        assert.equal(await p.evaluate(() => window.__pushLog.abbestellt), 1);
    } finally { await ctx.close(); }
});

// ── Die Frage beim ersten Anmelden ────────────────────────────────────────

const frage = '.mitteilungen-frage';

test('ein neues Konto wird beim ersten Start gefragt', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await starte({ neuesKonto: true });
    try {
        await p.waitForSelector(frage, { timeout: 5000 });
        assert.match(await p.textContent(frage), /Mitteilungen einschalten\?/);
        assert.match(await p.textContent(frage), /Saisonrückblick/);
        // Die Erlaubnisfrage des Systems kommt erst nach dem Tippen.
        assert.equal(await p.evaluate(() => window.__pushLog.gefragt), 0);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('"Mitteilungen einschalten" fragt das System und legt das Abo ab', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await starte({ neuesKonto: true });
    try {
        await p.waitForSelector(frage);
        await p.click('#mitteilungenFrageJa');
        await p.waitForSelector(frage, { state: 'detached' });
        assert.equal(await p.evaluate(() => window.__pushLog.gefragt), 1);
        assert.equal((await p.evaluate(() => window.__pushAbos)).length, 1);
    } finally { await ctx.close(); }
});

test('"Später" schließt, und das Gerät fragt nicht wieder', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await starte({ neuesKonto: true });
    try {
        await p.waitForSelector(frage);
        await p.click('#mitteilungenFrageSpaeter');
        await p.waitForSelector(frage, { state: 'detached' });
        assert.equal(await p.evaluate(() => window.__pushLog.gefragt), 0, 'trotz "Später" nach Erlaubnis gefragt');

        await p.evaluate(() => { location.hash = '#/diary'; });
        await p.waitForTimeout(600);
        assert.equal(await p.locator(frage).count(), 0, 'beim nächsten Seitenwechsel wieder gefragt');

        await p.reload();
        await p.waitForFunction(() => !!window.supabase);
        await p.waitForTimeout(1500);
        assert.equal(await p.locator(frage).count(), 0, 'nach dem Neuladen wieder gefragt');
    } finally { await ctx.close(); }
});

test('wer abgelehnt hat, wird auch nicht wieder gefragt', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await starte({ neuesKonto: true, nachbau: { antwort: 'denied' } });
    try {
        await p.waitForSelector(frage);
        await p.click('#mitteilungenFrageJa');
        await p.waitForSelector(frage, { state: 'detached' });
        assert.equal(await p.evaluate(() => localStorage.getItem('opernlog:mitteilungenGefragt') !== null), true);
    } finally { await ctx.close(); }
});

test('ein altes Konto wird nicht gefragt', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await starte();
    try {
        await p.waitForTimeout(1500);
        assert.equal(await p.locator(frage).count(), 0);
    } finally { await ctx.close(); }
});

test('wer schon eingeschaltet hat, wird nicht gefragt', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await starte({ neuesKonto: true, nachbau: { erlaubnis: 'granted', schonAbonniert: true } });
    try {
        await p.waitForTimeout(1500);
        assert.equal(await p.locator(frage).count(), 0);
    } finally { await ctx.close(); }
});

test('auf dem iPhone im Safari-Tab keine Frage – dort steht der Hinweis', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await starte({ neuesKonto: true, nachbau: { push: false }, userAgent: IPHONE });
    try {
        await p.waitForTimeout(1500);
        assert.equal(await p.locator(frage).count(), 0);
        assert.equal(await p.isVisible('.installhinweis'), true);
    } finally { await ctx.close(); }
});
