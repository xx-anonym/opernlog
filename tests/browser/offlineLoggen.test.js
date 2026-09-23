// Loggen ohne Netz.
//
// Im Theater ist der Empfang oft schlecht. Vorher sperrte die App das Loggen
// ohne Netz ganz, und ein Speichern im Funkloch scheiterte. Jetzt wartet der
// Besuch auf dem Gerät ("ausstehend") und geht hoch, sobald Verbindung
// besteht. Die Kennung vergibt der Browser, damit ein wiederholter Versuch
// nicht doppelt anlegt.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { starteServer, ladePlaywright, starteBrowser, ersetzeSupabase } from './umgebung.js';

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

async function angemeldet() {
    const ctx = await browser.newContext({ viewport: HANDY });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html`);
    await p.waitForSelector('.main-content', { timeout: 15000 });
    // Bis der erste Abgleich durch ist: dann steht die eigene Kennung lokal.
    await p.waitForFunction(() => import('/src/store/store.js').then(m => m.store.isCloud && m.store.data.currentUser.id !== 'user-me'));
    return { ctx, p, fehler };
}

/** Das Formular ausfüllen (Haus und Werk über die Adresse) und abschicken. */
async function loggen(p) {
    await p.evaluate(() => { location.hash = '#/log?house=semperoper&opera=tosca'; });
    await p.waitForSelector('#logForm');
    await p.locator('#ratingWidget .star').nth(3).click();
    await p.click('#logForm button[type="submit"]');
    await p.waitForSelector('.toast');
    return p.locator('.toast').last().innerText();
}

const eigene = (p) => p.evaluate(() => import('/src/store/store.js').then(m =>
    m.store.data.myVisits.map(v => ({ id: v.id, ausstehend: !!v.ausstehend, fehler: v.uebertragungsfehler || null }))));

test('ohne Netz: das Formular ist da, der Besuch wartet auf dem Gerät', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await angemeldet();
    try {
        await ctx.setOffline(true);
        await p.evaluate(() => { location.hash = '#/log'; });
        await p.waitForSelector('#logForm');
        assert.equal(await p.locator('.offline-hinweis').count(), 0, 'statt des Formulars der Offline-Hinweis');
        assert.ok(await p.isVisible('.log-offline'), 'kein Hinweis, dass ohne Netz gespeichert wird');

        const meldung = await loggen(p);
        assert.match(meldung, /auf diesem Gerät gespeichert/i);
        const besuche = await eigene(p);
        assert.equal(besuche.length, 1);
        assert.equal(besuche[0].ausstehend, true);
        assert.match(besuche[0].id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, 'Kennung ist keine UUID');
        assert.equal((await p.evaluate(() => window.__besuchVersuche)).length, 0, 'ohne Netz nichts versucht');

        // Im Tagebuch steht er, mit Marke.
        await p.waitForTimeout(1000);
        await p.evaluate(() => { location.hash = '#/diary'; });
        await p.waitForSelector('.diary-entry');
        assert.match(await p.locator('.diary-entry').first().innerText(), /Wartet auf Netz/);

        // Netz wieder da: er geht hoch, mit derselben Kennung, und die Marke verschwindet.
        await ctx.setOffline(false);
        await p.waitForFunction(() => window.__besuchVersuche.length === 1);
        const versuch = (await p.evaluate(() => window.__besuchVersuche))[0];
        assert.equal(versuch.id, besuche[0].id);
        assert.equal(versuch.house_id, 'semperoper');
        await p.waitForFunction(() => import('/src/store/store.js').then(m => m.store.getAusstehendeBesuche().length === 0));
        await p.waitForTimeout(300);
        assert.doesNotMatch(await p.locator('.diary-entry').first().innerText(), /Wartet auf Netz/);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Netz gemeldet, aber nichts kommt durch: der Besuch wartet statt zu scheitern', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await angemeldet();
    try {
        await p.evaluate(() => { window.__besuchFehler = [{ message: 'TypeError: Failed to fetch' }]; });
        const meldung = await loggen(p);
        assert.match(meldung, /auf diesem Gerät gespeichert/i);
        assert.equal((await eigene(p))[0].ausstehend, true);

        // Der nächste Anlass (hier: Rückkehr in die App) schickt ihn hoch.
        await p.evaluate(() => { location.hash = '#/diary'; });
        await p.waitForSelector('.diary-entry');
        await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
        await p.waitForFunction(() => import('/src/store/store.js').then(m => m.store.getAusstehendeBesuche().length === 0));
        assert.equal((await p.evaluate(() => window.__besuchVersuche)).length, 2);
        assert.equal((await p.evaluate(() => window.__visits)).length, 1, 'doppelt angelegt');
    } finally { await ctx.close(); }
});

test('kam der erste Versuch doch an, legt der zweite nichts doppelt an', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await angemeldet();
    try {
        await ctx.setOffline(true);
        await loggen(p);
        const [besuch] = await eigene(p);
        // Die Datenbank hat ihn schon – etwa weil die Antwort im Funkloch verloren ging.
        await p.evaluate(id => { window.__visits.push({ id, user_id: 'x', opera_id: 'tosca', house_id: 'semperoper', date: '2026-09-01', rating: 4 }); }, besuch.id);
        await ctx.setOffline(false);
        await p.waitForFunction(() => import('/src/store/store.js').then(m => m.store.getAusstehendeBesuche().length === 0));
        assert.equal((await p.evaluate(() => window.__visits)).length, 1);
        assert.equal((await eigene(p)).filter(v => v.fehler).length, 0, 'als Fehler vermerkt');
    } finally { await ctx.close(); }
});

test('lehnt der Server ab, gibt es eine Fehlermeldung und keinen wartenden Besuch', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await angemeldet();
    try {
        await p.evaluate(() => { window.__besuchFehler = [{ code: '42501', message: 'new row violates row-level security policy' }]; });
        const meldung = await loggen(p);
        assert.match(meldung, /konnte nicht gespeichert werden/i);
        assert.equal((await eigene(p)).length, 0);
    } finally { await ctx.close(); }
});

test('ein wartender Besuch übersteht den Abgleich mit der Cloud', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await angemeldet();
    try {
        await ctx.setOffline(true);
        await loggen(p);
        // Abgleich bei weiter gestörtem Hochladen: die Liste aus der Cloud ist
        // leer, der wartende Besuch muss trotzdem bleiben.
        await p.evaluate(() => { window.__besuchFehler = [{ message: 'Failed to fetch' }, { message: 'Failed to fetch' }]; });
        await ctx.setOffline(false);
        await p.evaluate(() => import('/src/store/store.js').then(m => m.store.refreshSession()));
        const besuche = await eigene(p);
        assert.equal(besuche.length, 1);
        assert.equal(besuche[0].ausstehend, true);
    } finally { await ctx.close(); }
});

test('einen schon übertragenen Besuch ändern braucht Netz', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await angemeldet();
    try {
        await loggen(p);
        const [besuch] = await eigene(p);
        assert.equal(besuch.ausstehend, false);
        await ctx.setOffline(true);
        await p.evaluate(id => { location.hash = `#/log?edit=${id}`; }, besuch.id);
        await p.waitForSelector('.offline-hinweis');
        assert.match(await p.locator('.offline-hinweis').innerText(), /ändern geht nur mit Verbindung/);
    } finally { await ctx.close(); }
});

test('Abmelden mit wartenden Besuchen fragt nach', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await angemeldet();
    try {
        await ctx.setOffline(true);
        await loggen(p);
        // Hochladen scheitert weiter – der Besuch bleibt wartend. Vor dem
        // Wiederverbinden gesetzt: das online-Ereignis schickt sofort los.
        await p.evaluate(() => { window.__besuchFehler = Array(5).fill({ message: 'Failed to fetch' }); });
        await ctx.setOffline(false);
        await p.waitForTimeout(500);
        await p.evaluate(() => { location.hash = '#/profile/user-me'; });
        await p.waitForSelector('#logoutBtn');
        let frage = null;
        p.on('dialog', d => { frage = d.message(); d.dismiss(); });
        await p.click('#logoutBtn');
        await p.waitForTimeout(500);
        assert.match(frage || '', /noch nicht übertragen/);
        assert.equal(await p.evaluate(() => window.__abgemeldet), 0, 'trotz Nein abgemeldet');
    } finally { await ctx.close(); }
});
