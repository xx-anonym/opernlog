// Anmelden und Registrieren ohne Passwort (Jonas, 10.11.2026).
//
// Wer sich anmeldet oder registriert, bekommt einen Einmalcode per E-Mail
// und tippt ihn ein (src/pages/Auth.js, src/anmeldecode.js). Google und
// Passkey bleiben daneben bestehen. Ein Passwort gibt es nirgends mehr –
// weder Feld noch "vergessen".
//
// Der Ersatz (supabaseStub.js) nimmt den Code 123456 an und lehnt jeden
// anderen ab wie Supabase: "Token has expired or is invalid".

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { starteServer, ladePlaywright, starteBrowser, ersetzeSupabase } from './umgebung.js';

const HANDY = { width: 390, height: 844 };
const OFFEN = 'opernlog:codeOffen';

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
 * Die Anmeldeseite, direkt eingehängt – der Ersatz liefert sonst immer eine
 * Sitzung, die App käme also nie an ihr vorbei.
 * @param {object} [o]
 * @param {object|null} [o.offen]  ein Merker im Speicher, als wäre eben ein Code verschickt worden
 */
async function anmeldeseite({ offen = null, codeFehler = null } = {}) {
    const ctx = await browser.newContext({ viewport: HANDY });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await p.evaluate(async ([o, f, schluessel]) => {
        if (o) localStorage.setItem(schluessel, JSON.stringify(o)); else localStorage.removeItem(schluessel);
        window.__codeFehler = f;
        window.__codeAngefordert = [];
        window.__codeEingeloest = [];
        window.__erfolg = 0;
        const m = await import('/src/pages/Auth.js');
        document.body.innerHTML = '';
        document.body.appendChild(m.AuthPage(() => { window.__erfolg++; }));
    }, [offen, codeFehler, OFFEN]);
    return { ctx, p, fehler };
}

const sichtbar = (p, sel) => p.isVisible(sel);

