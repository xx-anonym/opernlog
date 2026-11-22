// Mitwirkende von anderen Besuchern desselben Abends als Vorschlag im
// Log-Formular (src/pages/LogVisit.js, mitwirkendeVorschlag in
// src/data/besetzung.js).
//
// Geprüft wird: Haus, Werk und Tag gleich ergeben den Vorschlag, auch bei
// zugeklapptem Block "Mitwirkende"; erst der Klick trägt ein; was man selbst
// einträgt, verschwindet aus dem Vorschlag; ein anderer Tag oder die eigenen
// Abende ergeben keinen; wer die Mitwirkenden notiert hat, steht nirgends.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { starteServer, ladePlaywright, starteBrowser, ersetzeSupabase } from './umgebung.js';

const HANDY = { width: 390, height: 900 };
const ICH = '11111111-1111-1111-1111-111111111111';
const ANDERE = '22222222-2222-2222-2222-222222222222';

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

const ABEND = '2026-10-10';
const zeile = (id, user, felder) => ({
    id, user_id: user, house_id: 'semperoper', opera_id: 'tosca', date: ABEND, rating: 4, review: '',
    conductor: '', director: '', cast_list: '', created_at: '2026-10-11T10:00:00Z',
    profiles: { id: user, username: user === ICH ? 'Testnutzer' : 'Geheime Nachbarin', avatar_initials: 'GN', avatar_icon: null },
    ...felder,
});
const BESUCHE = [
    zeile('a1', ANDERE, { conductor: 'Christian Thielemann', director: 'Johannes Schaaf',
        cast_list: 'Anna Netrebko (Tosca)\nYusif Eyvazov (Cavaradossi)' }),
    zeile('a2', ANDERE, { conductor: 'christian thielemann', cast_list: 'Yusif Eyvazov (Cavaradossi)\nAnna Netrebko (Tosca)\nLudovic Tézier (Scarpia)' }),
    // Ein anderer Abend desselben Werks im selben Haus zählt nicht.
    zeile('a3', ANDERE, { date: '2026-10-12', conductor: 'Ein anderer Dirigent' }),
    // Der eigene Abend auch nicht – er steht schon im Tagebuch.
    zeile('m1', ICH, { date: '2026-09-01', conductor: 'Mein eigener Eintrag' }),
];

async function formular(hash) {
    const ctx = await browser.newContext({ viewport: HANDY });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await p.addInitScript(b => { window.__besucheVorgabe = b; }, BESUCHE);
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html`);
    await p.waitForSelector('.main-content', { timeout: 15000 });
    await p.evaluate(h => { location.hash = h; }, hash);
    await p.waitForSelector('#logForm');
    return { ctx, p, fehler };
}

const datumSetzen = (p, datum) => p.evaluate((d) => {
    const feld = document.querySelector('#visitDate');
    feld.value = d;
    feld.dispatchEvent(new Event('input', { bubbles: true }));
}, datum);
const knoepfe = p => p.locator('#mitwirkendeVorschlag .chip').allInnerTexts();

test('gleicher Abend: Dirigent, Regie und Besetzung als Vorschlag, erst der Klick trägt ein', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await formular('#/log?house=semperoper&opera=tosca');
    try {
        await datumSetzen(p, ABEND);
        await p.locator('#mitwirkendeVorschlag .chip').first().waitFor();
        assert.match(await p.locator('#mitwirkendeVorschlag').innerText(), /Andere Besucher dieses Abends/);
        assert.deepEqual(await knoepfe(p), [
            'Dirigent: Christian Thielemann', 'Regie: Johannes Schaaf', 'Besetzung: 3 Namen', 'Alle übernehmen',
        ]);
        // Sichtbar, obwohl der Block zugeklappt ist; eingetragen ist nichts.
        assert.equal(await p.locator('#mitwirkendeBlock').evaluate(d => d.open), false);
        assert.equal(await p.isVisible('#mitwirkendeVorschlag .chip >> nth=0'), true);
        assert.equal(await p.inputValue('#conductorInput'), '');
        // Wer es notiert hat, steht nirgends.
        assert.doesNotMatch(await p.locator('#logForm').innerText(), /Geheime Nachbarin/);

        // Ein Feld einzeln: es füllt sich, der Block klappt auf, der Knopf geht.
        await p.locator('#mitwirkendeVorschlag .chip', { hasText: 'Dirigent' }).click();
        assert.equal(await p.inputValue('#conductorInput'), 'Christian Thielemann');
        assert.equal(await p.locator('#mitwirkendeBlock').evaluate(d => d.open), true);
        assert.deepEqual(await knoepfe(p), ['Regie: Johannes Schaaf', 'Besetzung: 3 Namen', 'Alle übernehmen']);

        // Selbst eine Person eingetragen: der Vorschlag ergänzt nur die übrigen.
        await p.fill('#castInput', 'Anna Netrebko (Tosca)');
        assert.deepEqual(await knoepfe(p), ['Regie: Johannes Schaaf', 'Besetzung: 2 weitere ergänzen', 'Alle übernehmen']);

        await p.locator('#mitwirkendeVorschlag .chip', { hasText: 'Alle übernehmen' }).click();
        assert.equal(await p.inputValue('#directorInput'), 'Johannes Schaaf');
        assert.equal(await p.inputValue('#castInput'),
            'Anna Netrebko (Tosca)\nYusif Eyvazov (Cavaradossi)\nLudovic Tézier (Scarpia)');
        assert.deepEqual(await knoepfe(p), [], 'nach dem Übernehmen bleibt nichts vorzuschlagen');
        assert.deepEqual(fehler, []);
    } finally {
        await ctx.close();
    }
});

test('anderer Tag, kein Werk oder nur eigene Abende: kein Vorschlag', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await formular('#/log?house=semperoper&opera=tosca');
    try {
        // Am 12.10. hat jemand nur einen Dirigenten notiert – nur der kommt.
        await datumSetzen(p, '2026-10-12');
        await p.locator('#mitwirkendeVorschlag .chip').first().waitFor();
        assert.deepEqual(await knoepfe(p), ['Dirigent: Ein anderer Dirigent']);

        // Am 1.9. war nur ich: nichts.
        await datumSetzen(p, '2026-09-01');
        await p.waitForFunction(() => !document.querySelector('#mitwirkendeVorschlag .chip'));
        assert.equal(await p.locator('#mitwirkendeVorschlag').innerText(), '');

        // Zurück zum 10.10. und dann das Werk wieder weg: der Vorschlag geht mit.
        await datumSetzen(p, ABEND);
        await p.locator('#mitwirkendeVorschlag .chip').first().waitFor();
        await p.fill('#operaInput', '');
        await p.evaluate(() => {
            const id = document.querySelector('#operaId');
            id.value = '';
            document.querySelector('#visitDate').dispatchEvent(new Event('input', { bubbles: true }));
        });
        await p.waitForFunction(() => !document.querySelector('#mitwirkendeVorschlag .chip'));
        assert.deepEqual(fehler, []);
    } finally {
        await ctx.close();
    }
});
