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

async function rueckblick({ dauer = '60s', bewegung = 'no-preference', teilen = false, besuche = BESUCHE } = {}) {
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
    }, [besuche, teilen]);
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

// Die Vorhangteile der Schlussfolie, die gerade laufen.
const vorhangLaeuft = p => p.evaluate(() => document.getAnimations()
    .filter(a => a.effect?.target?.closest?.('.story__vorhang'))
    .map(a => a.animationName).sort());

// Geschlossen: links bündig, rechts bündig, in der Mitte keine Lücke.
const vorhangZu = p => p.evaluate(() => {
    const b = document.querySelector('.story__buehne').getBoundingClientRect();
    const l = document.querySelector('.story__vorhang-teil--links').getBoundingClientRect();
    const r = document.querySelector('.story__vorhang-teil--rechts').getBoundingClientRect();
    return l.left <= b.left + 1 && r.right >= b.right - 1 && l.right >= r.left;
});

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
        // Am Schluss fährt der Vorhang zu – und steht danach geschlossen.
        assert.deepEqual(await vorhangLaeuft(p), ['storyBogen', 'storyEinblenden', 'storyVorhangLinks', 'storyVorhangRechts']);
        await p.waitForFunction(() => !document.getAnimations().some(a => a.effect?.target?.closest?.('.story__vorhang')), null, { timeout: 5000 });
        assert.equal(await vorhangZu(p), true);
        assert.equal(await nr(p), folien - 1);
        // Text und Knöpfe liegen über dem Vorhang, nicht dahinter – auch wenn
        // ihr Hereinschweben vorbei ist. Der Vorhang lässt Klicks durch; zum
        // Nachsehen wird er kurz greifbar gemacht.
        await p.waitForFunction(() => !document.getAnimations().some(a => a.effect?.target?.closest?.('.story__folie')), null, { timeout: 8000 });
        assert.equal(await p.evaluate(() => {
            document.querySelectorAll('.story__vorhang, .story__vorhang > *').forEach(e => { e.style.pointerEvents = 'auto'; });
            const k = document.querySelector('.story__teilen').getBoundingClientRect();
            const oben = document.elementFromPoint(k.left + k.width / 2, k.top + k.height / 2);
            document.querySelectorAll('.story__vorhang, .story__vorhang > *').forEach(e => { e.style.pointerEvents = ''; });
            return !!oben?.closest('.story__teilen');
        }), true);
        assert.match(await p.textContent('.story__folie'), /Bis zur nächsten Spielzeit/);
        assert.equal(await p.textContent('.story__kicker'), 'Das war 2025/26');
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
    const { ctx, p, fehler, folien } = await rueckblick({ dauer: '100ms', bewegung: 'reduce' });
    try {
        await p.click('#storyBtn');
        await p.waitForTimeout(700);
        assert.equal(await nr(p), 0);
        await p.click('.story__zone--weiter');
        assert.equal(await nr(p), 1);
        // Der Vorhang ist am Schluss gleich zu, ohne zu fahren.
        for (let i = 2; i < folien; i++) await p.keyboard.press('ArrowRight');
        assert.equal(await nr(p), folien - 1);
        assert.deepEqual(await vorhangLaeuft(p), []);
        assert.equal(await vorhangZu(p), true);
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

// Musik (src/components/StoryMusik.js): beginnt mit dem Öffnen, hält beim
// Gedrückthalten an, der Knopf neben ✕ schaltet sie ab, und das merkt sich
// das Gerät. Schließen blendet aus und hält an.
const musikLaeuft = p => p.waitForFunction(() => {
    const a = document.querySelector('.story__musik');
    return a && !a.paused && a.currentTime > 0.3;
}, null, { timeout: 10000 });
const musikSteht = p => p.waitForFunction(() => document.querySelector('.story__musik')?.paused === true, null, { timeout: 5000 });

test('Story: Musik läuft, hält beim Halten an, der Ton-Knopf schaltet sie ab – auch beim nächsten Mal', { skip: fehltPlaywright, timeout: 90000 }, async () => {
    const { ctx, p, fehler } = await rueckblick();
    try {
        await p.click('#storyBtn');
        assert.equal(await p.getAttribute('.story__musik', 'src'), 'audio/cavalleria-intermezzo.mp3');
        await musikLaeuft(p);
        assert.equal(await p.getAttribute('.story__ton', 'aria-pressed'), 'true');

        const box = await p.locator('.story__zone--weiter').boundingBox();
        await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await p.mouse.down();
        await musikSteht(p);
        await p.mouse.up();
        await musikLaeuft(p);

        // Ton aus: Musik steht, die Folie bleibt, das Gerät merkt es sich.
        await p.click('.story__ton');
        assert.equal(await p.getAttribute('.story__ton', 'aria-pressed'), 'false');
        await musikSteht(p);
        assert.equal(await nr(p), 0);
        assert.equal(await p.evaluate(() => localStorage.getItem('opernlog_story_ton')), 'aus');

        await p.keyboard.press('Escape');
        await p.waitForSelector('.story', { state: 'detached' });
        await p.click('#storyBtn');
        assert.equal(await p.getAttribute('.story__ton', 'aria-pressed'), 'false');
        await p.waitForTimeout(800);
        assert.equal(await p.evaluate(() => document.querySelector('.story__musik').paused), true);

        await p.click('.story__ton');
        await musikLaeuft(p);
        assert.equal(await p.evaluate(() => localStorage.getItem('opernlog_story_ton')), null);

        // Schließen: erst ausblenden – die Musik läuft noch kurz –, dann
        // anhalten und weg.
        await p.evaluate(() => { window.__musik = document.querySelector('.story__musik'); });
        await p.keyboard.press('Escape');
        // Ein <audio>, das aus der Seite fällt, hält der Browser nach ein
        // paar Millisekunden an; die Ausblende dauert 800.
        await p.waitForTimeout(300);
        assert.equal(await p.evaluate(() => !document.querySelector('.story') && !window.__musik.paused), true, 'blendet aus statt abzubrechen');
        await p.waitForFunction(() => window.__musik.paused && !window.__musik.isConnected, null, { timeout: 5000 });
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Story: am Schluss der Nachweis der Musik, er führt zu den Bildnachweisen', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler, folien } = await rueckblick();
    try {
        await p.click('#storyBtn');
        for (let i = 1; i < folien; i++) await p.keyboard.press('ArrowRight');
        const nachweis = await p.textContent('.story__musiknachweis');
        assert.match(nachweis, /Pietro Mascagni, Cavalleria rusticana, Intermezzo sinfonico/);
        assert.match(nachweis, /Fulda Symphonic Orchestra, Leitung Simon Schindler \(2002\)/);
        assert.match(nachweis, /EFF Open Audio License 1\.0/);

        await p.click('.story__musiknachweis');
        await p.waitForSelector('.story', { state: 'detached' });
        assert.equal(await p.evaluate(() => location.hash), '#/bildnachweise');
        const musik = p.locator('.nachweise', { has: p.locator('.nachweise__titel', { hasText: 'Musik' }) });
        await musik.waitFor();
        assert.match(await musik.textContent(), /Fulda Symphonic Orchestra/);
        const links = await musik.locator('a').evaluateAll(as => as.map(a => a.href));
        assert.ok(links.some(h => h.includes('eff_oal_1.0')), 'Link zur Lizenz');
        assert.ok(links.some(h => h.includes('commons.wikimedia.org/wiki/File:Pietro_Mascagni')), 'Link zur Quelle');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

// Stammhaus und Komponist zeigen ihr Bild rund und blass hinter dem Text,
// "Zwischen den Häusern" den Weg als Linie (Jonas, 3.10.2026).
test('Story: Stammhaus und Komponist mit rundem Bild im Hintergrund, der Weg als Linie', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler, folien } = await rueckblick();
    try {
        await p.click('#storyBtn');
        const gesehen = {};
        for (let i = 0; i < folien; i++) {
            const kicker = (await p.textContent('.story__kicker')).trim();
            gesehen[kicker] = await p.evaluate(() => {
                const bild = document.querySelector('.story__folie > .story__bild');
                const grafik = document.querySelector('.story__folie > .story__grafik');
                const stil = bild && getComputedStyle(bild);
                return {
                    bild: bild ? { url: stil.backgroundImage, rund: stil.borderRadius, hinten: stil.zIndex, breite: bild.getBoundingClientRect().width } : null,
                    halte: grafik ? [...grafik.querySelectorAll('.reiseweg__halt')].map(c => c.dataset.haus) : null,
                    boegen: grafik ? (grafik.querySelector('.reiseweg__linie').getAttribute('d').match(/Q/g) || []).length : null,
                };
            });
            await p.keyboard.press('ArrowRight');
        }
        const stammhaus = gesehen['Dein Stammhaus'];
        assert.match(stammhaus.bild.url, /Semperoper/i);
        assert.equal(stammhaus.bild.rund, '50%');
        assert.equal(stammhaus.bild.hinten, '-1');
        assert.ok(stammhaus.bild.breite <= 200, `nicht zu groß: ${stammhaus.bild.breite}px`);
        assert.match(gesehen['Komponist der Saison'].bild.url, /Puccini/i);
        assert.deepEqual(gesehen['Zwischen den Häusern'].halte.sort(), ['oper-leipzig', 'semperoper']);
        assert.equal(gesehen['Zwischen den Häusern'].boegen, 2);
        // Die übrigen Folien bleiben ohne Bild.
        assert.equal(gesehen['Dein Schnitt'].bild, null);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

// "Dein Schnitt" (Jonas, 3.10.2026: "etwas karg"): fünf Sterne, gefüllt bis
// zum Schnitt, darunter die Verteilung in halben Sternen.
test('Story: Dein Schnitt mit Sternen bis zum Schnitt und der Verteilung der Bewertungen', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler } = await rueckblick();
    try {
        await p.click('#storyBtn');
        while (!(await p.textContent('.story__kicker')).includes('Dein Schnitt')) await p.keyboard.press('ArrowRight');
        // 5, 4 und 3 Sterne: Schnitt 4,0 – vier volle, ein leerer.
        assert.equal((await p.textContent('.story__wert')).trim(), '4,0');
        const anteile = await p.$$eval('.story-sterne__stern', els => els.map(e => e.style.getPropertyValue('--anteil').trim()));
        assert.deepEqual(anteile, ['1.00', '1.00', '1.00', '1.00', '0.00']);
        const balken = await p.$$eval('.story-verteilung__balken', els => els.map(e => [e.dataset.stufe, e.textContent.trim()]));
        assert.deepEqual(balken, [['0.5', ''], ['1', ''], ['1.5', ''], ['2', ''], ['2.5', ''], ['3', '1'], ['3.5', ''], ['4', '1'], ['4.5', ''], ['5', '1']]);
        assert.deepEqual(await p.$$eval('.story-verteilung__achse span', els => els.map(e => e.textContent)), ['1★', '2★', '3★', '4★', '5★']);
        // Jede Zahl steht innerhalb des Diagramms über ihrer Säule – auch über
        // der höchsten. Ragte sie hinaus, schnitt Safari sie ab.
        assert.equal(await p.evaluate(() => {
            const kasten = document.querySelector('.story-verteilung').getBoundingClientRect();
            return [...document.querySelectorAll('.story-verteilung__balken i')].every((zahl) => {
                const z = zahl.getBoundingClientRect();
                const saeule = (zahl.parentElement.querySelector('.story-verteilung__saeule') || zahl.parentElement).getBoundingClientRect();
                return z.top >= kasten.top - 0.5 && z.bottom <= saeule.top + 0.5;
            });
        }), true);
        // Die Balken stehen unter dem Text, nicht dahinter.
        assert.equal(await p.evaluate(() => document.querySelector('.story-verteilung').getBoundingClientRect().top
            > document.querySelector('.story__notiz').getBoundingClientRect().bottom), true);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('Story: ein krummer Schnitt füllt den letzten Stern nur zum Teil', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const besuche = BESUCHE.map((b, i) => ({ ...b, rating: [4.5, 4, 3][i] }));
    const { ctx, p } = await rueckblick({ besuche });
    try {
        await p.click('#storyBtn');
        while (!(await p.textContent('.story__kicker')).includes('Dein Schnitt')) await p.keyboard.press('ArrowRight');
        assert.equal((await p.textContent('.story__wert')).trim(), '3,8');
        const anteile = await p.$$eval('.story-sterne__stern', els => els.map(e => e.style.getPropertyValue('--anteil').trim()));
        assert.deepEqual(anteile, ['1.00', '1.00', '1.00', '0.83', '0.00']);
        const balken = await p.$$eval('.story-verteilung__balken', els => els.filter(e => e.textContent.trim()).map(e => e.dataset.stufe));
        assert.deepEqual(balken, ['3', '4', '4.5']);
    } finally { await ctx.close(); }
});

// "Dein dichtester Monat" (Jonas, 3.10.2026: "etwas leer"): das
// Kalenderblatt des Monats, die Abende rot eingekreist.
test('Story: dichtester Monat als Kalenderblatt, die Abende eingekreist', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const besuche = [
        ...BESUCHE,
        { id: 'aaaaaaaa-1111-4000-8000-000000000004', user_id: UID, opera_id: 'aida', house_id: 'semperoper', date: '2026-03-07', rating: 4 },
        { id: 'aaaaaaaa-1111-4000-8000-000000000005', user_id: UID, opera_id: 'tosca', house_id: 'semperoper', date: '2026-03-21', rating: 4 },
    ];
    const { ctx, p, fehler } = await rueckblick({ besuche });
    try {
        await p.click('#storyBtn');
        while (!(await p.textContent('.story__kicker')).includes('Dein dichtester Monat')) await p.keyboard.press('ArrowRight');
        assert.equal((await p.textContent('.story__wert')).trim(), 'März 2026');
        const tage = await p.$$eval('.kalenderblatt__tag', els => els.map(e => e.textContent.trim()));
        assert.equal(tage.length, 31);
        // Der 1. März 2026 ist ein Sonntag: letzte Spalte.
        assert.equal(await p.$eval('.kalenderblatt__tag', e => e.style.gridColumnStart), '7');
        assert.deepEqual(await p.$$eval('.kalenderblatt__tag--abend', els => els.map(e => e.dataset.tag)), ['7', '21']);
        assert.equal(await p.locator('.kalenderblatt__tag--abend svg path[pathLength="1"]').count(), 2);
        // Das Blatt steht unter dem Text.
        assert.equal(await p.evaluate(() => document.querySelector('.kalenderblatt').getBoundingClientRect().top
            > document.querySelector('.story__notiz').getBoundingClientRect().bottom), true);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});
