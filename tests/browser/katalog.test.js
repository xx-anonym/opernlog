// Der Admin legt Werke und Häuser selbst an.
//
// Der wichtigste Test hier ist der erste: wer kein Admin ist, bekommt das
// Formular nicht zu sehen. Verbindlich ist das nicht – verbindlich ist die
// Regel in der Datenbank, die jedes INSERT ohne Adminrecht ablehnt, und die
// steht in tests/checks/rls.test.js. Aber eine Schaltfläche anzubieten, die
// nichts bewirkt, wäre schlechtes Benehmen.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { starteServer, ladePlaywright, starteBrowser, ersetzeSupabase } from './umgebung.js';

const RECHNER = { width: 900, height: 1000 };
const BILD = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Papageno.jpg/500px-Papageno.jpg';

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

/** Öffnet eine Katalogseite, wahlweise als Admin. */
async function oeffne(seite, { admin = false, insertFehler = null } = {}) {
    const ctx = await browser.newContext({ viewport: RECHNER });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));

    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await p.evaluate(({ a, f }) => {
        window.__istAdmin = a;
        window.__insertFehler = f;
        window.__angelegt = [];
    }, { a: admin, f: insertFehler });

    await p.evaluate(s => { window.location.hash = s; }, seite);
    await p.waitForSelector('#suggestOperaBtn, #suggestHouseBtn', { timeout: 15000 });
    await p.waitForTimeout(700);   // istAdmin() kommt zurück
    return { ctx, p, fehler };
}

/** Füllt das Werkformular vollständig aus. */
async function fuelleWerk(p, { titel = 'Der Kaiser von Atlantis', komponist = 'Wolfgang Amadeus Mozart', bild = BILD } = {}) {
    await p.fill('#kfTitle', titel);
    await p.selectOption('#kfComposer', komponist);
    await p.fill('#kfYear', '1943');
    await p.fill('#kfLanguage', 'Deutsch');
    await p.fill('#kfActs', '1');
    await p.fill('#kfGenre', 'Oper');
    await p.fill('#kfLibrettist', 'Peter Kien');
    await p.fill('#kfDescription', 'Im Ghetto Theresienstadt entstanden.');
    await p.fill('#kfImage', bild);
}

test('wer kein Admin ist, sieht den Vorschlagsschalter', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffne('#/operas', { admin: false });
    try {
        assert.match(await p.textContent('#suggestOperaBtn'), /vorschlagen/);
        await p.click('#suggestOperaBtn');
        await p.waitForTimeout(300);
        assert.equal(await p.locator('#kfForm').count(), 0, 'das Adminformular stand einem Nichtadmin offen');
    } finally { await ctx.close(); }
});

