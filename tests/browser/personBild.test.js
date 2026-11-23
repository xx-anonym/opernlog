// Das runde Bild im Kopf der Personenseite (src/components/PersonBild.js).
//
// Wikipedia und Commons sind nachgestellt, das Bild ist ein Pixel. Geprüft
// wird: ein passender Artikel ergibt das Bild mit Link und Bildnachweis;
// ein Namensvetter mit anderem Beruf ergibt keins, auch nicht über die
// englische Wikipedia; das Ergebnis merkt sich das Gerät.

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

const EIGENE = [
    { id: 'tosca1', userId: 'user-me', operaId: 'tosca', houseId: 'semperoper', date: '2026-10-03', rating: 4,
        conductor: 'Christian Thielemann', castList: 'Thomas Müller (Spoletta)' },
];
const BILD = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Thielemann.jpg/400px-Thielemann.jpg';
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==', 'base64');

// Was Wikipedia zu welchem Titel sagt.
const ARTIKEL = {
    'Christian Thielemann': { title: 'Christian Thielemann', description: 'deutscher Dirigent', pageimage: 'Thielemann.jpg',
        thumbnail: { source: `${BILD}?utm_source=de.wikipedia.org`, width: 400, height: 600 } },
    // Der Spoletta ist ein Tenor gleichen Namens – Wikipedia kennt nur den Fußballer.
    'Thomas Müller': { title: 'Thomas Müller', description: 'deutscher Fußballspieler', pageimage: 'Mueller.jpg',
        thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Mueller.jpg/400px-Mueller.jpg' } },
};

async function oeffne(hash, { gemerkt = null, gedrosselt = null } = {}) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 900 }, serviceWorkers: 'block' });
    const p = await ctx.newPage();
    const fehler = [];
    const anfragen = [];
    p.on('pageerror', e => fehler.push(e.message));
    await ersetzeSupabase(p);
    if (gemerkt) await p.addInitScript(([k, v]) => localStorage.setItem(k, v), gemerkt);
    await p.route('https://*.wikipedia.org/w/api.php**', (r) => {
        const url = new URL(r.request().url());
        anfragen.push(`${url.host} ${url.searchParams.get('titles')}`);
        p.evaluate(n => { window.__wpAnfragen = n; }, anfragen.length).catch(() => {});
        if (url.host === gedrosselt) return r.fulfill({ status: 429, body: 'You are making too many requests to the API.' });
        const seite = ARTIKEL[url.searchParams.get('titles')] || { title: url.searchParams.get('titles'), missing: true };
        return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ query: { pages: [{ ns: 0, ...seite }] } }) });
    });
    await p.route('https://commons.wikimedia.org/w/api.php**', r => r.fulfill({
        status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ query: { pages: { 1: { imageinfo: [{ descriptionurl: 'https://commons.wikimedia.org/wiki/File:Thielemann.jpg',
            extmetadata: { Artist: { value: 'Matthias Creutziger' }, LicenseShortName: { value: 'CC BY-SA 4.0' }, AttributionRequired: { value: 'true' } } }] } } } }),
    }));
    await p.route('https://upload.wikimedia.org/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }));
    await p.goto(`${server.url}/index.html`);
    await p.waitForFunction(() => !!window.supabase, null, { timeout: 15000 });
    await p.evaluate(v => import('/src/store/store.js').then(m => { m.store.data.myVisits = v; }), EIGENE);
    await p.evaluate(h => { window.location.hash = h; }, hash);
    await vorhangAuf(p);
    await p.waitForSelector('.person-abende');
    return { ctx, p, fehler, anfragen };
}

