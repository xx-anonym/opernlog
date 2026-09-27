// Ein Profilfoto, von Hand als Wikimedia-Adresse in profiles.avatar_icon
// eingetragen: es erscheint im Kreis, und "Profil bearbeiten" darf es beim
// Speichern nicht still durch "kein Icon" ersetzen.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { starteServer, ladePlaywright, starteBrowser, ersetzeSupabase } from './umgebung.js';

const FOTO = 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Maria_Callas.jpg';
const VORSCHAU = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Maria_Callas.jpg/240px-Maria_Callas.jpg';

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

async function oeffneProfil(avatarIcon) {
    const ctx = await browser.newContext({ viewport: { width: 1000, height: 1000 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await ersetzeSupabase(p);
    await p.addInitScript(v => { window.__avatarIconVorgabe = v; }, avatarIcon);
    await p.goto(`${server.url}/index.html`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await p.evaluate(() => { window.location.hash = '#/profile'; });
    await p.waitForSelector('#editProfileBtn', { timeout: 15000 });
    return { ctx, p, fehler };
}

// Beim Speichern gehen zwei Änderungen an profiles hinaus – das Profil und
// die Einstellung für Freundschaftsanfragen. Gemeint ist die erste.
async function speichern(p) {
    await p.click('#saveProfileBtn');
    await p.waitForFunction(() => window.__profilUpdate.some(u => 'avatar_icon' in u), null, { timeout: 10000 });
    return p.evaluate(() => window.__profilUpdate.find(u => 'avatar_icon' in u));
}

test('eine Wikimedia-Adresse in avatar_icon erscheint als Foto im Profilkreis', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffneProfil(FOTO);
    try {
        await p.waitForSelector('.profile-hero__avatar img.avatar-foto');
        assert.equal(await p.getAttribute('.profile-hero__avatar img.avatar-foto', 'src'), VORSCHAU);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Speichern im Fenster "Profil bearbeiten" behält das Foto', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await oeffneProfil(FOTO);
    try {
        await p.click('#editProfileBtn');
        await p.waitForSelector('#iconPicker .icon-picker__option--active img');
        const gespeichert = await speichern(p);
        assert.equal(gespeichert.avatar_icon, FOTO);
        assert.equal(await p.locator('.profile-hero__avatar img.avatar-foto').count(), 1);
    } finally { await ctx.close(); }
});

test('"Kein Icon" gewählt und gespeichert: das Foto ist weg', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await oeffneProfil(FOTO);
    try {
        await p.click('#editProfileBtn');
        await p.click('#iconPicker .icon-picker__option--none');
        const gespeichert = await speichern(p);
        assert.equal(gespeichert.avatar_icon, '');
        assert.equal(await p.locator('.profile-hero__avatar img').count(), 0);
    } finally { await ctx.close(); }
});

test('eine Adresse von einem fremden Host bleibt ohne Bild', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await oeffneProfil('https://example.org/zaehlpixel.gif');
    try {
        await p.waitForSelector('.profile-hero__avatar .avatar-initials');
        assert.equal(await p.locator('.profile-hero__avatar img').count(), 0);
    } finally { await ctx.close(); }
});