test('der Admin bekommt das volle Formular', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await oeffne('#/operas', { admin: true });
    try {
        assert.match(await p.textContent('#suggestOperaBtn'), /hinzufügen/);
        await p.click('#suggestOperaBtn');
        await p.waitForSelector('#kfForm');

        // Alle zehn Felder eines Werks, nicht nur Titel und Komponist wie beim
        // Vorschlag.
        for (const f of ['#kfTitle', '#kfComposer', '#kfYear', '#kfLanguage', '#kfActs',
                         '#kfGenre', '#kfLibrettist', '#kfDescription', '#kfImage', '#kfId']) {
            assert.equal(await p.locator(f).count(), 1, `${f} fehlt`);
        }
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('die Id wird aus dem Titel vorgeschlagen und bleibt änderbar', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffne('#/operas', { admin: true });
    try {
        await p.click('#suggestOperaBtn');
        await p.waitForSelector('#kfForm');
        await p.fill('#kfTitle', 'Die Zauberflöte');
        assert.equal(await p.inputValue('#kfId'), 'die-zauberfloete');

        // Von Hand geändert? Dann nicht mehr überschreiben – sonst tippt man
        // gegen das Formular an.
        await p.fill('#kfId', 'eigene-id');
        await p.fill('#kfTitle', 'Ganz anderer Titel');
        assert.equal(await p.inputValue('#kfId'), 'eigene-id');
    } finally { await ctx.close(); }
});

test('ein Werk landet im Katalog und ist sofort da', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await oeffne('#/operas', { admin: true });
    try {
        const vorher = await p.evaluate(async () => (await import('/src/data/operas.js')).operas.length);

        await p.click('#suggestOperaBtn');
        await p.waitForSelector('#kfForm');
        await fuelleWerk(p);
        await p.click('#kfSenden');
        await p.waitForTimeout(600);

        assert.equal(await p.locator('#kfForm').count(), 0, 'das Formular blieb offen');
        const angelegt = await p.evaluate(() => window.__angelegt);
        assert.equal(angelegt.length, 1);
        assert.equal(angelegt[0].tabelle, 'catalog_operas');
        assert.equal(angelegt[0].zeile.id, 'der-kaiser-von-atlantis');
        // Die Spalte heißt in der Datenbank anders als das Feld in der App.
        assert.equal(angelegt[0].zeile.year_composed, 1943);

        const nachher = await p.evaluate(async () => (await import('/src/data/operas.js')).operas.length);
        assert.equal(nachher, vorher + 1, 'der Katalog wuchs nicht mit');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('ein neuer Komponist wird mit angelegt und die Werkseite verlinkt ihn', { skip: fehltPlaywright }, async () => {
    // Der Name ist der Schlüssel zwischen Werk und Komponistenseite. Legte man
    // nur das Werk an, stünde dort ein Name ohne Profil.
    const { ctx, p, fehler } = await oeffne('#/operas', { admin: true });
    try {
        await p.click('#suggestOperaBtn');
        await p.waitForSelector('#kfForm');
        await p.fill('#kfTitle', 'Der Kaiser von Atlantis');
        await p.selectOption('#kfComposer', '__neu');
        await p.waitForTimeout(150);
        assert.ok(await p.isVisible('#kfKompName'), 'das Komponistenformular blieb verborgen');

        await p.fill('#kfKompName', 'Viktor Ullmann');
        await p.fill('#kfKompKurz', 'österreichischer Komponist');
        await p.fill('#kfKompBio', 'Viktor Ullmann war ein österreichischer Komponist.');
        await p.fill('#kfKompWikipedia', 'https://de.wikipedia.org/wiki/Viktor_Ullmann');
        assert.equal(await p.inputValue('#kfKompId'), 'viktor-ullmann');

        await p.fill('#kfYear', '1943');
        await p.fill('#kfLanguage', 'Deutsch');
        await p.fill('#kfActs', '1');
        await p.fill('#kfGenre', 'Oper');
        await p.fill('#kfLibrettist', 'Peter Kien');
        await p.fill('#kfDescription', 'Im Ghetto Theresienstadt entstanden.');
        await p.fill('#kfImage', BILD);
        await p.click('#kfSenden');
        await p.waitForTimeout(700);

        // Der Komponist zuerst: sonst zeigte die Werkseite kurz einen Namen
        // ohne Profil.
        const angelegt = await p.evaluate(() => window.__angelegt);
        assert.deepEqual(angelegt.map(a => a.tabelle), ['catalog_composers', 'catalog_operas']);

        await p.evaluate(() => { window.location.hash = '#/opera/der-kaiser-von-atlantis'; });
        await p.waitForTimeout(700);
        const link = p.locator('a.composer-link').first();
        assert.equal(await link.count(), 1, 'die Werkseite verlinkt den Komponisten nicht');
        assert.equal(await link.getAttribute('href'), '#/composer/viktor-ullmann');

        await p.evaluate(() => { window.location.hash = '#/composer/viktor-ullmann'; });
        await p.waitForTimeout(700);
        assert.match(await p.textContent('h1'), /Viktor Ullmann/);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('ein Werk mit Mängeln wird gar nicht erst gespeichert', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffne('#/operas', { admin: true });
    try {
        await p.click('#suggestOperaBtn');
        await p.waitForSelector('#kfForm');
        // Ein Bild in Originalgröße – genau der Fehler, der die Opernliste
        // einmal 135 MB nachladen ließ.
        await fuelleWerk(p, { bild: 'https://upload.wikimedia.org/wikipedia/commons/8/83/Papageno.jpg' });
        await p.click('#kfSenden');
        await p.waitForTimeout(400);

        assert.equal(await p.locator('#kfForm').count(), 1, 'das Formular schloss trotz Mangel');
        assert.match(await p.textContent('#kfMaengel'), /Original statt/);
        assert.deepEqual(await p.evaluate(() => window.__angelegt), [],
            'trotz Mangel wurde gespeichert');
    } finally { await ctx.close(); }
});

test('ein Haus landet im Katalog', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await oeffne('#/houses', { admin: true });
    try {
        assert.match(await p.textContent('#suggestHouseBtn'), /hinzufügen/);
        await p.click('#suggestHouseBtn');
        await p.waitForSelector('#kfForm');

        await p.fill('#kfName', 'Neues Opernhaus');
        await p.fill('#kfCity', 'Regensburg');
        await p.selectOption('#kfState', 'Bayern');
        await p.fill('#kfLat', '49.0195');
        await p.fill('#kfLon', '12.0975');
        await p.fill('#kfCapacity', '520');
        await p.fill('#kfFounded', '1852');
        await p.fill('#kfDescription', 'Ein Haus zum Prüfen.');
        await p.fill('#kfImageUrl', BILD);
        await p.click('#kfSenden');
        await p.waitForTimeout(600);

        const angelegt = await p.evaluate(() => window.__angelegt);
        assert.equal(angelegt.length, 1);
        assert.equal(angelegt[0].tabelle, 'catalog_houses');
        assert.equal(angelegt[0].zeile.image_url, BILD, 'imageUrl wurde nicht auf image_url abgebildet');
        assert.equal(angelegt[0].zeile.lat, 49.0195);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('ein Haus auf vertauschten Koordinaten wird abgelehnt', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffne('#/houses', { admin: true });
    try {
        await p.click('#suggestHouseBtn');
        await p.waitForSelector('#kfForm');
        await p.fill('#kfName', 'Verdrehtes Haus');
        await p.fill('#kfCity', 'München');
        await p.selectOption('#kfState', 'Bayern');
        await p.fill('#kfLat', '11.5794');   // vertauscht
        await p.fill('#kfLon', '48.1397');
        await p.fill('#kfCapacity', '900');
        await p.fill('#kfFounded', '1900');
        await p.fill('#kfDescription', 'Zum Prüfen.');
        await p.fill('#kfImageUrl', BILD);
        await p.click('#kfSenden');
        await p.waitForTimeout(400);

        assert.match(await p.textContent('#kfMaengel'), /liegt nicht in Deutschland/);
        assert.deepEqual(await p.evaluate(() => window.__angelegt), []);
    } finally { await ctx.close(); }
});

test('lehnt die Datenbank ab, bleibt das Formular stehen und sagt es', { skip: fehltPlaywright }, async () => {
    // So sähe es aus, wenn jemand ohne Adminrecht das Formular erzwingt: die
    // Regel in der Datenbank lässt keine Zeile durch.
    const { ctx, p } = await oeffne('#/operas', { admin: true, insertFehler: 'new row violates row-level security policy' });
    try {
        await p.click('#suggestOperaBtn');
        await p.waitForSelector('#kfForm');
        await fuelleWerk(p);
        await p.click('#kfSenden');
        await p.waitForTimeout(500);

        assert.equal(await p.locator('#kfForm').count(), 1, 'das Formular schloss trotz Fehlschlag');
        assert.match(await p.textContent('#kfMaengel'), /row-level security|Speichern fehlgeschlagen/);
        assert.equal(await p.isDisabled('#kfSenden'), false, 'die Schaltfläche blieb gesperrt');
    } finally { await ctx.close(); }
});
