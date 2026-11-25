// Teilen am eigenen Abend (seit 18.11.2026): "Bild" – im Stil des
// Theaterzettels, dazu Text mit dem Direktlink opernlog.de/abend/<id> – und
// "Link" allein, für die Vorschau in Messengern. Nur am eigenen Abend, nie an
// fremden. Ohne Teilen-Menü landet der Text bzw. Link in der Zwischenablage.
// Dazu "Link teilen" im Saisonrückblick (opernlog.de/rueckblick/<nutzer>/<jahr>).

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

const UID = '11111111-1111-1111-1111-111111111111';
const FREMD = '22222222-2222-2222-2222-222222222222';
const MEIN_ABEND = 'aaaaaaaa-1111-4000-8000-000000000001';
const FREMDER_ABEND = 'bbbbbbbb-2222-4000-8000-000000000002';
const BESUCHE = [
    { id: MEIN_ABEND, user_id: UID, opera_id: 'tosca', house_id: 'semperoper', date: '2026-05-01', rating: 4,
        review: 'Ein Abend, der lange nachklingt.', conductor: 'Christian Thielemann' },
    { id: FREMDER_ABEND, user_id: FREMD, opera_id: 'aida', house_id: 'oper-leipzig', date: '2026-04-01', rating: 5 },
];

/**
 * @param {'teilen'|'ohne'} menue  'teilen': navigator.share nimmt Dateien an
 *   und merkt sich, was es bekam; 'ohne': kein Teilen-Menü.
 */
async function oeffne(hash, menue = 'teilen') {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: 'block' });
    if (menue === 'ohne') await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await p.addInitScript(([b, menue]) => {
        window.__besucheVorgabe = b;
        if (menue === 'teilen') {
            window.__geteilt = [];
            Object.defineProperty(navigator, 'canShare', { configurable: true, value: d => !!d?.files?.length });
            Object.defineProperty(navigator, 'share', {
                configurable: true,
                value: async (d) => {
                    const datei = d.files?.[0];
                    let groesse = null;
                    if (datei) {
                        const bild = await createImageBitmap(datei);
                        groesse = [bild.width, bild.height];
                    }
                    window.__geteilt.push({ titel: d.title, text: d.text, url: d.url ?? null, name: datei?.name, typ: datei?.type, groesse });
                },
            });
        } else {
            Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
            Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined });
        }
    }, [BESUCHE, menue]);
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html${hash}`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await vorhangAuf(p);
    return { ctx, p, fehler };
}

test('am eigenen Abend: "Bild" schickt ein Bild 1080 × 1920 und den Direktlink', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne(`#/visit/${MEIN_ABEND}`);
    try {
        const knopf = p.locator('.review-card__actions .abend-teilen');
        await knopf.waitFor({ timeout: 15000 });
        assert.equal((await knopf.innerText()).trim(), 'Teilen');
        await knopf.click();
        await p.waitForFunction(() => window.__geteilt.length === 1, null, { timeout: 15000 });
        const [g] = await p.evaluate(() => window.__geteilt);
        assert.equal(g.typ, 'image/png');
        assert.equal(g.name, 'opernlog-tosca-2026-05-01.png');
        assert.deepEqual(g.groesse, [1080, 1920]);
        assert.equal(g.titel, 'Tosca');
        // Der Link steht im Text, nicht im Feld url (siehe src/teilen.js).
        assert.equal(g.url, null);
        assert.match(g.text, /^Tosca von Giacomo Puccini$/m);
        assert.match(g.text, /Semperoper/);
        assert.match(g.text, /4 von 5 Sternen/);
        assert.ok(g.text.endsWith(`\nhttps://opernlog.de/abend/${MEIN_ABEND}`), g.text);
        // Der Klick bleibt auf der Seite des Abends.
        assert.equal(new URL(p.url()).hash, `#/visit/${MEIN_ABEND}`);
        assert.deepEqual(fehler, []);
    } finally {
        await ctx.close();
    }
});

test('an einem fremden Abend gibt es weder "Bild" noch "Link"', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne(`#/visit/${FREMDER_ABEND}`);
    try {
        await p.locator('.review-card__actions').waitFor({ timeout: 15000 });
        assert.equal(await p.locator('.abend-teilen, .abend-link, .abend-bearbeiten, .abend-loeschen').count(), 0);
        assert.deepEqual(fehler, []);
    } finally {
        await ctx.close();
    }
});

test('ohne Teilen-Menü: Text und Link in die Zwischenablage, mit Meldung', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne(`#/visit/${MEIN_ABEND}`, 'ohne');
    try {
        const knopf = p.locator('.abend-teilen');
        await knopf.waitFor({ timeout: 15000 });
        await knopf.click();
        await p.locator('.toast', { hasText: 'Text und Link kopiert' }).waitFor({ timeout: 10000 });
        const kopiert = await p.evaluate(() => navigator.clipboard.readText());
        assert.match(kopiert, /^Tosca von Giacomo Puccini\n/);
        assert.ok(kopiert.endsWith(`https://opernlog.de/abend/${MEIN_ABEND}`), kopiert);
        assert.deepEqual(fehler, []);
    } finally {
        await ctx.close();
    }
});

