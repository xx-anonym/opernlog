// Auffindbar bei Google (seit 18.11.2026): robots.txt, sitemap.xml, die
// Hauptadresse und die Vorschaudaten in index.html, und opernlog.vercel.app
// soll nicht neben opernlog.de im Index landen.
//
// Fehler hier fallen niemandem auf – die App läuft weiter, nur findet sie
// keiner. Deshalb die Prüfung.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lies = (datei) => fs.readFileSync(path.join(WURZEL, datei), 'utf8');
const html = lies('index.html');

test('robots.txt lässt alles zu und nennt die Sitemap unter opernlog.de', () => {
    const r = lies('robots.txt');
    assert.match(r, /^User-agent: \*$/m);
    assert.match(r, /^Allow: \/$/m);
    assert.doesNotMatch(r, /^Disallow: \/\s*$/m);
    assert.match(r, /^Sitemap: https:\/\/opernlog\.de\/sitemap\.xml$/m);
});

test('sitemap.xml ist gültig und nennt nur Adressen unter opernlog.de, ohne #', () => {
    const s = lies('sitemap.xml');
    assert.match(s, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(s, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
    const adressen = [...s.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
    assert.ok(adressen.includes('https://opernlog.de/'));
    for (const a of adressen) {
        assert.ok(a.startsWith('https://opernlog.de/'), a);
        // Google ignoriert alles nach #: solche Einträge wären wertlos.
        assert.ok(!a.includes('#'), a);
    }
});

test('weder robots.txt noch sitemap.xml noch das Vorschaubild sind von der Auslieferung ausgeschlossen', () => {
    const muster = lies('.vercelignore').split('\n').map(z => z.trim()).filter(z => z && !z.startsWith('#'));
    for (const datei of ['robots.txt', 'sitemap.xml', 'icons/vorschau.png']) {
        assert.ok(fs.existsSync(path.join(WURZEL, datei)), `${datei} fehlt`);
        assert.ok(!muster.some(m => datei === m.replace(/\/$/, '') || datei.startsWith(m.replace(/\/$/, '') + '/')), datei);
    }
});

test('index.html: Hauptadresse, Beschreibung, Linkvorschau', () => {
    assert.match(html, /<link rel="canonical" href="https:\/\/opernlog\.de\/" \/>/);
    assert.match(html, /<meta name="description"\s+content="[^"]{50,160}"/);
    for (const eigenschaft of ['og:title', 'og:description', 'og:url', 'og:image', 'og:locale']) {
        assert.match(html, new RegExp(`<meta property="${eigenschaft}"\\s+content="[^"]+"`), eigenschaft);
    }
    assert.match(html, /<meta property="og:image" content="https:\/\/opernlog\.de\/icons\/vorschau\.png" \/>/);
    assert.match(html, /<meta name="twitter:card" content="summary_large_image" \/>/);
});

test('das Vorschaubild hat die Größe, die es angibt (1200 × 630)', () => {
    const png = fs.readFileSync(path.join(WURZEL, 'icons/vorschau.png'));
    assert.equal(png.readUInt32BE(16), 1200);
    assert.equal(png.readUInt32BE(20), 630);
    assert.ok(png.length < 300 * 1024, 'zu groß für eine Linkvorschau');
});

test('die Strukturdaten sind gültiges JSON und beschreiben die App unter opernlog.de', () => {
    const roh = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    assert.ok(roh, 'Strukturdaten fehlen');
    const d = JSON.parse(roh);
    assert.equal(d['@context'], 'https://schema.org');
    assert.equal(d['@type'], 'WebApplication');
    assert.equal(d.url, 'https://opernlog.de/');
    assert.equal(d.inLanguage, 'de');
});

test('opernlog.vercel.app sagt Suchmaschinen "nicht aufnehmen", opernlog.de nicht', () => {
    const v = JSON.parse(lies('vercel.json'));
    const regeln = v.headers.filter(r => r.headers.some(h => h.key === 'X-Robots-Tag'));
    assert.equal(regeln.length, 1);
    const [r] = regeln;
    assert.equal(r.source, '/(.*)');
    assert.deepEqual(r.has, [{ type: 'host', value: 'opernlog.vercel.app' }]);
    assert.deepEqual(r.headers, [{ key: 'X-Robots-Tag', value: 'noindex' }]);
});

test('für das Symbol bei Google gibt es ein Favicon in einem Vielfachen von 48 px', () => {
    const m = html.match(/<link rel="icon" href="([^"]+\.png)" sizes="(\d+)x(\d+)"/g) || [];
    const gross = m.map(z => z.match(/href="([^"]+)" sizes="(\d+)x(\d+)"/)).filter(([, , b, h]) => b === h && Number(b) % 48 === 0);
    assert.ok(gross.length, 'kein Favicon in 48, 96, 144, 192 … px');
    const datei = path.join(WURZEL, gross[0][1]);
    const png = fs.readFileSync(datei);
    assert.equal(png.readUInt32BE(16), Number(gross[0][2]));
    assert.equal(png.readUInt32BE(20), Number(gross[0][3]));
    // Auch die Seiten für Suchmaschinen nennen es.
    assert.match(lies('oper/tosca/index.html'), /<link rel="icon" href="\/icons\/icon-any-192\.png" sizes="192x192"/);
});

test('der Websitename für den Treffer: OpernLog', () => {
    const alle = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
    const seite = alle.find(d => d['@type'] === 'WebSite');
    assert.ok(seite, 'WebSite fehlt');
    assert.equal(seite.name, 'OpernLog');
    assert.equal(seite.url, 'https://opernlog.de/');
});
