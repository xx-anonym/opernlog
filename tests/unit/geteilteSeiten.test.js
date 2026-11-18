// Die geteilten Seiten /abend/<id> und /rueckblick/<nutzer>/<jahr>
// (api/abend.mjs, api/rueckblick.mjs): auf dem Server gebaut, mit
// Linkvorschau, ohne Konto lesbar, nicht für Suchmaschinen.
//
// Die Datenbank wird hier durch eine Attrappe für fetch ersetzt.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as abend from '../../api/abend.mjs';
import * as rueckblick from '../../api/rueckblick.mjs';
import { sterneZeichen, maske } from '../../api/_gemeinsam.mjs';

const UID = '11111111-1111-4111-8111-111111111111';
const ABEND = 'aaaaaaaa-1111-4000-8000-000000000001';
const BESUCHE = [
    { id: ABEND, user_id: UID, opera_id: 'tosca', house_id: 'semperoper', date: '2026-05-01', rating: 4.5,
        review: 'Ein Abend, der <b>lange</b> nachklingt.', conductor: 'Christian Thielemann', director: null,
        cast_list: 'Anna Netrebko (Tosca)\nScarpia: Ludovic Tézier' },
    { id: 'aaaaaaaa-1111-4000-8000-000000000002', user_id: UID, opera_id: 'aida', house_id: 'oper-leipzig', date: '2026-02-11', rating: 3 },
    { id: 'aaaaaaaa-1111-4000-8000-000000000003', user_id: UID, opera_id: 'tosca', house_id: 'oper-leipzig', date: '2024-11-01', rating: 5 },
];

/** fetch-Attrappe: beantwortet die Abfragen der Seiten aus BESUCHE. */
function attrappe({ besuche = BESUCHE, name = 'Opernfreundin' } = {}) {
    const gefragt = [];
    const abruf = async (url, optionen) => {
        gefragt.push({ url, optionen });
        const u = new URL(url);
        const tabelle = u.pathname.split('/').pop();
        const filter = (feld) => u.searchParams.get(feld)?.replace(/^eq\./, '');
        let daten = [];
        if (tabelle === 'visits') {
            daten = besuche.filter(b => (!filter('id') || b.id === filter('id')) && (!filter('user_id') || b.user_id === filter('user_id')));
        } else if (tabelle === 'profiles') {
            daten = filter('id') === UID ? [{ username: name }] : [];
        }
        return new Response(JSON.stringify(daten), { status: 200 });
    };
    return { abruf, gefragt };
}

const titel = html => html.match(/<title>([^<]*)<\/title>/)[1];
const meta = (html, eigenschaft) => html.match(new RegExp(`<meta (?:property|name)="${eigenschaft}" content="([^"]*)"`))?.[1];

