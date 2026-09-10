// Die Passwortprüfung im echten Browser.
//
// Die Rechenteile prüft tests/unit/passwort.test.js. Hier geht es um das, was
// dort nicht zu sehen ist: dass das Registrierungsformular die Prüfung
// überhaupt aufruft, dass ein beanstandetes Passwort das Konto NICHT anlegt,
// und dass der Weg nach draußen wirklich nur fünf Zeichen mitnimmt – gebildet
// mit dem crypto.subtle des Browsers, nicht mit dem von Node.
//
// Vorher hing an dieser Stelle ein minlength="6" im HTML. Das prüft der Browser
// beim Absenden des Formulars und sonst niemand.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { starteServer, ladePlaywright, starteBrowser, ersetzeSupabase } from './umgebung.js';

const RECHNER = { width: 1200, height: 900 };

// SHA-1("Sommer2024!") – ein Passwort, das jede Sonderzeichen-Regel besteht:
// Großbuchstabe, Ziffern, Sonderzeichen, elf Stellen. HaveIBeenPwned kennt es
// trotzdem 678-mal. Genau deshalb prüft die App auf Leaks statt auf
// Zeichenklassen.
const HASH_SOMMER = '0CC6D201ED48A2264961EF696EF553F6BEC2E457';

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

/** Öffnet die Anmeldeseite mit offenem Registrierungsteil. */
async function oeffneRegistrierung({ leakAntwort = '', leakFehler = false } = {}) {
    const ctx = await browser.newContext({ viewport: RECHNER });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));

    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });

    await p.evaluate(({ a, f }) => {
        window.__leakAntwort = a;
        window.__leakFehler = f;
        window.__leakGefragt = [];
        window.__registriert = [];
    }, { a: leakAntwort, f: leakFehler });

    // Die Anmeldeseite direkt einhängen: der Stub liefert immer eine Sitzung,
    // die App käme also nie an ihr vorbei.
    await p.evaluate(async () => {
        const m = await import('/src/pages/Auth.js');
        document.body.innerHTML = '';
        document.body.appendChild(m.AuthPage());
    });
    await p.click('[data-tab="register"]');
    await p.waitForSelector('#registerForm', { state: 'visible' });

    return { ctx, p, fehler };
}

/** Füllt das Formular und schickt es ab. */
async function registriere(p, { name = 'Opernfan42', email = 'neu@opernlog.de', passwort }) {
    await p.fill('#regUsername', name);
    await p.fill('#regEmail', email);
    await p.fill('#regPassword', passwort);
    await p.click('#registerForm button[type="submit"]');
    await p.waitForTimeout(400);
}

test('ein geleaktes Passwort legt kein Konto an', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await oeffneRegistrierung({
        leakAntwort: `${HASH_SOMMER.slice(5)}:678`,
    });
    try {
        await registriere(p, { passwort: 'Sommer2024!' });

        const text = await p.textContent('#regError');
        assert.match(text, /geleakter Passwörter/, `stattdessen: ${text}`);
        assert.match(text, /678/, 'die Anzahl der Funde fehlt');

        assert.deepEqual(await p.evaluate(() => window.__registriert), [],
            'trotz Einwand wurde das Konto angelegt');

        // Die Schaltfläche muss wieder benutzbar sein, sonst sitzt man fest.
        assert.equal(await p.isDisabled('#registerForm button[type="submit"]'), false);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('nach draußen geht nur das fünfstellige Präfix', { skip: fehltPlaywright }, async () => {
    // Der eigentliche Grund, warum der Abgleich erlaubt ist. Ginge der volle
    // Hash hinaus, läge das Passwort praktisch offen.
    const { ctx, p } = await oeffneRegistrierung({ leakAntwort: '' });
    try {
        await registriere(p, { passwort: 'Sommer2024!' });

        const gefragt = await p.evaluate(() => window.__leakGefragt);
        assert.equal(gefragt.length, 1, 'genau ein Aufruf der Edge Function');
        assert.equal(gefragt[0].name, 'passwort-pruefen');
        assert.deepEqual(Object.keys(gefragt[0].body), ['praefix'],
            'im Rumpf darf nichts weiter stehen als das Präfix');

        const praefix = gefragt[0].body.praefix;
        assert.equal(praefix.length, 5);
        assert.match(praefix, /^[0-9A-F]{5}$/);
        assert.equal(praefix, HASH_SOMMER.slice(0, 5),
            'der Browser bildet einen anderen SHA-1 als erwartet');

        // Und das Passwort selbst darf nirgends im Rumpf auftauchen.
        assert.ok(!JSON.stringify(gefragt[0]).includes('Sommer2024'));
    } finally { await ctx.close(); }
});

test('ein zu kurzes Passwort wird gar nicht erst hinausgetragen', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffneRegistrierung();
    try {
        // minlength würde das Absenden im Browser schon verhindern, deshalb
        // hier am Formular vorbei – genau der Weg, den die alte Prüfung offen
        // ließ.
        await p.evaluate(() => {
            document.querySelector('#regPassword').removeAttribute('minlength');
        });
        await registriere(p, { passwort: 'kurz' });

        assert.match(await p.textContent('#regError'), /Mindestens 8 Zeichen/);
        assert.deepEqual(await p.evaluate(() => window.__leakGefragt), [],
            'für ein offensichtlich zu kurzes Passwort wurde trotzdem nachgefragt');
        assert.deepEqual(await p.evaluate(() => window.__registriert), []);
    } finally { await ctx.close(); }
});

test('der eigene Benutzername im Passwort wird abgelehnt', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffneRegistrierung();
    try {
        await registriere(p, { name: 'Opernfan42', passwort: 'Opernfan42-ist-toll' });
        assert.match(await p.textContent('#regError'), /Name oder deine E-Mail/);
        assert.deepEqual(await p.evaluate(() => window.__registriert), []);
    } finally { await ctx.close(); }
});

test('antwortet der Dienst nicht, geht die Registrierung trotzdem durch', { skip: fehltPlaywright }, async () => {
    // Absicht: ein Ausfall bei HaveIBeenPwned darf niemanden aussperren. Die
    // örtlichen Prüfungen greifen weiter.
    const { ctx, p, fehler } = await oeffneRegistrierung({ leakFehler: true });
    try {
        await registriere(p, { passwort: 'Vorhang-auf-fuer-Chowanschtschina' });

        const angelegt = await p.evaluate(() => window.__registriert);
        assert.equal(angelegt.length, 1, 'die Registrierung wurde durch den Ausfall blockiert');
        assert.equal(angelegt[0].password, 'Vorhang-auf-fuer-Chowanschtschina');
        assert.deepEqual(fehler, [], 'der Ausfall darf keinen Seitenfehler werfen');
    } finally { await ctx.close(); }
});

test('ein gutes Passwort kommt durch', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffneRegistrierung({ leakAntwort: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA:5' });
    try {
        await registriere(p, { passwort: 'Vorhang-auf-fuer-Chowanschtschina' });
        assert.equal(await p.isVisible('#regError'), false, 'unerwarteter Einwand');
        assert.equal((await p.evaluate(() => window.__registriert)).length, 1);
    } finally { await ctx.close(); }
});