test('"Link" teilt nur den Direktlink, ohne Bild – für die Vorschau im Messenger', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne(`#/visit/${MEIN_ABEND}`);
    try {
        const knopf = p.locator('.review-card__actions .abend-link');
        await knopf.waitFor({ timeout: 15000 });
        assert.equal((await knopf.innerText()).trim(), 'Link');
        await knopf.click();
        await p.waitForFunction(() => window.__geteilt.length === 1, null, { timeout: 15000 });
        const [g] = await p.evaluate(() => window.__geteilt);
        assert.equal(g.url, `https://opernlog.de/abend/${MEIN_ABEND}`);
        assert.equal(g.name, undefined);
        assert.equal(g.titel, 'Tosca');
        assert.deepEqual(fehler, []);
    } finally {
        await ctx.close();
    }
});

test('"Link" ohne Teilen-Menü: der Link in der Zwischenablage', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne(`#/visit/${MEIN_ABEND}`, 'ohne');
    try {
        await p.locator('.abend-link').click({ timeout: 15000 });
        await p.locator('.toast', { hasText: 'Link kopiert' }).waitFor({ timeout: 10000 });
        assert.equal(await p.evaluate(() => navigator.clipboard.readText()), `https://opernlog.de/abend/${MEIN_ABEND}`);
        assert.deepEqual(fehler, []);
    } finally {
        await ctx.close();
    }
});

test('Saisonrückblick: "Link teilen" teilt opernlog.de/rueckblick/<nutzer>/<jahr>', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/season/2025');
    try {
        const knopf = p.locator('#linkBtn');
        await knopf.waitFor({ timeout: 15000 });
        await knopf.click();
        await p.waitForFunction(() => window.__geteilt.length === 1, null, { timeout: 15000 });
        const [g] = await p.evaluate(() => window.__geteilt);
        assert.equal(g.url, `https://opernlog.de/rueckblick/${UID}/2025`);
        assert.equal(g.titel, 'Meine Opernsaison 2025/26');
        // Auch das Teilen mit Bild nennt den Link.
        await p.click('#shareBtn');
        await p.waitForFunction(() => window.__geteilt.length === 2, null, { timeout: 15000 });
        const zweites = (await p.evaluate(() => window.__geteilt))[1];
        assert.ok(zweites.text.endsWith(`https://opernlog.de/rueckblick/${UID}/2025`), zweites.text);
        assert.deepEqual(fehler, []);
    } finally {
        await ctx.close();
    }
});

test('das Bild verträgt lange Titel und Reviews: nichts läuft in den Fuß', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/');
    try {
        // Geprüft wird über den Satz: liegt Text im unteren Streifen, wo
        // Instagram und WhatsApp Antwortfeld und Profilname zeigen?
        const unten = await p.evaluate(async () => {
            const { zeichneAbendbild } = await import('./src/components/Teilbild.js');
            const lang = {
                titel: 'Die Meistersinger von Nürnberg oder ein sehr langer Untertitel',
                komponist: 'Richard Wagner', haus: 'Bayerische Staatsoper im Nationaltheater', stadt: 'München',
                datum: '2026-07-31', sterne: 4.5, review: 'Sehr lang. '.repeat(200),
                dirigent: 'Vladimir Jurowski', regie: 'Barrie Kosky',
            };
            const ergebnis = [];
            for (const a of [lang, { titel: 'Tosca' }]) {
                const c = await zeichneAbendbild(a);
                const g = c.getContext('2d');
                // Zeile für Zeile: Tinte im Bereich 1600–1620 (unter dem Satz, über der Adresse)?
                const d = g.getImageData(120, 1600, 840, 20).data;
                let dunkel = 0;
                for (let i = 0; i < d.length; i += 4) if (d[i] < 120) dunkel++;
                ergebnis.push({ w: c.width, h: c.height, dunkel });
            }
            return ergebnis;
        });
        for (const u of unten) {
            assert.deepEqual([u.w, u.h], [1080, 1920]);
            assert.equal(u.dunkel, 0, 'Text reicht in den Fuß');
        }
        assert.deepEqual(fehler, []);
    } finally {
        await ctx.close();
    }
});

// Bearbeiten und Löschen gibt es seit 24.11.2026 auch hier, nicht nur im
// Tagebuch (Jonas).
test('am eigenen Abend: Bearbeiten öffnet das Formular, Löschen fragt und führt ins Tagebuch', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne(`#/visit/${MEIN_ABEND}`);
    try {
        await p.locator('.review-card__actions .abend-bearbeiten').click();
        await p.waitForFunction(id => location.hash === `#/log?edit=${id}`, MEIN_ABEND, { timeout: 5000 });
        await p.waitForSelector('#logForm');

        await p.evaluate(id => { location.hash = `#/visit/${id}`; }, MEIN_ABEND);
        const loeschen = p.locator('.review-card__actions .abend-loeschen');
        // Erst abgelehnt: nichts passiert.
        p.once('dialog', d => d.dismiss());
        await loeschen.click();
        await p.waitForTimeout(300);
        assert.equal(await p.evaluate(() => location.hash), `#/visit/${MEIN_ABEND}`);
        // Dann bestätigt: weg, und zurück ins Tagebuch.
        p.once('dialog', d => d.accept());
        await loeschen.click();
        await p.waitForFunction(() => location.hash === '#/diary', null, { timeout: 5000 });
        assert.equal(await p.evaluate(id => import('/src/store/store.js').then(m => m.store.getAllVisits().some(v => v.id === id)), MEIN_ABEND), false);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});
