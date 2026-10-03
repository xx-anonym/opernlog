// Der Saisonrückblick als Story (src/components/Story.js): vorn die
// Spielzeit, je Kachel eine Folie, am Schluss Teilen und "Von vorn".
// Antippen rechts blättert vor, links zurück; Gedrückthalten hält an;
// Escape und die Zurück-Geste schließen. Ohne Zutun läuft sie bis zum
// Schluss – außer bei weniger Bewegung.
//
// --story-dauer (style.css) wird in den Tests verkürzt oder verlängert,
// damit nichts von der Uhr des Rechners abhängt.

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
const BESUCHE = [
    { id: 'aaaaaaaa-1111-4000-8000-000000000001', user_id: UID, opera_id: 'tosca', house_id: 'semperoper', date: '2025-10-12', rating: 5 },
    { id: 'aaaaaaaa-1111-4000-8000-000000000002', user_id: UID, opera_id: 'aida', house_id: 'oper-leipzig', date: '2026-02-01', rating: 4 },
    { id: 'aaaaaaaa-1111-4000-8000-000000000003', user_id: UID, opera_id: 'tosca', house_id: 'semperoper', date: '2026-05-01', rating: 3 },
];

async function rueckblick({ dauer = '60s', bewegung = 'no-preference', teilen = false } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', reducedMotion: bewegung });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await p.addInitScript(([b, mitTeilen]) => {
        window.__besucheVorgabe = b;
        if (mitTeilen) {
            Object.defineProperty(navigator, 'share', { configurable: true, value: async (d) => { window.__geteilt = d; } });
            Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => false });
        }
    }, [BESUCHE, teilen]);
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html#/season/2025`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await vorhangAuf(p);
    await p.waitForSelector('.season-card');
    // Der Vergleich lädt nach; erst danach steht fest, welche Kacheln es gibt.
    await p.waitForFunction(() => !document.querySelector('.season-card--laedt'));
    await p.addStyleTag({ content: `.story { --story-dauer: ${dauer} !important; }` });
    const kacheln = await p.locator('.season-card').count();
    return { ctx, p, fehler, folien: kacheln + 2 };
}

const nr = p => p.getAttribute('.story', 'data-folie').then(Number);

test('Story: Anfang, je Kachel eine Folie, blättern per Tippen und Pfeiltaste, Escape schließt', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler, folien } = await rueckblick();
    try {
        await p.click('#storyBtn');
        await p.waitForSelector('.story');
        assert.equal(await p.locator('.story__teil').count(), folien);
        assert.equal(await nr(p), 0);
        assert.equal(await p.textContent('.story__titel'), '2025/26');
        assert.equal(await p.evaluate(() => document.documentElement.classList.contains('story-offen')), true);
        // Balken und Schließen liegen über der Folie, nicht unter ihrem Hintergrund.
        assert.equal(await p.evaluate(() => {
            const z = sel => Number(getComputedStyle(document.querySelector(sel)).zIndex);
            return z('.story__balken') > z('.story__folie') && z('.story__zu') > z('.story__folie');
        }), true);

        await p.click('.story__zone--weiter');
        assert.equal(await nr(p), 1);
        assert.match(await p.textContent('.story__kicker'), /Abende in der Oper/);
        assert.equal((await p.textContent('.story__wert--zahl')).trim(), '3');
        assert.equal(await p.locator('.story__teil--voll').count(), 1);

        await p.click('.story__zone--zurueck');
        assert.equal(await nr(p), 0);
        // Vor die erste Folie geht es nicht.
        await p.click('.story__zone--zurueck');
        assert.equal(await nr(p), 0);
        await p.keyboard.press('ArrowRight');
        await p.keyboard.press('ArrowRight');
        assert.equal(await nr(p), 2);
        await p.keyboard.press('ArrowLeft');
        assert.equal(await nr(p), 1);

        // Der beste Abend mit seinen Sternen.
        while (!(await p.textContent('.story__kicker')).includes('Der Abend der Saison')) await p.keyboard.press('ArrowRight');
        assert.equal((await p.textContent('.story__wert')).trim(), 'Tosca');
        assert.equal(await p.locator('.story__folie .star--full').count(), 5);

        await p.keyboard.press('Escape');
        await p.waitForSelector('.story', { state: 'detached' });
        assert.equal(await p.evaluate(() => document.documentElement.classList.contains('story-offen')), false);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Story: läuft von selbst bis zum Schluss und bleibt dort; "Von vorn" beginnt neu', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler, folien } = await rueckblick({ dauer: '120ms' });
    try {
        await p.click('#storyBtn');
        await p.waitForFunction(n => document.querySelector('.story')?.dataset.folie === String(n), folien - 1, { timeout: 15000 });
        await p.waitForTimeout(500);
        assert.equal(await nr(p), folien - 1);
        assert.match(await p.textContent('.story__folie'), /Bis zur nächsten Spielzeit/);
        assert.match(await p.textContent('.story__notiz'), /^3 Abende · 2 Werke · 2 Häuser$/);

        await p.evaluate(() => document.querySelector('.story').style.setProperty('--story-dauer', '60s', 'important'));
        await p.click('.story__vorn');
        assert.equal(await nr(p), 0);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Story: Gedrückthalten hält an, Loslassen blättert nicht', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await rueckblick({ dauer: '900ms' });
    try {
        await p.click('#storyBtn');
        const box = await p.locator('.story__zone--weiter').boundingBox();
        await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await p.mouse.down();
        await p.waitForTimeout(1600);
        assert.equal(await nr(p), 0, 'angehalten');
        await p.mouse.up();
        assert.equal(await nr(p), 0, 'Loslassen ist kein Weiterblättern');
        // Danach läuft sie weiter.
        await p.waitForFunction(() => document.querySelector('.story').dataset.folie === '1');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Story: bei weniger Bewegung läuft nichts von allein', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await rueckblick({ dauer: '100ms', bewegung: 'reduce' });
    try {
        await p.click('#storyBtn');
        await p.waitForTimeout(700);
        assert.equal(await nr(p), 0);
        await p.click('.story__zone--weiter');
        assert.equal(await nr(p), 1);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Story: die Zurück-Geste schließt sie, der Rückblick bleibt', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await rueckblick();
    try {
        await p.click('#storyBtn');
        await p.waitForFunction(() => history.state?.opernlogFenster === 1);
        await p.evaluate(() => history.back());
        await p.waitForSelector('.story', { state: 'detached' });
        assert.equal(await p.evaluate(() => location.hash), '#/season/2025');
        assert.ok(await p.isVisible('.season__hero'));
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Story: am Schluss den Rückblick teilen', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler, folien } = await rueckblick({ teilen: true });
    try {
        await p.click('#storyBtn');
        for (let i = 1; i < folien; i++) await p.keyboard.press('ArrowRight');
        await p.click('.story__teilen');
        await p.waitForFunction(() => !!window.__geteilt);
        const geteilt = await p.evaluate(() => window.__geteilt);
        assert.equal(geteilt.title, 'Meine Opernsaison 2025/26');
        assert.match(geteilt.text, /3 Abende · 2 Werke · 2 Häuser/);
        // Die Story bleibt dabei offen.
        assert.equal(await p.locator('.story').count(), 1);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});