test('kein Passwort mehr: kein Feld, kein "vergessen" – Google bleibt', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await anmeldeseite();
    try {
        assert.equal(await p.locator('input[type="password"]').count(), 0);
        assert.equal(await p.locator('#forgotPasswordLink, #resetForm, #loginPassword, #regPassword').count(), 0);
        assert.doesNotMatch(await p.textContent('.auth-container'), /Passwort vergessen/);
        assert.equal(await sichtbar(p, '#googleSignInBtn'), true);
        assert.match(await p.textContent('#loginSubmitBtn'), /Code zuschicken/);
        await p.click('[data-tab="register"]');
        assert.equal(await p.locator('#registerForm input[type="password"]').count(), 0);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Anmelden: Adresse, Code zuschicken, Code eintippen – angemeldet', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await anmeldeseite();
    try {
        await p.fill('#loginEmail', '  fan@opernlog.de ');
        await p.click('#loginSubmitBtn');
        await p.waitForSelector('#codeForm', { state: 'visible' });

        // Anmelden legt kein Konto an, und der Auftrag sagt, wohin ein Link zurückführte.
        const [auftrag] = await p.evaluate(() => window.__codeAngefordert);
        assert.equal(auftrag.email, 'fan@opernlog.de');
        assert.equal(auftrag.options.shouldCreateUser, false);
        assert.equal(auftrag.options.emailRedirectTo, server.url);
        assert.equal('data' in auftrag.options, false);

        // Nur noch der Code: die Reiter und das Adressfeld sind weg, die Adresse steht im Text.
        assert.equal(await sichtbar(p, '.auth-tabs'), false);
        assert.equal(await sichtbar(p, '#loginForm'), false);
        assert.match(await p.textContent('#codeInfo'), /fan@opernlog\.de/);
        assert.match(await p.textContent('#codeSubmitBtn'), /Anmelden/);
        assert.equal(await p.evaluate(() => document.activeElement?.id), 'codeInput');

        // Getippt wird Ziffer für Ziffer – abgeschickt erst mit dem Knopf.
        await p.type('#codeInput', '123456');
        await p.waitForTimeout(250);
        assert.deepEqual(await p.evaluate(() => window.__codeEingeloest), [], 'beim Tippen von selbst abgeschickt');
        await p.click('#codeSubmitBtn');
        await p.waitForFunction(() => window.__erfolg === 1);
        const [eingeloest] = await p.evaluate(() => window.__codeEingeloest);
        assert.deepEqual(eingeloest, { email: 'fan@opernlog.de', token: '123456', type: 'email' });
        // Eingelöst: der Merker ist weg.
        assert.equal(await p.evaluate(k => localStorage.getItem(k), OFFEN), null);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('ein falscher Code: deutscher Satz, das Feld bleibt, der zweite Versuch gelingt', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await anmeldeseite();
    try {
        await p.fill('#loginEmail', 'fan@opernlog.de');
        await p.click('#loginSubmitBtn');
        await p.waitForSelector('#codeForm', { state: 'visible' });
        await p.fill('#codeInput', '12345');
        await p.click('#codeSubmitBtn');
        assert.match(await p.textContent('#codeError'), /mindestens sechs Ziffern/);
        assert.deepEqual(await p.evaluate(() => window.__codeEingeloest), [], 'ein zu kurzer Code ging hinaus');

        await p.fill('#codeInput', '');
        await p.type('#codeInput', '654321');
        await p.click('#codeSubmitBtn');
        await p.waitForFunction(() => /abgelaufen/.test(document.querySelector('#codeError').textContent));
        assert.equal(await p.textContent('#codeError'),
            'Der Code stimmt nicht oder ist abgelaufen. Prüfe ihn noch einmal oder lass dir einen neuen schicken.');
        assert.equal(await p.isDisabled('#codeSubmitBtn'), false, 'Knopf bleibt gesperrt');
        assert.equal(await p.evaluate(() => window.__erfolg), 0);

        await p.fill('#codeInput', '');
        await p.type('#codeInput', '123456');
        await p.click('#codeSubmitBtn');
        await p.waitForFunction(() => window.__erfolg === 1);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('eingefügt oder vom Telefon vorgeschlagen: der Code wird gleich eingelöst – auch mit Leerzeichen', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await anmeldeseite();
    try {
        await p.fill('#loginEmail', 'fan@opernlog.de');
        await p.click('#loginSubmitBtn');
        await p.waitForSelector('#codeForm', { state: 'visible' });
        await p.fill('#codeInput', '123 456');
        await p.waitForFunction(() => window.__erfolg === 1);
        assert.equal((await p.evaluate(() => window.__codeEingeloest))[0].token, '123456');
        assert.equal((await p.evaluate(() => window.__codeEingeloest)).length, 1, 'doppelt eingelöst');
    } finally { await ctx.close(); }
});

test('Registrieren: Name, Adresse, Bild – der Code bestätigt das Konto', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await anmeldeseite();
    try {
        await p.click('[data-tab="register"]');
        await p.fill('#regUsername', ' Opernfan42 ');
        await p.fill('#regEmail', 'neu@opernlog.de');
        await p.click('#regIconPicker [data-icon]:not([data-icon=""])');
        const bild = await p.getAttribute('#regIconPicker .icon-picker__option--active', 'data-icon');
        await p.click('#registerForm button[type="submit"]');
        await p.waitForSelector('#codeForm', { state: 'visible' });

        // Name und Bild gehen als Metadaten mit: aus ihnen legt der Trigger
        // das Profil an. Eine Sitzung gibt es bis zum Code nicht.
        const [auftrag] = await p.evaluate(() => window.__codeAngefordert);
        assert.equal(auftrag.email, 'neu@opernlog.de');
        assert.equal(auftrag.options.shouldCreateUser, true);
        assert.deepEqual(auftrag.options.data, { username: 'Opernfan42', avatar_icon: bild });
        assert.deepEqual(await p.evaluate(() => window.__profilUpsert), [], 'ohne Sitzung ins Profil geschrieben');
        assert.match(await p.textContent('#codeSubmitBtn'), /Konto bestätigen/);

        await p.type('#codeInput', '123456');
        await p.click('#codeSubmitBtn');
        await p.waitForFunction(() => window.__erfolg === 1);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Registrieren: ein zu kurzer Name oder eine Wegwerf-Adresse verschickt nichts', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await anmeldeseite();
    try {
        await p.click('[data-tab="register"]');
        await p.$eval('#registerForm', f => { f.noValidate = true; });
        await p.fill('#regUsername', 'ab');
        await p.fill('#regEmail', 'neu@opernlog.de');
        await p.click('#registerForm button[type="submit"]');
        assert.match(await p.textContent('#regError'), /mindestens 3 Zeichen/);
        await p.fill('#regUsername', 'Opernfan42');
        await p.fill('#regEmail', 'jemand@mailinator.com');
        await p.click('#registerForm button[type="submit"]');
        assert.match(await p.textContent('#regError'), /nicht erlaubt/);
        assert.deepEqual(await p.evaluate(() => window.__codeAngefordert), []);
        assert.equal(await sichtbar(p, '#codeForm'), false);
    } finally { await ctx.close(); }
});

test('Anmelden mit einer Adresse ohne Konto: der Satz sagt, wie es weitergeht', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await anmeldeseite({ codeFehler: { message: 'Signups not allowed for otp', code: 'otp_disabled', status: 422 } });
    try {
        await p.fill('#loginEmail', 'niemand@opernlog.de');
        await p.click('#loginSubmitBtn');
        await p.waitForSelector('#loginError', { state: 'visible' });
        assert.equal(await p.textContent('#loginError'), 'Zu dieser E-Mail-Adresse gibt es kein Konto. Unter „Registrieren“ legst du eines an.');
        assert.equal(await sichtbar(p, '#codeForm'), false);
    } finally { await ctx.close(); }
});

test('aus dem Mailprogramm zurück und neu geladen: das Feld für den Code steht wieder da', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    // Am iPhone lädt die installierte App oft neu, wenn man aus Mail zurückkommt.
    const { ctx, p } = await anmeldeseite({ offen: { email: 'fan@opernlog.de', neu: null, seit: Date.now() - 2 * 60e3 } });
    try {
        assert.equal(await sichtbar(p, '#codeForm'), true);
        assert.equal(await sichtbar(p, '#loginForm'), false);
        assert.match(await p.textContent('#codeInfo'), /fan@opernlog\.de/);
        await p.type('#codeInput', '123456');
        await p.click('#codeSubmitBtn');
        await p.waitForFunction(() => window.__erfolg === 1);
        assert.equal((await p.evaluate(() => window.__codeEingeloest))[0].email, 'fan@opernlog.de');
    } finally { await ctx.close(); }

    // Nach einer Stunde gilt kein Code mehr: dann wieder das Formular.
    const alt = await anmeldeseite({ offen: { email: 'fan@opernlog.de', neu: null, seit: Date.now() - 61 * 60e3 } });
    try {
        assert.equal(await sichtbar(alt.p, '#codeForm'), false);
        assert.equal(await sichtbar(alt.p, '#loginForm'), true);
    } finally { await alt.ctx.close(); }
});

test('"Neuen Code senden" geht erst nach einer Minute – und schickt dann denselben Auftrag noch einmal', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const frisch = await anmeldeseite();
    try {
        await frisch.p.fill('#loginEmail', 'fan@opernlog.de');
        await frisch.p.click('#loginSubmitBtn');
        await frisch.p.waitForSelector('#codeForm', { state: 'visible' });
        assert.equal(await frisch.p.isDisabled('#codeNeuBtn'), true);
        assert.match(await frisch.p.textContent('#codeNeuBtn'), /Neuen Code senden \(in \d+ s\)/);
    } finally { await frisch.ctx.close(); }

    // Eine Registrierung von vor gut einer Minute: Name und Bild gehen wieder mit.
    const neu = { username: 'Opernfan42', avatarIcon: '' };
    const { ctx, p } = await anmeldeseite({ offen: { email: 'neu@opernlog.de', neu, seit: Date.now() - 61e3 } });
    try {
        assert.equal(await p.isDisabled('#codeNeuBtn'), false);
        assert.equal((await p.textContent('#codeNeuBtn')).trim(), 'Neuen Code senden');
        await p.click('#codeNeuBtn');
        await p.waitForFunction(() => window.__codeAngefordert.length === 1);
        const [auftrag] = await p.evaluate(() => window.__codeAngefordert);
        assert.equal(auftrag.email, 'neu@opernlog.de');
        assert.equal(auftrag.options.shouldCreateUser, true);
        assert.equal(auftrag.options.data.username, 'Opernfan42');
        // Danach wieder gesperrt, und der Merker trägt die neue Zeit.
        await p.waitForFunction(() => document.querySelector('#codeNeuBtn').disabled);
        const seit = await p.evaluate(k => JSON.parse(localStorage.getItem(k)).seit, OFFEN);
        assert.ok(Date.now() - seit < 5000);
    } finally { await ctx.close(); }
});

test('"Andere E-Mail-Adresse" führt zurück zum Formular und vergisst den Code', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await anmeldeseite();
    try {
        await p.fill('#loginEmail', 'vertippt@opernlog.de');
        await p.click('#loginSubmitBtn');
        await p.waitForSelector('#codeForm', { state: 'visible' });
        assert.ok(await p.evaluate(k => !!localStorage.getItem(k), OFFEN));
        await p.click('#codeZurueckBtn');
        assert.equal(await sichtbar(p, '#loginForm'), true);
        assert.equal(await sichtbar(p, '.auth-tabs'), true);
        assert.equal(await sichtbar(p, '#codeForm'), false);
        assert.equal(await p.evaluate(k => localStorage.getItem(k), OFFEN), null);
        assert.equal(await p.getAttribute('.auth-tab--active', 'data-tab'), 'login');
    } finally { await ctx.close(); }
});
