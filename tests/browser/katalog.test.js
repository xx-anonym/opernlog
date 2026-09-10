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
    // bild: undefined lässt das Bildfeld in Ruhe – für den Umrechnungstest.
    await p.fill('#kfTitle', titel);
    await p.selectOption('#kfComposer', komponist);
    await p.fill('#kfYear', '1943');
    await p.fill('#kfLanguage', 'Deutsch');
    await p.fill('#kfActs', '1');
    await p.fill('#kfGenre', 'Oper');
    await p.fill('#kfLibrettist', 'Peter Kien');
    await p.fill('#kfDescription', 'Im Ghetto Theresienstadt entstanden.');
    if (bild !== undefined) await p.fill('#kfImage', bild);
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
        // Ein Bild von einem fremden Host. Bewusst nicht mehr die
        // Originaladresse: die rechnet das Formular seit der Umstellung selbst
        // in ein Vorschaubild um, und der Mangel wäre geheilt, bevor er
        // gemeldet werden könnte. Einen fremden Host lässt thumbAdresse
        // absichtlich unangetastet – umrechnen ist keine Erlaubnis.
        await fuelleWerk(p, { bild: 'https://example.com/thumb/a/b/x.jpg/500px-x.jpg' });
        await p.click('#kfSenden');
        await p.waitForTimeout(400);

        assert.equal(await p.locator('#kfForm').count(), 1, 'das Formular schloss trotz Mangel');
        assert.match(await p.textContent('#kfMaengel'), /nicht upload\.wikimedia\.org/);
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

test('eine Originaladresse wird beim Verlassen des Feldes umgerechnet', { skip: fehltPlaywright }, async () => {
    // Die Adresse eines Vorschaubilds steht auf Commons nirgends – sie wird
    // aus der des Originals abgeleitet. Wer das nicht weiß, fügt die
    // Originaladresse ein und bekam dafür bisher nur einen Mangel zu lesen,
    // ohne einen Weg heraus.
    const { ctx, p } = await oeffne('#/operas', { admin: true });
    try {
        await p.click('#suggestOperaBtn');
        await p.waitForSelector('#kfForm');

        await p.fill('#kfImage', 'https://upload.wikimedia.org/wikipedia/commons/8/83/Papageno.jpg');
        await p.locator('#kfTitle').focus();   // Feld verlassen
        await p.waitForTimeout(150);

        assert.equal(await p.inputValue('#kfImage'),
            'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/Papageno.jpg/500px-Papageno.jpg');

        // Und das Werk lässt sich damit auch wirklich anlegen.
        await fuelleWerk(p, { bild: undefined });
        await p.fill('#kfImage', 'https://upload.wikimedia.org/wikipedia/commons/8/83/Papageno.jpg');
        await p.locator('#kfTitle').focus();
        await p.waitForTimeout(150);
        await p.click('#kfSenden');
        await p.waitForTimeout(600);

        assert.equal(await p.locator('#kfForm').count(), 0, 'trotz umgerechneter Adresse abgelehnt');
    } finally { await ctx.close(); }
});

test('ein zu breites Vorschaubild wird auf 500px gebracht', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffne('#/houses', { admin: true });
    try {
        await p.click('#suggestHouseBtn');
        await p.waitForSelector('#kfForm');
        await p.fill('#kfImageUrl', 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/P.jpg/1280px-P.jpg');
        await p.locator('#kfName').focus();
        await p.waitForTimeout(150);
        assert.match(await p.inputValue('#kfImageUrl'), /500px-P\.jpg$/);
    } finally { await ctx.close(); }
});

// ── Entfernen ────────────────────────────────────────────────────────────
//
// Löschen ist hier etwas anderes als bei einem Tagebucheintrag: der Katalog
// gehört allen. Deshalb prüfen die Tests hier vor allem, wann NICHT gelöscht
// wird.

/** Legt ein Werk an und öffnet dessen Detailseite. */
async function werkAnlegenUndOeffnen(p, id = 'der-kaiser-von-atlantis') {
    await p.click('#suggestOperaBtn');
    await p.waitForSelector('#kfForm');
    await fuelleWerk(p);
    await p.click('#kfSenden');
    await p.waitForTimeout(600);
    await p.evaluate(i => { window.location.hash = `#/opera/${i}`; }, id);
    await p.waitForTimeout(700);
}

test('ein Werk aus dem Repo lässt sich nicht aus der App entfernen', { skip: fehltPlaywright }, async () => {
    // Es steht als Datei im Repo. Ein Schalter, der nichts bewirken kann,
    // gehört nicht auf die Seite.
    const { ctx, p } = await oeffne('#/operas', { admin: true });
    try {
        await p.evaluate(() => { window.location.hash = '#/opera/zauberflote'; });
        await p.waitForTimeout(800);
        assert.equal(await p.locator('#katalogLoeschenBtn').count(), 0,
            'für ein Werk aus dem Repo stand ein Entfernen-Schalter da');
    } finally { await ctx.close(); }
});

test('wer kein Admin ist, sieht keinen Entfernen-Schalter', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffne('#/operas', { admin: false });
    try {
        await p.evaluate(() => { window.location.hash = '#/opera/zauberflote'; });
        await p.waitForTimeout(800);
        assert.equal(await p.locator('#katalogLoeschenBtn').count(), 0);
    } finally { await ctx.close(); }
});