test('ein Dirigent mit passendem Artikel: rundes Bild im Kopf statt der Initialen, mit Beschreibung, Link und Bildnachweis', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler, anfragen } = await oeffne('#/person/christian%20thielemann');
    try {
        const bild = p.locator('.person-bild__bild');
        await bild.waitFor();
        // Im Kopf, an der Stelle der Initialen (seit 23.11.2026, vorher unter den Abenden).
        assert.equal(await p.locator('.person-hero .person-hero__bild .person-bild__bild').count(), 1);
        assert.equal(await p.locator('.person-hero__initialen').count(), 0);
        assert.equal(await bild.getAttribute('src'), BILD, 'ohne utm-Parameter, auf upload.wikimedia.org');
        assert.equal(await bild.getAttribute('alt'), 'Christian Thielemann');
        assert.equal(await bild.evaluate(e => getComputedStyle(e).borderRadius), '50%');
        assert.equal(await p.locator('.person-bild__link').getAttribute('href'), 'https://de.wikipedia.org/wiki/Christian_Thielemann');
        await p.locator('.person-bild__nachweis').waitFor();
        assert.equal(await p.locator('.person-bild__nachweis').innerText(), 'Bild: Matthias Creutziger · CC BY-SA 4.0');
        assert.match(await p.locator('.person-hero__quelle').innerText(), /Bild: Matthias Creutziger · CC BY-SA 4\.0 · Wikipedia/);
        assert.equal(await p.locator('.person-hero__beschreibung').isVisible(), true);
        // Nachgeschlagen wird der Anzeigename, gefunden in der deutschen Wikipedia.
        assert.deepEqual(anfragen, ['de.wikipedia.org Christian Thielemann']);
        assert.deepEqual(fehler, []);
    } finally {
        await ctx.close();
    }
});

test('ein Namensvetter mit anderem Beruf ergibt kein Bild, auch nicht über die englische Wikipedia', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler, anfragen } = await oeffne('#/person/Thomas%20M%C3%BCller');
    try {
        // Gemerkt wird erst nach beiden Antworten – darauf warten statt auf eine feste Zeit.
        await p.waitForFunction(() => Object.keys(localStorage).some(k => k.startsWith('opernlog:personBild:')));
        assert.deepEqual(anfragen, ['de.wikipedia.org Thomas Müller', 'en.wikipedia.org Thomas Müller']);
        assert.equal(await p.locator('.person-bild__bild').count(), 0);
        // Statt des Bildes die Initialen.
        assert.equal((await p.locator('.person-hero__initialen').innerText()).trim(), 'TM');
        // Gemerkt wird auch "kein Bild".
        const gemerkt = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('opernlog:personBild:')));
        assert.equal(gemerkt.length, 1);
        assert.deepEqual(fehler, []);
    } finally {
        await ctx.close();
    }
});

test('antwortet eine Wikipedia nicht, merkt sich das Gerät nicht "kein Bild"', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { ctx, p, fehler, anfragen } = await oeffne('#/person/Thomas%20M%C3%BCller', { gedrosselt: 'en.wikipedia.org' });
    try {
        await p.waitForFunction(n => window.__wpAnfragen >= n, 2);
        await p.waitForTimeout(300);
        assert.deepEqual(anfragen, ['de.wikipedia.org Thomas Müller', 'en.wikipedia.org Thomas Müller']);
        const gemerkt = await p.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('opernlog:personBild:')));
        assert.deepEqual(gemerkt, [], 'nach einer gedrosselten Antwort 30 Tage "kein Bild"');
        assert.deepEqual(fehler, []);
    } finally {
        await ctx.close();
    }
});

test('ein gemerktes Ergebnis fragt Wikipedia nicht noch einmal', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const treffer = { titel: 'Christian Thielemann', beschreibung: 'deutscher Dirigent', bild: BILD, seite: 'https://de.wikipedia.org/wiki/Christian_Thielemann' };
    const { ctx, p, fehler, anfragen } = await oeffne('#/person/Christian%20Thielemann', {
        gemerkt: ['opernlog:personBild:christian thielemann|Dirigat', JSON.stringify({ zeit: Date.now(), bild: treffer })],
    });
    try {
        await p.locator('.person-bild__bild').waitFor();
        assert.deepEqual(anfragen, []);
        assert.deepEqual(fehler, []);
    } finally {
        await ctx.close();
    }
});