test('Abend: Titel und Vorschau nennen Werk, Haus und Sterne', async () => {
    const { abruf } = attrappe();
    const r = await abend.seiteFuer(ABEND, { abruf });
    assert.equal(r.status, 200);
    const html = await r.text();
    assert.equal(titel(html), 'Tosca – Semperoper, Dresden · ★★★★½ | OpernLog');
    assert.equal(meta(html, 'og:title'), titel(html));
    assert.match(meta(html, 'og:description'), /^„Ein Abend, der &lt;b&gt;lange&lt;\/b&gt; nachklingt\.“ – Opernfreundin auf OpernLog$/);
    assert.equal(meta(html, 'og:url'), `https://opernlog.de/abend/${ABEND}`);
    assert.match(meta(html, 'og:image'), /^https:\/\//);
});

test('Abend: Review, Besetzung und Name stehen da, maskiert', async () => {
    const html = await (await abend.seiteFuer(ABEND, attrappe())).text();
    assert.match(html, /Ein Abend von <strong>Opernfreundin<\/strong>/);
    assert.match(html, /<blockquote class="review">Ein Abend, der &lt;b&gt;lange&lt;\/b&gt; nachklingt\.<\/blockquote>/);
    assert.doesNotMatch(html, /<b>lange<\/b>/);
    assert.match(html, /<dt>Dirigent<\/dt><dd>Christian Thielemann<\/dd>/);
    assert.doesNotMatch(html, /<dt>Regie<\/dt>/);
    assert.match(html, /Anna Netrebko <span class="ort">Tosca<\/span>/);
    assert.match(html, /Ludovic Tézier <span class="ort">Scarpia<\/span>/);
    assert.match(html, /Freitag, 1\. Mai 2026/);
    assert.match(html, /href="\/oper\/tosca\/"/);
    assert.match(html, /href="\/haus\/semperoper\/"/);
});

test('Abend: Knopf und Weiterleitung führen in die App zum Eintrag', async () => {
    const html = await (await abend.seiteFuer(ABEND, attrappe())).text();
    assert.match(html, new RegExp(`<a class="knopf" href="/#/visit/${ABEND}">In OpernLog öffnen</a>`));
    // Angemeldete (Sitzung im localStorage) gehen gleich weiter.
    assert.match(html, /localStorage\.getItem\("sb-gqdblqymteclmdlushox-auth-token"\)/);
    assert.match(html, new RegExp(`location\\.replace\\("/#/visit/${ABEND}"\\)`));
});

test('nicht für Suchmaschinen, kurz zwischengespeichert', async () => {
    const r = await abend.seiteFuer(ABEND, attrappe());
    assert.equal(r.headers.get('x-robots-tag'), 'noindex');
    assert.match(r.headers.get('content-type'), /^text\/html/);
    assert.match(r.headers.get('cache-control'), /s-maxage=300/);
    assert.match(await r.text(), /<meta name="robots" content="noindex">/);
});

test('Abend: kaputte oder unbekannte Id gibt 404, ohne die Datenbank mit Unsinn zu fragen', async () => {
    const a = attrappe();
    assert.equal((await abend.seiteFuer('1 or 1=1', a)).status, 404);
    assert.equal((await abend.seiteFuer(undefined, a)).status, 404);
    assert.equal(a.gefragt.length, 0);
    assert.equal((await abend.seiteFuer('aaaaaaaa-1111-4000-8000-0000000000ff', a)).status, 404);
});

test('gelesen wird mit dem öffentlichen Schlüssel, nichts anderes', async () => {
    const a = attrappe();
    await abend.seiteFuer(ABEND, a);
    for (const { url, optionen } of a.gefragt) {
        assert.ok(url.startsWith('https://gqdblqymteclmdlushox.supabase.co/rest/v1/'), url);
        const rolle = JSON.parse(Buffer.from(optionen.headers.apikey.split('.')[1], 'base64url')).role;
        assert.equal(rolle, 'anon');
    }
    // Keine Fotos: die Tabelle der Momentaufnahmen wird nie gefragt.
    assert.ok(!a.gefragt.some(g => /andenken/.test(g.url)));
});

test('Abend ohne Review: die Vorschau sagt, wer wann wo war', async () => {
    const html = await (await abend.seiteFuer('aaaaaaaa-1111-4000-8000-000000000002', attrappe())).text();
    assert.equal(meta(html, 'og:description'), 'Opernfreundin war am Mittwoch, 11. Februar 2026 in Aida (Oper Leipzig). Auf OpernLog.');
    assert.doesNotMatch(html, /blockquote/);
});

test('Rückblick: Zahlen, Werke und Häuser der Spielzeit, ohne Abende anderer Spielzeiten', async () => {
    const r = await rueckblick.seiteFuer(UID, '2025', attrappe());
    assert.equal(r.status, 200);
    const html = await r.text();
    assert.equal(titel(html), 'Spielzeit 2025/26 von Opernfreundin: 2 Abende · 2 Werke · 2 Häuser | OpernLog');
    assert.match(html, /<a href="\/oper\/tosca\/">Tosca<\/a>/);
    assert.match(html, /<a href="\/oper\/aida\/">Aida<\/a>/);
    assert.match(html, /<a href="\/haus\/semperoper\/">/);
    // Tosca 2024 in Leipzig gehört zur Spielzeit davor.
    assert.doesNotMatch(html, /Tosca<\/a>[^<]*<span class="ort">[^<]*<\/span> <span class="anzahl">2×/);
    assert.equal(meta(html, 'og:url'), `https://opernlog.de/rueckblick/${UID}/2025`);
});

test('Rückblick: in die App weiter nur für die Person selbst', async () => {
    const html = await (await rueckblick.seiteFuer(UID, '2025', attrappe())).text();
    // Der Knopf führt alle anderen auf die Startseite – ein fremder
    // Rückblick ist in der App nicht zu sehen.
    assert.match(html, /<a class="knopf" href="\/">OpernLog öffnen<\/a>/);
    assert.ok(html.includes(`"${UID}" === 'immer' || id === "${UID}"`));
    assert.ok(html.includes('location.replace("/#/season/2025")'));
});

test('Rückblick: leere Spielzeit, kaputte Angaben: 404', async () => {
    const a = attrappe();
    assert.equal((await rueckblick.seiteFuer(UID, '1990', a)).status, 404);
    assert.equal((await rueckblick.seiteFuer('nix', '2025', a)).status, 404);
    assert.equal((await rueckblick.seiteFuer(UID, '25', a)).status, 404);
});

test('Sterne als Zeichen, halbe als ½', () => {
    assert.equal(sterneZeichen(4), '★★★★☆');
    assert.equal(sterneZeichen(4.5), '★★★★½');
    assert.equal(sterneZeichen(0.5), '½☆☆☆☆');
    assert.equal(sterneZeichen(7), '★★★★★');
    assert.equal(maske('<"\'&>'), '&lt;&quot;&#39;&amp;&gt;');
});

test('vercel.json leitet /abend/… und /rueckblick/… auf die Funktionen', async () => {
    const fs = await import('node:fs');
    const v = JSON.parse(fs.readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
    assert.deepEqual(v.rewrites, [
        { source: '/abend/:id', destination: '/api/abend?id=:id' },
        { source: '/rueckblick/:nutzer/:jahr', destination: '/api/rueckblick?nutzer=:nutzer&jahr=:jahr' },
    ]);
    // Und api/ wird ausgeliefert.
    const ignoriert = fs.readFileSync(new URL('../../.vercelignore', import.meta.url), 'utf8').split('\n').map(z => z.trim());
    assert.ok(!ignoriert.some(z => z === 'api/' || z === 'api' || z === 'src/' || z === 'src'));
});