test('ein selbst angelegtes Werk lässt sich entfernen, aber erst nach Abtippen', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await oeffne('#/operas', { admin: true });
    try {
        await werkAnlegenUndOeffnen(p);
        assert.equal(await p.locator('#katalogLoeschenBtn').count(), 1, 'kein Entfernen-Schalter');

        await p.click('#katalogLoeschenBtn');
        await p.waitForSelector('#klTitel', { timeout: 5000 });

        // Gesperrt, solange der Titel nicht steht.
        assert.equal(await p.isDisabled('#klLoeschen'), true, 'der Knopf war von Anfang an offen');
        await p.fill('#klTitel', 'Der Kaiser');
        assert.equal(await p.isDisabled('#klLoeschen'), true, 'ein Teil des Titels genügte');
        await p.fill('#klTitel', 'der kaiser von atlantis');
        assert.equal(await p.isDisabled('#klLoeschen'), true, 'Kleinschreibung genügte');

        await p.fill('#klTitel', 'Der Kaiser von Atlantis');
        assert.equal(await p.isDisabled('#klLoeschen'), false, 'der richtige Titel öffnete den Knopf nicht');

        const vorher = await p.evaluate(async () => (await import('/src/data/operas.js')).operas.length);
        await p.click('#klLoeschen');
        await p.waitForTimeout(600);

        assert.deepEqual(await p.evaluate(() => window.__geloescht),
            [{ tabelle: 'catalog_operas', id: 'der-kaiser-von-atlantis' }]);
        const nachher = await p.evaluate(async () => (await import('/src/data/operas.js')).operas.length);
        assert.equal(nachher, vorher - 1, 'der Katalog schrumpfte nicht mit');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('hängt ein geloggter Abend daran, wird nicht gelöscht', { skip: fehltPlaywright }, async () => {
    // Der Abend stünde sonst im Tagebuch eines anderen und zeigte auf ein
    // Werk, das es nicht mehr gibt.
    const { ctx, p } = await oeffne('#/operas', { admin: true });
    try {
        await p.evaluate(() => { window.__verweise = { besuche: 3, markierungen: 0, listen: 0 }; });
        await werkAnlegenUndOeffnen(p);
        await p.click('#katalogLoeschenBtn');
        await p.waitForTimeout(400);

        assert.match(await p.textContent('#klStand'), /3 geloggte Abende/);
        assert.equal(await p.locator('#klTitel').count(), 0, 'das Eingabefeld stand trotzdem da');
        assert.equal(await p.isDisabled('#klLoeschen'), true);
        assert.deepEqual(await p.evaluate(() => window.__geloescht), []);
    } finally { await ctx.close(); }
});

test('auch eine einzelne Gesehen-Markierung hält den Eintrag', { skip: fehltPlaywright }, async () => {
    // Sie gehört jemand anderem, und niemand außer der Datenbank kann sie
    // sehen – deshalb wird sie überhaupt gezählt.
    const { ctx, p } = await oeffne('#/operas', { admin: true });
    try {
        await p.evaluate(() => { window.__verweise = { besuche: 0, markierungen: 1, listen: 0 }; });
        await werkAnlegenUndOeffnen(p);
        await p.click('#katalogLoeschenBtn');
        await p.waitForTimeout(400);

        assert.match(await p.textContent('#klStand'), /1 Gesehen-Markierung/);
        assert.deepEqual(await p.evaluate(() => window.__geloescht), []);
    } finally { await ctx.close(); }
});

test('scheitert die Zählung, wird nichts entfernt', { skip: fehltPlaywright }, async () => {
    // Im Zweifel nicht löschen: eine fehlgeschlagene Zählung ist keine Null.
    const { ctx, p } = await oeffne('#/operas', { admin: true });
    try {
        await p.evaluate(() => { window.__verweiseFehler = 'Netz weg'; });
        await werkAnlegenUndOeffnen(p);
        await p.click('#katalogLoeschenBtn');
        await p.waitForTimeout(400);

        assert.match(await p.textContent('#klFehler'), /Es wird nichts entfernt/);
        assert.equal(await p.isDisabled('#klLoeschen'), true);
        assert.deepEqual(await p.evaluate(() => window.__geloescht), []);
    } finally { await ctx.close(); }
});

test('lehnt die Datenbank das Löschen ab, bleibt der Eintrag im Katalog', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffne('#/operas', { admin: true });
    try {
        await p.evaluate(() => { window.__deleteFehler = 'new row violates row-level security policy'; });
        await werkAnlegenUndOeffnen(p);
        const vorher = await p.evaluate(async () => (await import('/src/data/operas.js')).operas.length);

        await p.click('#katalogLoeschenBtn');
        await p.waitForSelector('#klTitel');
        await p.fill('#klTitel', 'Der Kaiser von Atlantis');
        await p.click('#klLoeschen');
        await p.waitForTimeout(500);

        assert.match(await p.textContent('#klFehler'), /Entfernen fehlgeschlagen/);
        const nachher = await p.evaluate(async () => (await import('/src/data/operas.js')).operas.length);
        assert.equal(nachher, vorher, 'der Eintrag verschwand trotz Fehlschlag aus dem Katalog');
    } finally { await ctx.close(); }
});
