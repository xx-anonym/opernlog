// Der Feed – die Startseite.
//
// Sein Zweck ist, mitzubekommen, was die Freunde treiben. Alles andere ordnet
// sich dem unter, und die Abende Fremder erscheinen nur, solange es noch keine
// Freunde gibt. Genau diese Rangfolge prüfen die Tests hier.
//
// Was hier nicht mehr steht: "Beliebte Opern". Der Abschnitt zählte über die
// eigenen Besuche, nannte das Ergebnis "beliebt" und setzte den eigenen
// Bewertungsschnitt daneben, als käme er von der Community.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { starteServer, ladePlaywright, starteBrowser, ersetzeSupabase } from './umgebung.js';

const RECHNER = { width: 1200, height: 900 };
const ICH = '11111111-1111-1111-1111-111111111111';
const FREUND = '22222222-2222-2222-2222-222222222222';
const FREMD = '33333333-3333-3333-3333-333333333333';

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

const besuch = (id, user, opera, datum, rating) => ({
    id, user_id: user, opera_id: opera, house_id: 'semperoper', date: datum, rating,
    profiles: { id: user, username: user === FREUND ? 'Freundin' : 'Fremder', avatar_initials: 'XX', avatar_icon: null },
});

/** Öffnet den Feed mit vorgegebenen Besuchen und Folgebeziehungen. */
async function oeffneFeed({ folgt = [], besuche = [], eigene = [] } = {}) {
    const ctx = await browser.newContext({ viewport: RECHNER });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));

    await ersetzeSupabase(p);
    await p.goto(`${server.url}/index.html`);
    await p.waitForFunction(() => !!window.__visits, null, { timeout: 15000 });

    await p.evaluate(({ f, b }) => {
        window.__follows = f;
        window.__visits = b;
    }, { f: folgt, b: besuche });

    if (eigene.length) {
        await p.evaluate(v => import('/src/store/store.js').then(m => { m.store.data.myVisits = v; }), eigene);
    }

    await p.evaluate(() => { window.location.hash = '#/houses'; });
    await p.waitForTimeout(250);
    await p.evaluate(() => { window.location.hash = '#/'; });
    await p.waitForSelector('.section__title', { timeout: 15000 });
    await p.waitForTimeout(900);   // der Feed lädt nach

    return { ctx, p, fehler };
}

test('der Feed zeigt die Abende der Freunde', { skip: fehltPlaywright }, async () => {
    const { ctx, p, fehler } = await oeffneFeed({
        folgt: [{ follower_id: ICH, following_id: FREUND }],
        besuche: [besuch('f1', FREUND, 'la-traviata', '2026-05-01', 5)],
    });
    try {
        assert.match(await p.textContent('.section__title'), /Von deinen Freunden/);
        assert.ok(await p.$('.feed-list .review-card'), 'keine Karte im Feed');
        assert.equal(await p.locator('.feed-leer').count(), 0, 'trotz Freunden der Leerzustand');
        // Die Rückfallebene gehört hier nicht hin.
        assert.equal(await p.locator('.feed-sonst').count(), 0);
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('ohne Freunde stehen die letzten Abende der anderen darunter', { skip: fehltPlaywright }, async () => {
    // Vorher stand hier eine leere Kiste mit dem Rat, doch Opernfreunde zu
    // suchen – eine Startseite, auf der nichts steht.
    const { ctx, p, fehler } = await oeffneFeed({
        folgt: [],
        besuche: [besuch('x1', FREMD, 'rigoletto', '2026-04-02', 4)],
    });
    try {
        assert.ok(await p.$('.feed-leer'), 'kein Hinweis auf fehlende Freunde');
        const sonst = p.locator('.feed-sonst');
        assert.equal(await sonst.count(), 1, 'keine Rückfallebene');
        assert.match(await sonst.textContent(), /nicht folgst/,
            'die Rückfallebene muss sagen, dass das keine Freunde sind');
        assert.ok(await p.$('.feed-sonst .review-card'), 'keine fremde Karte');
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});

test('die eigenen Abende stehen nicht im Feed', { skip: fehltPlaywright }, async () => {
    // Sie stehen im Tagebuch. Früher füllte store.getFeed() den Feed mit ihnen
    // – unter "Dein Feed" fiel das nicht auf, unter "Von deinen Freunden" wäre
    // es gelogen.
    const { ctx, p } = await oeffneFeed({
        folgt: [],
        besuche: [besuch('m1', ICH, 'aida', '2026-03-03', 5)],
    });
    try {
        assert.ok(await p.$('.feed-leer'), 'die eigenen Abende wurden als Freundes-Feed ausgegeben');
        assert.equal(await p.locator('.feed-sonst .review-card').count(), 0,
            'der eigene Abend steht in der Rückfallebene');
    } finally { await ctx.close(); }
});

test('der Kopf zeigt die laufende Spielzeit statt der Katalogzahlen', { skip: fehltPlaywright }, async () => {
    // Dort standen 92 Häuser und 121 Werke – Zahlen, die sich nie ändern.
    const jahr = new Date().getMonth() + 1 >= 8 ? new Date().getFullYear() : new Date().getFullYear() - 1;
    const { ctx, p } = await oeffneFeed({
        eigene: [
            { id: 'e1', userId: ICH, operaId: 'tosca', houseId: 'semperoper', date: `${jahr}-09-01`, rating: 4 },
            { id: 'e2', userId: ICH, operaId: 'aida', houseId: 'oper-koeln', date: `${jahr}-10-01`, rating: 2 },
        ],
    });
    try {
        assert.match(await p.textContent('.feedkopf__kicker'), /Spielzeit/);
        assert.match(await p.textContent('.feedkopf__gruss'), /2 Abende/);
        const zahlen = await p.locator('.feedkopf__zahl').allTextContents();
        assert.match(zahlen.join(' | '), /2\s*Häuser/);
        assert.match(zahlen.join(' | '), /2\s*Werke/);
        assert.match(zahlen.join(' | '), /3,0\s*Schnitt/, 'der Schnitt aus 4 und 2');
    } finally { await ctx.close(); }
});

test('"Beliebte Opern" gibt es nicht mehr', { skip: fehltPlaywright }, async () => {
    // Bei sechs Besuchen auf fünf Werke ist eine Rangliste keine Rangliste.
    // Kommt sie zurück, soll das eine Entscheidung sein und kein Versehen.
    const { ctx, p } = await oeffneFeed({
        eigene: [{ id: 'e1', userId: ICH, operaId: 'tosca', houseId: 'semperoper', date: '2026-09-01', rating: 4 }],
    });
    try {
        assert.doesNotMatch(await p.textContent('body'), /Beliebte Opern/);
    } finally { await ctx.close(); }
});

test('wer schon geloggt hat, bekommt Empfehlungen statt Werbetext', { skip: fehltPlaywright }, async () => {
    const { ctx, p } = await oeffneFeed({
        eigene: [
            { id: 'e1', userId: ICH, operaId: 'la-traviata', houseId: 'semperoper', date: '2026-09-01', rating: 5 },
            { id: 'e2', userId: ICH, operaId: 'rigoletto', houseId: 'semperoper', date: '2026-09-02', rating: 4 },
        ],
    });
    try {
        const text = await p.textContent('body');
        assert.match(text, /Was dir noch fehlt/, 'die blinden Flecken fehlen');
        assert.doesNotMatch(text, /Willkommen bei/, 'der Willkommensgruß ist für den ersten Start');
    } finally { await ctx.close(); }
});
