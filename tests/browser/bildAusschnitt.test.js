// Der Admin wählt, welcher Teil eines Katalogbilds zu sehen ist.
//
// Wie beim Katalogformular: verbindlich ist die Regel in der Datenbank (nur
// Admins schreiben in bild_ausschnitte, siehe tests/checks/rls.test.js). Hier
// geht es darum, dass der Knopf nur Admins angeboten wird, dass Speichern,
// Abbrechen und "Mitte" tun, was sie sagen, und dass der Ausschnitt danach
// auch auf den Karten gilt.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { starteServer, ladePlaywright, starteBrowser, ersetzeSupabase } from './umgebung.js';

const RECHNER = { width: 1100, height: 900 };

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

/** Öffnet eine Seite, wahlweise als Admin und mit Ausschnitten in der "Datenbank". */
async function oeffne(seite, { admin = false, vorgabe = [], fehler: schreibFehler = null, bild = null } = {}) {
    // Mit Ersatzbild ohne Service Worker: der holt Bilder selbst und liefe an
    // context.route vorbei.
    const ctx = await browser.newContext({ viewport: RECHNER, ...(bild ? { serviceWorkers: 'block' } : {}) });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    if (bild) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${bild.w}" height="${bild.h}"><rect width="100%" height="100%" fill="#446"/></svg>`;
        await ctx.route('https://upload.wikimedia.org/**', r => r.fulfill({ status: 200, contentType: 'image/svg+xml', body: svg }));
    }

    await ersetzeSupabase(p);
    await p.addInitScript((v) => { window.__ausschnitteVorgabe = v; }, vorgabe);
    await p.goto(`${server.url}/index.html`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await p.evaluate(({ a, f }) => { window.__istAdmin = a; window.__ausschnittFehler = f; }, { a: admin, f: schreibFehler });

    await p.evaluate(s => { window.location.hash = s; }, seite);
    await p.waitForSelector('.detail-hero, .opera-card', { timeout: 15000 });
    await p.waitForTimeout(700);   // istAdmin() kommt zurück
    return { ctx, p, fehler };
}

// Der Knopf wartet auf die Maße des Bildes, bevor die Auswahl aufgeht.
async function auswahlOeffnen(p) {
    await p.click('.bild-ausschnitt__knopf');
    await p.waitForSelector('.bild-ausschnitt__leiste');
}

// Der Kopf hat drei Hintergrundebenen (Abdunklung, Bild, Verlauf), und
// getComputedStyle nennt die Position je Ebene. Alle drei sind gleich.
const position = (p, sel) => p.$eval(sel, el => getComputedStyle(el).backgroundPosition.split(',')[0].trim());

test('wer kein Admin ist, bekommt keinen Knopf für den Bildausschnitt', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await oeffne('#/opera/tosca', { admin: false });
    try {
        assert.equal(await p.locator('.bild-ausschnitt__knopf').count(), 0);
    } finally { await ctx.close(); }
});

