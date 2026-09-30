// Andenken: Fotos auf der Seite eines Abends. Hochladen verkleinert auf
// höchstens 1600 px und schreibt ein JPEG; neu ist ein Foto privat. Die
// Fotos stehen als Mosaik in der Karte, vor Gefällt-mir; Schalter und
// Löschen gibt es erst in der Vergrößerung, dort blättert man auch. Bei
// fremden Abenden nur die öffentlichen, ohne Knöpfe. Wer einen Abend löscht,
// löscht auch die Dateien seiner Fotos.

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
    { id: MEIN_ABEND, user_id: UID, opera_id: 'tosca', house_id: 'semperoper', date: '2026-05-01', rating: 4 },
    { id: FREMDER_ABEND, user_id: FREMD, opera_id: 'aida', house_id: 'oper-leipzig', date: '2026-04-01', rating: 5 },
];
const pfad = (nutzer, abend, id) => `${nutzer}/${abend}/${id}.jpg`;
const foto = (id, nutzer, abend, oeffentlich) => ({ id, user_id: nutzer, visit_id: abend, pfad: pfad(nutzer, abend, id), oeffentlich });

async function oeffne(hash, { andenken = [], speicher = {}, bild = null } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    await p.addInitScript(([b, a, s, bild]) => {
        window.__besucheVorgabe = b; window.__andenkenVorgabe = a; window.__speicherVorgabe = s;
        if (bild) window.__bildAdresse = bild;
    }, [BESUCHE, andenken, speicher, bild]);
    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html${hash}`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await vorhangAuf(p);
    return { ctx, p, fehler };
}

// Ein Bild mit Fläche für die Vergrößerung – über das 1×1-Pixel, das der
// Speicher-Ersatz sonst ausgibt, lässt sich nicht wischen.
const BILD = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><rect width='400' height='300' fill='%23844'/></svg>";

/** Mit der Maus über das vergrößerte Foto nach links ziehen. */
async function wischen(p) {
    const box = await p.locator('.andenken-gross img').boundingBox();
    const y = box.y + box.height / 2;
    await p.mouse.move(box.x + box.width * 0.8, y);
    await p.mouse.down();
    await p.mouse.move(box.x + box.width * 0.2, y, { steps: 5 });
    await p.mouse.up();
}

/** Ein großes PNG ins Dateifeld, wie aus der Fotoauswahl. */
async function fotoWaehlen(p, breite = 2400, hoehe = 1200) {
    await p.evaluate(async ([b, h]) => {
        const c = document.createElement('canvas');
        c.width = b; c.height = h;
        c.getContext('2d').fillRect(0, 0, 10, 10);
        const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        const dt = new DataTransfer();
        dt.items.add(new File([blob], 'applaus.png', { type: 'image/png' }));
        // Auf der Seite des Abends oder im Log-Formular – es gibt je eins.
        const feld = document.querySelector('.andenken__neu input');
        feld.files = dt.files;
        feld.dispatchEvent(new Event('change', { bubbles: true }));
    }, [breite, hoehe]);
}

test('eigener Abend: Foto hochladen – verkleinert, als JPEG, privat', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne(`#/visit/${MEIN_ABEND}`);
    try {
        await p.waitForSelector('.andenken__neu input');
        await fotoWaehlen(p);
        await p.waitForFunction(() => window.__andenken.length === 1);
        const [zeile] = await p.evaluate(() => window.__andenken);
        assert.match(zeile.pfad, new RegExp(`^${UID}/${MEIN_ABEND}/[0-9a-f-]{36}\\.jpg$`));
        assert.equal(zeile.pfad, pfad(UID, MEIN_ABEND, zeile.id));
        assert.deepEqual([zeile.breite, zeile.hoehe], [1600, 800]);
        assert.equal(zeile.oeffentlich, false);
        const datei = await p.evaluate(pf => window.__speicher[pf], zeile.pfad);
        assert.deepEqual([datei.typ, datei.blobTyp], ['image/jpeg', 'image/jpeg']);

        await p.waitForSelector('.andenken__foto img');
        // Privat: kein Globus auf der Kachel, in der Vergrößerung "Privat".
        assert.equal(await p.locator('.andenken__marke').count(), 0);
        await p.click('.andenken__oeffnen');
        assert.equal(await p.getAttribute('.andenken-gross__sicht', 'aria-pressed'), 'false');
        // In der Oberfläche heißen sie Momentaufnahmen.
        assert.equal((await p.textContent('.andenken__titel')).trim(), 'Momentaufnahmen');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('eigener Abend: öffentlich schalten, dann löschen – Datei und Zeile weg', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const f = foto('cccccccc-3333-4000-8000-000000000003', UID, MEIN_ABEND, false);
    const { ctx, p, fehler } = await oeffne(`#/visit/${MEIN_ABEND}`, { andenken: [f], speicher: { [f.pfad]: { typ: 'image/jpeg' } } });
    try {
        await p.waitForSelector('.andenken__foto img');
        assert.equal(await p.locator('.andenken__marke').count(), 0);
        await p.click('.andenken__oeffnen');
        await p.click('.andenken-gross__sicht[aria-pressed="false"]');
        await p.waitForSelector('.andenken-gross__sicht[aria-pressed="true"]');
        assert.equal(await p.evaluate(() => window.__andenken[0].oeffentlich), true);
        // Das Mosaik darunter zeigt jetzt den Globus.
        assert.equal(await p.locator('.andenken__mosaik .andenken__marke').count(), 1);

        p.on('dialog', d => d.accept());
        await p.click('.andenken-gross__weg');
        await p.waitForFunction(() => window.__andenken.length === 0);
        assert.deepEqual(await p.evaluate(() => window.__speicherGeloescht), [f.pfad]);
        // Das letzte Foto ist weg: Vergrößerung zu, Mosaik leer.
        await p.waitForSelector('.andenken-gross', { state: 'detached' });
        await p.waitForSelector('.andenken__foto', { state: 'detached' });
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('fremder Abend: nur die öffentlichen Fotos, keine Knöpfe', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const oeffentlich = foto('dddddddd-4444-4000-8000-000000000004', FREMD, FREMDER_ABEND, true);
    const privat = foto('eeeeeeee-5555-4000-8000-000000000005', FREMD, FREMDER_ABEND, false);
    const { ctx, p, fehler } = await oeffne(`#/visit/${FREMDER_ABEND}`, { andenken: [oeffentlich, privat], bild: BILD });
    try {
        await p.waitForSelector('.andenken__foto');
        assert.deepEqual(await p.$$eval('.andenken__foto', fs => fs.map(f => f.dataset.id)), [oeffentlich.id]);
        assert.equal(await p.locator('.andenken__sicht, .andenken__weg, .andenken__neu').count(), 0);

        // Antippen vergrößert – ohne Knöpfe. Wischen bei nur einem Foto
        // blättert nicht und schließt auch nicht; erst Tippen schließt.
        await p.click('.andenken__oeffnen');
        await p.waitForSelector('.andenken-gross img');
        assert.equal(await p.locator('.andenken-gross__knopf').count(), 0);
        await wischen(p);
        assert.equal(await p.locator('.andenken-gross').count(), 1);
        await p.click('.andenken-gross img');
        await p.waitForSelector('.andenken-gross', { state: 'detached' });
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('fremder Abend ohne öffentliche Fotos: kein Abschnitt', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const privat = foto('eeeeeeee-5555-4000-8000-000000000005', FREMD, FREMDER_ABEND, false);
    const { ctx, p } = await oeffne(`#/visit/${FREMDER_ABEND}`, { andenken: [privat] });
    try {
        await p.waitForSelector('.review-card');
        await p.waitForFunction(() => document.querySelector('.andenken')?.hidden === true);
    } finally { await ctx.close(); }
});

test('sechs Fotos: kein Knopf für ein siebtes', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const sechs = Array.from({ length: 6 }, (_, i) => foto(`ffffffff-6666-4000-8000-00000000000${i}`, UID, MEIN_ABEND, false));
    const { ctx, p } = await oeffne(`#/visit/${MEIN_ABEND}`, { andenken: sechs });
    try {
        await p.waitForFunction(() => document.querySelectorAll('.andenken__foto').length === 6);
        assert.equal(await p.locator('.andenken__neu').count(), 0);
        // Mosaik: das erste Foto doppelt so breit und hoch wie die übrigen.
        const [erstes, zweites] = await p.$$eval('.andenken__mosaik--6 .andenken__foto',
            fs => fs.slice(0, 2).map(f => f.getBoundingClientRect()).map(r => [r.width, r.height]));
        assert.ok(erstes[0] > 1.9 * zweites[0] && erstes[1] > 1.9 * zweites[1], `${erstes} gegen ${zweites}`);
    } finally { await ctx.close(); }
});

// Nicht als Anhang unter allem, sondern Teil des Abends: vor Gefällt-mir.
test('die Fotos stehen in der Karte des Abends, vor Gefällt-mir und Kommentaren', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const f = foto('cccccccc-3333-4000-8000-000000000003', FREMD, FREMDER_ABEND, true);
    const { ctx, p } = await oeffne(`#/visit/${FREMDER_ABEND}`, { andenken: [f] });
    try {
        await p.waitForSelector('.andenken__foto');
        assert.equal(await p.evaluate(() => {
            const bereich = document.querySelector('.andenken');
            return bereich.parentElement.classList.contains('review-card')
                && bereich.nextElementSibling?.classList.contains('review-card__actions');
        }), true);
    } finally { await ctx.close(); }
});

test('vergrößert: Pfeiltasten und Wischen blättern, Escape schließt', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const drei = [1, 2, 3].map(i => foto(`dddddddd-4444-4000-8000-00000000000${i}`, FREMD, FREMDER_ABEND, true));
    const { ctx, p, fehler } = await oeffne(`#/visit/${FREMDER_ABEND}`, { andenken: drei, bild: BILD });
    const zahl = () => p.textContent('.andenken-gross__zahl');
    try {
        await p.waitForFunction(() => document.querySelectorAll('.andenken__foto').length === 3);
        await p.click('.andenken__foto:nth-child(2) .andenken__oeffnen');
        assert.equal(await zahl(), '2 / 3');
        // Fremder Abend: nur die Zahl, keine Knöpfe.
        assert.equal(await p.locator('.andenken-gross__knopf').count(), 0);
        await p.keyboard.press('ArrowRight');
        assert.equal(await zahl(), '3 / 3');
        await p.keyboard.press('ArrowRight');
        assert.equal(await zahl(), '1 / 3');
        await p.keyboard.press('ArrowLeft');
        assert.equal(await zahl(), '3 / 3');

        // Nach links wischen: nächstes Foto – und die Vergrößerung bleibt offen.
        await wischen(p);
        assert.equal(await zahl(), '1 / 3');
        assert.equal(await p.locator('.andenken-gross').count(), 1);
        // Danach schließt Antippen wieder.
        await p.click('.andenken-gross img');
        await p.waitForSelector('.andenken-gross', { state: 'detached' });

        await p.click('.andenken__oeffnen');
        await p.keyboard.press('Escape');
        await p.waitForSelector('.andenken-gross', { state: 'detached' });
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('einen Abend löschen entfernt auch die Dateien seiner Fotos', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const f = foto('cccccccc-3333-4000-8000-000000000003', UID, MEIN_ABEND, true);
    const { ctx, p, fehler } = await oeffne('#/diary', { andenken: [f], speicher: { [f.pfad]: { typ: 'image/jpeg' } } });
    try {
        await p.waitForSelector('.diary-entry');
        p.on('dialog', d => d.accept());
        await p.click('.diary-entry__delete');
        await p.waitForFunction(() => window.__visits.every(v => v.user_id !== '11111111-1111-1111-1111-111111111111'));
        assert.deepEqual(await p.evaluate(() => window.__speicherGeloescht), [f.pfad]);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

// Mit dem Konto gingen nur die Zeilen; die Dateien müssen vorher weg.
test('Konto löschen: erst die eigenen Fotodateien, dann das Konto', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const meins = foto('cccccccc-3333-4000-8000-000000000003', UID, MEIN_ABEND, false);
    const fremd = foto('dddddddd-4444-4000-8000-000000000004', FREMD, FREMDER_ABEND, true);
    const { ctx, p, fehler } = await oeffne('#/', { andenken: [meins, fremd] });
    try {
        await p.evaluate(async () => {
            window.__ablauf.length = 0;
            const sb = await import('/src/store/supabase.js');
            await sb.kontoLoeschen();
        });
        assert.deepEqual(await p.evaluate(() => window.__speicherGeloescht), [meins.pfad]);
        assert.deepEqual(await p.evaluate(() => window.__ablauf), ['dateien', 'konto_loeschen']);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

// Beim Loggen gewählt, nach dem Speichern hochgeladen – an den neuen Abend.
test('beim Loggen: zwei Fotos, eines öffentlich – nach dem Speichern am neuen Abend', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await oeffne('#/log?house=semperoper&opera=tosca');
    try {
        await p.waitForSelector('.andenken--auswahl .andenken__neu input');
        assert.match(await p.textContent('.andenken--auswahl .form-label'), /Momentaufnahmen/);
        await fotoWaehlen(p);
        await p.waitForFunction(() => document.querySelectorAll('.andenken--auswahl .andenken__foto').length === 1);
        await fotoWaehlen(p, 800, 1200);
        await p.waitForFunction(() => document.querySelectorAll('.andenken--auswahl .andenken__foto').length === 2);
        await p.click('.andenken--auswahl .andenken__foto:nth-child(2) .andenken__sicht');
        await p.waitForSelector('.andenken--auswahl .andenken__foto:nth-child(2) .andenken__sicht[aria-pressed="true"]');
        // Vor dem Speichern geht nichts hoch.
        assert.equal(await p.evaluate(() => window.__andenken.length), 0);

        const stern = p.locator('#ratingWidget .star').nth(3);
        const box = await stern.boundingBox();
        await p.mouse.click(box.x + box.width * 0.75, box.y + box.height / 2);
        await p.click('#logForm button[type="submit"]');
        await p.waitForFunction(() => window.__andenken.length === 2);

        const besuch = await p.evaluate(() => window.__besuchVersuche[0]);
        const zeilen = await p.evaluate(() => window.__andenken);
        assert.deepEqual(zeilen.map(z => z.visit_id), [besuch.id, besuch.id]);
        assert.deepEqual(zeilen.map(z => z.oeffentlich), [false, true]);
        assert.deepEqual(zeilen.map(z => [z.breite, z.hoehe]), [[1600, 800], [800, 1200]]);
        assert.equal(Object.keys(await p.evaluate(() => window.__speicher)).length, 2);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('beim Bearbeiten keine Fotoauswahl – die Fotos stehen auf der Seite des Abends', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p } = await oeffne(`#/log?edit=${MEIN_ABEND}`);
    try {
        await p.waitForSelector('#logForm');
        await p.waitForTimeout(300);
        assert.equal(await p.locator('.andenken--auswahl').count(), 0);
    } finally { await ctx.close(); }
});
