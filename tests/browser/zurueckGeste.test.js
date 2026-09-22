// Die Zurück-Geste bei offenem Fenster.
//
// Auf Android schließt man Dialoge mit "Zurück". Vorher verließ die Geste die
// ganze Seite, und was im Fenster stand, war weg. Jetzt schließt sie das
// oberste Fenster; erst das nächste "Zurück" verlässt die Seite.
//
// Mindestens so wichtig ist, was NICHT passieren darf: ein Fenster, das per
// Knopf geschlossen wurde, darf keinen toten Schritt im Verlauf hinterlassen,
// und wer aus einem Fenster heraus auf eine andere Seite wechselt, darf nicht
// gleich wieder zurückgeworfen werden.
//
// page.goBack() tut dasselbe wie die Geste: einen Schritt im Verlauf zurück.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { starteServer, ladePlaywright, starteBrowser, ersetzeSupabase } from './umgebung.js';

const HANDY = { width: 390, height: 844 };
const ICH = '11111111-1111-1111-1111-111111111111';

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

const BESUCHE = [
    { id: 'a', userId: ICH, operaId: 'tosca', houseId: 'semperoper', date: '2026-05-01', rating: 4 },
    { id: 'b', userId: ICH, operaId: 'carmen', houseId: 'semperoper', date: '2026-06-01', rating: 5 },
];

/** Erst die Häuser, dann das Profil – damit es einen Schritt zurück gibt. */
async function starte() {
    const ctx = await browser.newContext({ viewport: HANDY });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await p.waitForSelector('#splash', { state: 'detached' }).catch(() => {});
    await p.evaluate(v => import('/src/store/store.js').then(m => { m.store.data.myVisits = v; }), BESUCHE);
    await p.evaluate(() => { location.hash = '#/houses'; });
    await p.waitForTimeout(300);
    await p.evaluate(() => { location.hash = '#/profile'; });
    await p.waitForSelector('#editProfileBtn', { timeout: 15000 });
    await p.waitForTimeout(300);
    return { ctx, p, fehler };
}

const hash = p => p.evaluate(() => location.hash);
const offen = (p, sel) => p.evaluate(s => {
    const el = document.querySelector(s);
    return !!el && el.isConnected && getComputedStyle(el).display !== 'none';
}, sel);

async function zurueck(p) {
    await p.goBack({ waitUntil: 'commit' }).catch(() => {});
    await p.waitForTimeout(400);
}

async function bearbeitenOeffnen(p) {
    await p.click('#editProfileBtn');
    await p.waitForSelector('#editProfileModal', { state: 'visible' });
    await p.waitForTimeout(200);
}

test('Zurück schließt das Fenster und bleibt auf der Seite', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await starte();
    try {
        await bearbeitenOeffnen(p);
        await p.fill('#editBio', 'Halb getippt');

        await zurueck(p);
        assert.equal(await offen(p, '#editProfileModal'), false, 'das Fenster ist noch offen');
        assert.equal(await hash(p), '#/profile', 'Zurück hat die Seite verlassen');
        // Die Seite wurde nicht neu gezeichnet – das Getippte steht noch im Feld.
        assert.equal(await p.inputValue('#editBio'), 'Halb getippt');

        await zurueck(p);
        assert.equal(await hash(p), '#/houses', 'das zweite Zurück führt nicht zur vorigen Seite');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('nach Abbrechen gibt es keinen toten Schritt im Verlauf', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await starte();
    try {
        await bearbeitenOeffnen(p);
        await p.click('#closeModalBtn');
        await p.waitForTimeout(400);
        assert.equal(await offen(p, '#editProfileModal'), false);

        await zurueck(p);
        assert.equal(await hash(p), '#/houses', 'nach Abbrechen musste man zweimal zurück');
    } finally { await ctx.close(); }
});

test('auch ein Klick neben das Fenster hinterlässt keinen', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await starte();
    try {
        await bearbeitenOeffnen(p);
        await p.mouse.click(5, 830);
        await p.waitForTimeout(400);
        assert.equal(await offen(p, '#editProfileModal'), false);
        await zurueck(p);
        assert.equal(await hash(p), '#/houses');
    } finally { await ctx.close(); }
});

test('bei zwei Fenstern übereinander schließt Zurück nur das obere', { skip: fehltPlaywright }, async () => {
    // "Konto löschen" öffnet sich über "Profil bearbeiten".
    const { ctx, p } = await starte();
    try {
        await bearbeitenOeffnen(p);
        await p.click('#deleteAccountBtn');
        await p.waitForSelector('#klkName');
        await p.waitForTimeout(200);

        await zurueck(p);
        assert.equal(await p.locator('#klkName').count(), 0, '"Konto löschen" ist noch offen');
        assert.equal(await offen(p, '#editProfileModal'), true, '"Profil bearbeiten" wurde mit geschlossen');
        assert.equal(await hash(p), '#/profile');

        await zurueck(p);
        assert.equal(await offen(p, '#editProfileModal'), false);
        assert.equal(await hash(p), '#/profile');

        await zurueck(p);
        assert.equal(await hash(p), '#/houses');
    } finally { await ctx.close(); }
});

test('wer aus einem Fenster auf eine andere Seite wechselt, bleibt dort', { skip: fehltPlaywright }, async () => {
    // Die Zeilen im Listenfenster sind Links. Der Klick schließt das Fenster
    // und wechselt die Seite im selben Zug – ein Zurück für das Fenster würde
    // die neue Seite sofort wieder verlassen.
    const { ctx, p } = await starte();
    try {
        await p.click('#seenOperasCard');
        await p.waitForSelector('.modal--active .listmodal__row');
        const ziel = await p.getAttribute('.modal--active .listmodal__row', 'href');
        await p.click('.modal--active .listmodal__row');
        await p.waitForTimeout(800);
        assert.equal(await hash(p), ziel, 'die neue Seite wurde gleich wieder verlassen');
        assert.equal(await p.locator('.modal--active').count(), 0);

        // Zurück führt aufs Profil, ohne zweimal tippen zu müssen …
        await zurueck(p);
        assert.equal(await hash(p), '#/profile');
        // … und von dort weiter zu den Häusern.
        await zurueck(p);
        assert.equal(await hash(p), '#/houses');
    } finally { await ctx.close(); }
});

test('ohne offenes Fenster ist Zurück wie immer', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await starte();
    try {
        await zurueck(p);
        assert.equal(await hash(p), '#/houses');
    } finally { await ctx.close(); }
});