test('Admin verschiebt den Ausschnitt mit den Pfeiltasten und speichert – auch die Karte zeigt ihn', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/opera/tosca', { admin: true });
    try {
        assert.equal(await position(p, '.detail-hero'), '50% 50%');
        await auswahlOeffnen(p);
        for (let i = 0; i < 5; i++) await p.keyboard.press('ArrowRight');
        await p.keyboard.press('Shift+ArrowUp');
        assert.equal(await position(p, '.detail-hero'), '60% 40%');
        await p.click('.bild-ausschnitt__leiste [data-aktion="speichern"]');
        await p.waitForSelector('.bild-ausschnitt__leiste', { state: 'detached' });

        const geschrieben = await p.evaluate(() => window.__ausschnittSchreiben);
        assert.deepEqual(geschrieben, [{ op: 'upsert', art: 'werk', id: 'tosca', x: 60, y: 40 }]);
        assert.equal(await position(p, '.detail-hero'), '60% 40%');
        assert.equal(await p.locator('.bild-ausschnitt__knopf').isVisible(), true, 'der Knopf kommt zurück');

        await p.evaluate(() => { window.location.hash = '#/operas'; });
        await p.waitForSelector('a.opera-card[href="#/opera/tosca"]');
        assert.equal(await position(p, 'a.opera-card[href="#/opera/tosca"] .opera-card__color'), '60% 40%');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Ziehen mit der Maus verschiebt das Bild in die Gegenrichtung des Ausschnitts', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    // Ein Querformat im breiten Kopf steht nur oben und unten über – nach
    // der Seite gibt es nichts zu verschieben, also senkrecht ziehen.
    // Das Bild ist hier ein Ersatz im Querformat, damit der Test nicht vom
    // Netz und vom echten Foto abhängt.
    const { ctx, p } = await oeffne('#/house/semperoper', { admin: true, bild: { w: 600, h: 400 } });
    try {
        await auswahlOeffnen(p);
        const r = await p.$eval('.detail-hero', el => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
        const start = { x: r.x + r.w / 2, y: r.y + r.h * 0.75 };
        await p.mouse.move(start.x, start.y);
        await p.mouse.down();
        await p.mouse.move(start.x - 80, start.y - 60, { steps: 5 });
        await p.mouse.up();
        const [x, y] = (await position(p, '.detail-hero')).split(' ').map(parseFloat);
        // Nach oben gezogen: das Bild wandert nach oben, zu sehen ist mehr
        // von seinem unteren Teil – y steigt. Seitlich steht nichts über.
        assert.ok(y > 50, `y = ${y}`);
        assert.equal(x, 50);
        await p.click('.bild-ausschnitt__leiste [data-aktion="speichern"]');
        await p.waitForSelector('.bild-ausschnitt__leiste', { state: 'detached' });
        const [w] = await p.evaluate(() => window.__ausschnittSchreiben);
        assert.equal(w.art, 'haus');
        assert.equal(w.id, 'semperoper');
        assert.ok(w.y > 50);
    } finally { await ctx.close(); }
});

test('Abbrechen lässt alles, wie es war – nichts wird geschrieben', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await oeffne('#/opera/tosca', { admin: true, vorgabe: [{ art: 'werk', id: 'tosca', x: 20, y: 30 }] });
    try {
        assert.equal(await position(p, '.detail-hero'), '20% 30%', 'der Ausschnitt aus der Datenbank gilt beim Start');
        await auswahlOeffnen(p);
        await p.keyboard.press('Shift+ArrowRight');
        assert.equal(await position(p, '.detail-hero'), '30% 30%');
        await p.click('.bild-ausschnitt__leiste [data-aktion="abbrechen"]');
        assert.equal(await position(p, '.detail-hero'), '20% 30%');
        assert.deepEqual(await p.evaluate(() => window.__ausschnittSchreiben), []);
    } finally { await ctx.close(); }
});

test('"Mitte" und Speichern löscht den Ausschnitt statt 50/50 zu speichern', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await oeffne('#/opera/tosca', { admin: true, vorgabe: [{ art: 'werk', id: 'tosca', x: 20, y: 30 }] });
    try {
        await auswahlOeffnen(p);
        await p.click('.bild-ausschnitt__leiste [data-aktion="mitte"]');
        await p.click('.bild-ausschnitt__leiste [data-aktion="speichern"]');
        await p.waitForSelector('.bild-ausschnitt__leiste', { state: 'detached' });
        assert.deepEqual(await p.evaluate(() => window.__ausschnittSchreiben), [{ op: 'delete', art: 'werk', id: 'tosca' }]);
        assert.equal(await position(p, '.detail-hero'), '50% 50%');
    } finally { await ctx.close(); }
});

test('scheitert das Speichern, bleibt die Auswahl offen und es kommt eine Meldung', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await oeffne('#/opera/tosca', { admin: true, fehler: 'new row violates row-level security policy' });
    try {
        await auswahlOeffnen(p);
        await p.keyboard.press('Shift+ArrowDown');
        await p.click('.bild-ausschnitt__leiste [data-aktion="speichern"]');
        await p.waitForSelector('.toast--error');
        assert.equal(await p.locator('.bild-ausschnitt__leiste').count(), 1, 'die Leiste bleibt');
        assert.equal(await position(p, '.detail-hero'), '50% 60%', 'die Auswahl bleibt stehen');
        assert.equal(await p.locator('.bild-ausschnitt__leiste [data-aktion="speichern"]').isEnabled(), true);
    } finally { await ctx.close(); }
});
