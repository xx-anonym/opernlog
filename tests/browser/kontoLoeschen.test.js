// Das eigene Konto löschen.
//
// Endgültig, ohne Sicherung. Die Tests hier prüfen vor allem, wann NICHT
// gelöscht wird – und dass die Reihenfolge stimmt: erst löschen, dann
// abmelden. Andersherum wäre die Sitzung weg, bevor der Aufruf durch ist, und
// ein Fehlschlag ließe den Nutzer ausgesperrt mit Konto zurück.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { starteServer, ladePlaywright, starteBrowser, ersetzeSupabase } from './umgebung.js';

const RECHNER = { width: 1000, height: 1000 };
const ICH = '11111111-1111-1111-1111-111111111111';
const NAME = 'Testnutzer';

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

async function oeffneProfil({ eigene = [], kontoFehler = null } = {}) {
    const ctx = await browser.newContext({ viewport: RECHNER });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));

    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await p.evaluate(f => {
        window.__kontoFehler = f;
        window.__kontoGeloescht = 0;
        window.__abgemeldet = 0;
    }, kontoFehler);
    if (eigene.length) {
        await p.evaluate(v => import('/src/store/store.js').then(m => { m.store.data.myVisits = v; }), eigene);
    }
    await p.evaluate(() => { window.location.hash = '#/profile'; });
    await p.waitForSelector('#deleteAccountBtn', { timeout: 15000 });
    await p.waitForTimeout(400);
    return { ctx, p, fehler };
}

const besuch = (id) => ({
    id, userId: ICH, operaId: 'tosca', houseId: 'semperoper', date: '2026-05-01', rating: 4,
});

test('der Schalter steht im eigenen Profil', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await oeffneProfil();
    try {
        assert.equal(await p.locator('#deleteAccountBtn').count(), 1);
        // Nicht in derselben Knopfleiste wie "Abmelden": wer sich abmeldet,
        // will wiederkommen; wer löscht, nicht. Strukturell geprüft, nicht
        // über den Abstand in Pixeln – der kommt beim langen Profil ohnehin
        // zustande und belegt deshalb nichts.
        const lage = await p.evaluate(() => {
            const l = document.querySelector('#deleteAccountBtn');
            return {
                inAktionsleiste: !!l.closest('.profile-actions'),
                inEigenemBereich: !!l.closest('.konto-loeschen'),
            };
        });
        assert.equal(lage.inAktionsleiste, false, 'steht in derselben Leiste wie Abmelden');
        assert.equal(lage.inEigenemBereich, true);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('das Modal zählt auf, was verloren geht', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffneProfil({ eigene: [besuch('a'), besuch('b'), besuch('c')] });
    try {
        await p.click('#deleteAccountBtn');
        await p.waitForSelector('#klkName');
        // Gezielt DAS Modal: das Profil hat schon eines zum Bearbeiten im
        // DOM, und .modal__content allein trifft dessen Inhalt.
        const text = await p.textContent('.modal__content:has(#klkName)');
        assert.match(text, /3 geloggte Abende/);
        assert.match(text, /endgültig/i);
        // Und was NICHT mitgeht.
        assert.match(text, /bleiben stehen/);
    } finally { await ctx.close(); }
});

test('erst der abgetippte Name öffnet den Knopf', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffneProfil();
    try {
        await p.click('#deleteAccountBtn');
        await p.waitForSelector('#klkName');
        assert.equal(await p.isDisabled('#klkLoeschen'), true);

        await p.fill('#klkName', 'testnutzer');
        assert.equal(await p.isDisabled('#klkLoeschen'), true, 'Kleinschreibung genügte');
        await p.fill('#klkName', NAME.slice(0, 4));
        assert.equal(await p.isDisabled('#klkLoeschen'), true, 'ein Teil genügte');

        await p.fill('#klkName', NAME);
        assert.equal(await p.isDisabled('#klkLoeschen'), false);
    } finally { await ctx.close(); }
});

test('Abbrechen löscht nichts', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffneProfil();
    try {
        await p.click('#deleteAccountBtn');
        await p.waitForSelector('#klkName');
        await p.fill('#klkName', NAME);
        await p.click('.close-modal');
        await p.waitForTimeout(300);

        assert.equal(await p.locator('#klkName').count(), 0, 'das Modal blieb offen');
        assert.equal(await p.evaluate(() => window.__kontoGeloescht), 0);
        assert.equal(await p.evaluate(() => window.__abgemeldet), 0);
    } finally { await ctx.close(); }
});

test('der ganze Weg: erst löschen, dann abmelden, dann weiter', { skip: fehltPlaywright }, async () => {
    // Hier wird das Modul direkt aufgerufen, nicht über den Knopf im Profil.
    // Der Erfolgsweg endet mit window.location.reload(), und die Eigenschaft
    // lässt sich im Browser nicht überschreiben – nach dem Neuladen wäre alles
    // weg, was dieser Test ablesen will. Dass der Knopf im Profil das Modal
    // mit den richtigen Zahlen öffnet, belegen die Tests darüber.
    const { ctx, p, fehler } = await oeffneProfil();
    try {
        const ablauf = await p.evaluate(async (name) => {
            const m = await import('/src/components/KontoLoeschen.js');
            const schritte = [];
            const modal = m.kontoLoeschModal(name, { abende: 1 }, {
                kontoLoeschen: async () => { schritte.push('geloescht'); },
                abmelden: async () => { schritte.push('abgemeldet'); },
                weiter: () => { schritte.push('weiter'); },
            });
            document.body.appendChild(modal);

            const feld = modal.querySelector('#klkName');
            const knopf = modal.querySelector('#klkLoeschen');
            feld.value = name;
            feld.dispatchEvent(new Event('input'));
            knopf.click();
            await new Promise(r => setTimeout(r, 300));

            return { schritte, modalNochDa: document.body.contains(modal) };
        }, NAME);

        // Die Reihenfolge ist der Punkt, nicht nur dass alles vorkommt.
        assert.deepEqual(ablauf.schritte, ['geloescht', 'abgemeldet', 'weiter']);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('scheitert das Löschen, bleibt man angemeldet', { skip: fehltPlaywright }, async () => {
    // Die Reihenfolge ist der Punkt. Wer zuerst abmeldet, steht bei einem
    // Fehlschlag ohne Sitzung da – und mit Konto, das er nicht mehr löschen
    // kann, ohne sich neu anzumelden.
    const { ctx, p } = await oeffneProfil({ kontoFehler: 'Netz weg' });
    try {
        await p.click('#deleteAccountBtn');
        await p.waitForSelector('#klkName');
        await p.fill('#klkName', NAME);
        await p.click('#klkLoeschen');
        await p.waitForTimeout(600);

        assert.equal(await p.evaluate(() => window.__abgemeldet), 0, 'trotz Fehlschlag abgemeldet');
        assert.match(await p.textContent('#klkFehler'), /fehlgeschlagen/);
        assert.equal(await p.isDisabled('#klkLoeschen'), false, 'kein zweiter Versuch möglich');
    } finally { await ctx.close(); }
});
