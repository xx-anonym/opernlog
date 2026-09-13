// Passkeys im Browser: Anmeldeknopf und Verwaltung im Profil.
//
// Die WebAuthn-Zeremonie selbst läuft hier nicht – dafür bräuchte es einen
// echten Authenticator. Der Stub antwortet an ihrer Stelle so, wie supabase-js
// es danach täte. Geprüft wird, was die App daraus macht: wann ein Knopf
// erscheint, was nach Erfolg und Abbruch passiert, und dass Löschen nachfragt.

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

const ABBRUCH = { code: 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY', message: 'The operation either timed out or was not allowed.', cause: { name: 'NotAllowedError' } };

const ICH = '11111111-1111-1111-1111-111111111111';
const VERMERK = 'opernlog:passkeyKonten';

/**
 * Startet die App mit Stub. ohneWebAuthn nimmt dem Browser die Schnittstelle,
 * vermerkt legt fest, ob das Gerät schon ein Konto mit Passkey gesehen hat.
 */
async function starte({ ohneWebAuthn = false, passkeys = [], vermerkt = false } = {}) {
    const ctx = await browser.newContext({ viewport: HANDY });
    if (ohneWebAuthn) {
        await ctx.addInitScript(() => { delete window.PublicKeyCredential; });
    }
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await p.evaluate(({ liste, vermerkt, ich, schluessel }) => {
        window.__passkeys = liste;
        if (vermerkt) localStorage.setItem(schluessel, JSON.stringify([ich]));
        else localStorage.removeItem(schluessel);
    }, { liste: passkeys, vermerkt, ich: ICH, schluessel: VERMERK });
    return { ctx, p, fehler };
}

const vermerk = p => p.evaluate(k => JSON.parse(localStorage.getItem(k) || '[]'), VERMERK);

/** Hängt die Anmeldeseite ein. Der Stub hat immer eine Sitzung, die App käme sonst nie dorthin. */
async function anmeldeseite(p) {
    await p.evaluate(async () => {
        window.__erfolg = 0;
        const m = await import('/src/pages/Auth.js');
        document.body.innerHTML = '';
        document.body.appendChild(m.AuthPage(() => { window.__erfolg++; }));
    });
}

/** Öffnet das eigene Profil und darin das Fenster "Profil bearbeiten". */
async function profil(p) {
    await p.evaluate(() => { window.location.hash = '#/profile'; });
    await p.waitForSelector('#editProfileBtn', { timeout: 15000 });
    await p.click('#editProfileBtn');
    await p.waitForSelector('#editProfileModal', { state: 'visible' });
    await p.waitForTimeout(400);
}

// ── Anmeldeseite ─────────────────────────────────────────────────────────

test('wer nie einen Passkey hatte, sieht keinen Knopf', { skip: fehltPlaywright }, async () => {
    // Der Knopf öffnete sonst nur einen leeren Dialog des Systems.
    const { ctx, p, fehler } = await starte({ vermerkt: false });
    try {
        await anmeldeseite(p);
        assert.equal(await p.locator('#passkeySignInBtn').count(), 0);
        assert.equal(await p.isVisible('#googleSignInBtn'), true);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('mit Passkey auf diesem Gerät steht der Knopf da – ohne Erklärtext', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await starte({ vermerkt: true });
    try {
        await anmeldeseite(p);
        assert.equal(await p.isVisible('#passkeySignInBtn'), true);
        assert.match(await p.textContent('#passkeySignInBtn'), /Mit Passkey anmelden/);
        assert.doesNotMatch(await p.textContent('#loginForm'), /Noch keinen Passkey/);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('ohne WebAuthn gibt es weder Knopf noch Profilbereich', { skip: fehltPlaywright }, async () => {
    // Ein Knopf, der erst beim Drücken "geht nicht" sagt, ist schlechter als keiner.
    const { ctx, p, fehler } = await starte({ ohneWebAuthn: true, vermerkt: true });
    try {
        await profil(p);
        assert.equal(await p.locator('.passkeys').count(), 0);
        await anmeldeseite(p);
        assert.equal(await p.locator('#passkeySignInBtn').count(), 0);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('eine gelungene Anmeldung führt weiter und hält den Knopf', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await starte({ vermerkt: true });
    try {
        await anmeldeseite(p);
        // Den Vermerk wegnehmen: die Anmeldung selbst muss ihn wieder setzen,
        // sonst verschwände der Knopf nach geleertem Speicher für immer.
        await p.evaluate(k => localStorage.removeItem(k), VERMERK);
        await p.click('#passkeySignInBtn');
        await p.waitForFunction(() => window.__erfolg > 0, null, { timeout: 5000 });
        assert.equal(await p.evaluate(() => window.__passkeyAnmeldungen), 1);
        assert.equal(await p.isVisible('#loginError'), false);
        assert.deepEqual(await vermerk(p), [ICH]);
    } finally { await ctx.close(); }
});

test('wer im Dialog abbricht, sieht keine Fehlermeldung', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await starte({ vermerkt: true });
    try {
        await anmeldeseite(p);
        await p.evaluate(f => { window.__passkeyFehler = f; }, ABBRUCH);
        await p.click('#passkeySignInBtn');
        await p.waitForTimeout(300);
        assert.equal(await p.isVisible('#loginError'), false, 'ein Abbruch wurde als Fehler gemeldet');
        assert.equal(await p.evaluate(() => window.__erfolg), 0);
        assert.equal(await p.isDisabled('#passkeySignInBtn'), false, 'der Knopf bleibt gesperrt');
    } finally { await ctx.close(); }
});

test('ein unbekannter Passkey sagt, wie es weitergeht', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await starte({ vermerkt: true });
    try {
        await anmeldeseite(p);
        await p.evaluate(() => { window.__passkeyFehler = { code: 'webauthn_credential_not_found', message: 'credential not found' }; });
        await p.click('#passkeySignInBtn');
        await p.waitForTimeout(300);
        const text = await p.textContent('#loginError');
        assert.match(text, /E-Mail und Passwort/);
        assert.doesNotMatch(text, /credential not found/, 'die Rohmeldung gehört in die Konsole');
        assert.equal(await p.evaluate(() => window.__erfolg), 0);
    } finally { await ctx.close(); }
});

// ── Profil ───────────────────────────────────────────────────────────────

const ZWEI = [
    { id: 'a', friendly_name: 'iCloud-Schlüsselbund', created_at: '2026-09-10T12:00:00Z', last_used_at: '2026-09-14T12:00:00Z' },
    { id: 'b', friendly_name: 'Google Password Manager', created_at: '2026-09-11T12:00:00Z', last_used_at: null },
];

test('die Passkeys stehen im Fenster "Profil bearbeiten", nicht auf der Seite', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await starte({ passkeys: ZWEI });
    try {
        await p.evaluate(() => { window.location.hash = '#/profile'; });
        await p.waitForSelector('#editProfileBtn', { timeout: 15000 });
        await p.waitForTimeout(400);
        // Vor dem Öffnen gibt es den Bereich noch gar nicht – die Liste ist
        // eine Anfrage an Supabase, die nur braucht, wer das Fenster öffnet.
        assert.equal(await p.locator('.passkeys').count(), 0, 'Passkeys stehen schon vor dem Öffnen da');

        await p.click('#editProfileBtn');
        await p.waitForSelector('#editProfileModal .passkeys__zeile');
        await p.locator('#editProfileModal .passkeys').scrollIntoViewIfNeeded();
        assert.equal(await p.isVisible('#editProfileModal .passkeys'), true);

        // Zweimal öffnen ergibt keinen doppelten Bereich.
        await p.click('#closeModalBtn');
        await p.click('#editProfileBtn');
        await p.waitForTimeout(300);
        assert.equal(await p.locator('.passkeys').count(), 1);
        assert.equal(await p.locator('#deleteAccountBtn').count(), 1);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('das Profil listet die Passkeys', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await starte({ passkeys: ZWEI });
    try {
        await profil(p);
        await p.waitForSelector('.passkeys__zeile');
        assert.deepEqual(await p.locator('.passkeys__name').allTextContents(),
            ['iCloud-Schlüsselbund', 'Google Password Manager']);
        assert.match(await p.locator('.passkeys__unterzeile').nth(1).textContent(), /noch nie benutzt/);
        // Über "Konto löschen", nicht darunter.
        const reihenfolge = await p.evaluate(() => {
            const pk = document.querySelector('.passkeys');
            const kl = document.querySelector('.konto-loeschen');
            return !!(pk.compareDocumentPosition(kl) & Node.DOCUMENT_POSITION_FOLLOWING);
        });
        assert.equal(reihenfolge, true, 'der Passkey-Bereich steht unter "Konto löschen"');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('ohne Passkey steht da, dass noch keiner angelegt ist', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await starte();
    try {
        await profil(p);
        await p.waitForSelector('.passkeys__leer');
        assert.match(await p.textContent('.passkeys__leer'), /Noch kein Passkey/);
    } finally { await ctx.close(); }
});

test('hinzufügen legt an, zeigt den neuen Passkey und bringt den Knopf', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await starte();
    try {
        await profil(p);
        await p.waitForSelector('.passkeys__leer');
        assert.deepEqual(await vermerk(p), []);

        await p.click('#passkeyAnlegenBtn');
        await p.waitForSelector('.passkeys__zeile');
        assert.equal(await p.locator('.passkeys__zeile').count(), 1);
        assert.equal(await p.locator('.passkeys__leer').count(), 0);
        assert.equal(await p.isVisible('.passkeys__fehler'), false);
        assert.deepEqual(await vermerk(p), [ICH], 'nach dem Anlegen fehlt der Vermerk');

        await anmeldeseite(p);
        assert.equal(await p.isVisible('#passkeySignInBtn'), true);
    } finally { await ctx.close(); }
});

test('Passkeys im Profil bringen den Knopf auch auf ein neues Gerät', { skip: fehltPlaywright }, async () => {
    // Auf dem Laptop normal angemeldet, der Passkey liegt auf dem iPhone. Der
    // Dialog bietet dort an, das Handy zu benutzen – also soll der Knopf da sein.
    const { ctx, p } = await starte({ passkeys: ZWEI, vermerkt: false });
    try {
        await profil(p);
        await p.waitForSelector('.passkeys__zeile');
        assert.deepEqual(await vermerk(p), [ICH]);
    } finally { await ctx.close(); }
});

test('wer den letzten Passkey löscht, verliert den Knopf', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await starte({ passkeys: [ZWEI[0]], vermerkt: true });
    try {
        await profil(p);
        await p.waitForSelector('.passkeys__zeile');
        p.once('dialog', d => d.accept());
        await p.locator('.passkeys__loeschen').first().click();
        await p.waitForSelector('.passkeys__leer');
        assert.deepEqual(await vermerk(p), []);

        await anmeldeseite(p);
        assert.equal(await p.locator('#passkeySignInBtn').count(), 0);
    } finally { await ctx.close(); }
});

test('mit dem Konto verschwindet auch der Knopf', { skip: fehltPlaywright }, async () => {
    // Die Passkeys gehen mit dem Konto. Ein stehengebliebener Knopf könnte nur
    // noch "Diesen Passkey kennt OpernLog nicht mehr" sagen.
    const { ctx, p } = await starte({ vermerkt: true });
    try {
        await p.evaluate(() => { window.__kontoFehler = 'kaputt'; });
        await p.evaluate(() => import('/src/store/supabase.js').then(m => m.kontoLoeschen()).catch(() => {}));
        assert.deepEqual(await vermerk(p), [ICH], 'ein gescheitertes Löschen hat den Vermerk trotzdem entfernt');

        await p.evaluate(() => { window.__kontoFehler = null; });
        await p.evaluate(() => import('/src/store/supabase.js').then(m => m.kontoLoeschen()));
        assert.equal(await p.evaluate(() => window.__kontoGeloescht), 1);
        assert.deepEqual(await vermerk(p), []);
    } finally { await ctx.close(); }
});

test('ließ sich die Liste nicht laden, bleibt der Vermerk, wie er war', { skip: fehltPlaywright }, async () => {
    // Ein Netzfehler ist kein Beweis, dass es keine Passkeys gibt.
    const { ctx, p } = await starte({ vermerkt: true });
    try {
        await p.evaluate(() => { window.__passkeyListeFehler = 'Netz weg'; });
        await profil(p);
        await p.waitForSelector('.passkeys__fehler:not([hidden])');
        assert.deepEqual(await vermerk(p), [ICH]);
    } finally { await ctx.close(); }
});

test('ein schon vorhandener Passkey wird gemeldet, ein Abbruch nicht', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await starte({ passkeys: ZWEI });
    try {
        await profil(p);
        await p.waitForSelector('.passkeys__zeile');

        await p.evaluate(f => { window.__passkeyFehler = f; }, ABBRUCH);
        await p.click('#passkeyAnlegenBtn');
        await p.waitForTimeout(300);
        assert.equal(await p.isVisible('.passkeys__fehler'), false, 'ein Abbruch wurde als Fehler gemeldet');

        await p.evaluate(() => { window.__passkeyFehler = { code: 'webauthn_credential_exists', message: 'exists' }; });
        await p.click('#passkeyAnlegenBtn');
        await p.waitForTimeout(300);
        assert.match(await p.textContent('.passkeys__fehler'), /schon ein Passkey/);
        assert.equal(await p.locator('.passkeys__zeile').count(), 2);
    } finally { await ctx.close(); }
});

test('löschen fragt nach – und löscht nur nach einem Ja', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await starte({ passkeys: ZWEI });
    try {
        await profil(p);
        await p.waitForSelector('.passkeys__zeile');

        let frage = '';
        p.once('dialog', d => { frage = d.message(); d.dismiss(); });
        await p.locator('.passkeys__loeschen').first().click();
        await p.waitForTimeout(300);
        assert.match(frage, /iCloud-Schlüsselbund/, 'die Rückfrage nennt nicht, was gelöscht wird');
        assert.deepEqual(await p.evaluate(() => window.__passkeyGeloescht), [], 'trotz Nein gelöscht');
        assert.equal(await p.locator('.passkeys__zeile').count(), 2);

        p.once('dialog', d => d.accept());
        await p.locator('.passkeys__loeschen').first().click();
        await p.waitForTimeout(300);
        assert.deepEqual(await p.evaluate(() => window.__passkeyGeloescht), ['a']);
        assert.deepEqual(await p.locator('.passkeys__name').allTextContents(), ['Google Password Manager']);
    } finally { await ctx.close(); }
});

test('lässt sich die Liste nicht laden, bleibt Hinzufügen möglich', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await starte();
    try {
        await p.evaluate(() => { window.__passkeyListeFehler = 'Netz weg'; });
        await profil(p);
        await p.waitForSelector('.passkeys__fehler:not([hidden])');
        assert.match(await p.textContent('.passkeys__fehler'), /nicht laden/);
        assert.equal(await p.isVisible('#passkeyAnlegenBtn'), true);
    } finally { await ctx.close(); }
});

test('Namen aus dem Authenticator kommen nicht als HTML an', { skip: fehltPlaywright }, async () => {
    const boese = [{ id: 'x"><img src=x onerror="window.__xss=1">', friendly_name: '<img src=x onerror="window.__xss=2">', created_at: '2026-09-10T12:00:00Z' }];
    const { ctx, p } = await starte({ passkeys: boese });
    try {
        await profil(p);
        await p.waitForSelector('.passkeys__zeile');
        await p.waitForTimeout(200);
        assert.equal(await p.evaluate(() => window.__xss), undefined);
        assert.match(await p.textContent('.passkeys__name'), /^<img/);
    } finally { await ctx.close(); }
});

// ── Die echte Bibliothek ─────────────────────────────────────────────────

test('die echte Bibliothek lässt die Passkey-Aufrufe zu', { skip: fehltPlaywright }, async () => {
    // Alles oben läuft gegen den Stub. Der kennt die Sperre nicht, mit der
    // supabase-js Passkeys ohne "experimental: { passkey: true }" verweigert –
    // fehlte die Freischaltung in getSupabase(), wäre jeder Test oben grün und
    // jeder Knopf in der echten App kaputt.
    const ctx = await browser.newContext({ viewport: HANDY });
    const p = await ctx.newPage();
    // Kein Netz zu Supabase: der Aufruf soll bis zur Anfrage kommen, nicht weiter.
    await p.route('**/*.supabase.co/**', r => r.fulfill({ status: 503, contentType: 'application/json', body: '{"msg":"offline im Test"}' }));
    try {
        await p.goto(`${server.url}/index.html`);
        await p.waitForFunction(() => !!window.supabase?.createClient, null, { timeout: 15000 });
        const ergebnis = await p.evaluate(async () => {
            const { getSupabase } = await import('/src/store/supabase.js');
            const client = getSupabase();
            const versuche = {
                anmelden: () => client.auth.signInWithPasskey(),
                anlegen: () => client.auth.registerPasskey(),
                liste: () => client.auth.passkey.list(),
            };
            const aus = {};
            for (const [name, f] of Object.entries(versuche)) {
                try { await f(); aus[name] = 'kein Wurf'; }
                catch (e) { aus[name] = String(e?.message || e); }
            }
            return aus;
        });
        for (const [name, meldung] of Object.entries(ergebnis)) {
            assert.doesNotMatch(meldung, /experimental/i, `${name}: ${meldung}`);
        }
    } finally { await ctx.close(); }
});
