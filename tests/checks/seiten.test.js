// Die Seiten für Suchmaschinen unter /oper/, /haus/, /komponist/ (erzeugt von
// tests/werkzeug/seiten-erzeugen.mjs, neu mit jedem Spielplan-Lauf).
//
// Geprüft werden die Dateien, wie sie im Repo liegen: sie enthalten auch
// Einträge aus der Datenbank, deshalb lässt sich nicht jede Seite hier
// nachbauen. Wohl aber, dass jede Seite vollständig ist, dass Sitemap und
// Seiten zusammenpassen und dass kein Verweis ins Leere geht.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { operas } from '../../src/data/operas.js';
import { operaHouses } from '../../src/data/operaHouses.js';
import { uhrzeiten, land, termineAb, ORDNER } from '../werkzeug/seiten-erzeugen.mjs';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function seiten() {
    const alle = [];
    for (const ordner of Object.values(ORDNER)) {
        const basis = path.join(WURZEL, ordner);
        alle.push(`${ordner}/index.html`);
        for (const id of fs.readdirSync(basis)) {
            if (fs.statSync(path.join(basis, id)).isDirectory()) alle.push(`${ordner}/${id}/index.html`);
        }
    }
    return alle;
}
const ALLE = seiten();
const lies = (p) => fs.readFileSync(path.join(WURZEL, p), 'utf8');

test('jedes Werk und jedes Haus im Repo hat eine Seite', () => {
    for (const w of operas) assert.ok(ALLE.includes(`oper/${w.id}/index.html`), w.id);
    for (const h of operaHouses) assert.ok(ALLE.includes(`haus/${h.id}/index.html`), h.id);
});

test('die Sitemap nennt genau die Startseite und alle Seiten', () => {
    const sitemap = lies('sitemap.xml');
    const adressen = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]).sort();
    const erwartet = ['https://opernlog.de/', ...ALLE.map(p => `https://opernlog.de/${p.replace(/index\.html$/, '')}`)].sort();
    assert.deepEqual(adressen, erwartet);
    assert.ok(adressen.length < 50000, 'eine Sitemap fasst höchstens 50 000 Adressen');
});

test('jede Seite: eigene Hauptadresse, Titel, Beschreibung, Überschrift, gültige Strukturdaten', () => {
    for (const p of ALLE) {
        const html = lies(p);
        const url = `https://opernlog.de/${p.replace(/index\.html$/, '')}`;
        assert.ok(html.includes(`<link rel="canonical" href="${url}">`), `${p}: canonical`);
        const titel = html.match(/<title>([^<]+)<\/title>/)?.[1] || '';
        assert.ok(titel.length >= 10 && titel.endsWith('| OpernLog'), `${p}: Titel ${titel}`);
        const beschreibung = html.match(/<meta name="description" content="([^"]+)">/)?.[1] || '';
        assert.ok(beschreibung.length >= 50, `${p}: Beschreibung zu kurz`);
        assert.equal((html.match(/<h1>/g) || []).length, 1, `${p}: genau eine Überschrift`);
        for (const [, roh] of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
            const daten = [JSON.parse(roh)].flat();
            for (const d of daten) {
                assert.equal(d['@context'], 'https://schema.org', p);
                if (d['@type'] === 'Event') {
                    assert.match(d.startDate, /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:00\+0[12]:00)?$/, `${p}: ${d.startDate}`);
                    if (d.endDate) assert.ok(d.endDate > d.startDate, `${p}: Ende vor Beginn`);
                    assert.ok(d.location?.name && d.location.address?.addressCountry, `${p}: Ort`);
                }
            }
        }
    }
});

test('kein Verweis zwischen den Seiten geht ins Leere', () => {
    const vorhanden = new Set(ALLE.map(p => `/${p.replace(/index\.html$/, '')}`));
    for (const p of ALLE) {
        for (const [, ziel] of lies(p).matchAll(/href="(?:https:\/\/opernlog\.de)?(\/(?:oper|haus|komponist)\/[^"#]*)"/g)) {
            assert.ok(vorhanden.has(decodeURIComponent(ziel)), `${p} verweist auf ${ziel}`);
        }
    }
});

test('Links zu den Häusern gehen als nofollow in einem neuen Tab auf', () => {
    const html = lies('oper/tosca/index.html');
    const karten = [...html.matchAll(/<a class="karten" href="[^"]+" ([^>]+)>/g)].map(m => m[1]);
    assert.ok(karten.length > 0);
    for (const k of karten) assert.match(k, /rel="nofollow noopener" target="_blank"/);
});

test('Uhrzeiten: einzeln oder als Spanne', () => {
    assert.deepEqual(uhrzeiten('19:30'), { beginn: '19:30', ende: null });
    assert.deepEqual(uhrzeiten('19:30-22:00'), { beginn: '19:30', ende: '22:00' });
    assert.deepEqual(uhrzeiten(null), { beginn: null, ende: null });
});

test('Land aus dem Bundesland', () => {
    assert.equal(land({ state: 'Österreich' }).code, 'AT');
    assert.equal(land({ state: 'Schweiz' }).code, 'CH');
    assert.equal(land({ state: 'Bayern' }).code, 'DE');
});

test('nur Termine ab dem Stand, sortiert', () => {
    const t = termineAb('2026-11-14', [
        { werk: 'a', haus: 'y', url: 'u', termine: ['2026-11-13', '2026-12-01', '2026-11-14'] },
        { werk: 'b', haus: 'x', url: 'u', termine: ['2026-11-20'] },
    ]);
    assert.deepEqual(t.map(x => x.datum), ['2026-11-14', '2026-11-20', '2026-12-01']);
});

test('Sommerzeit: der Abend im Juni trägt +02:00, im Dezember +01:00', () => {
    const tosca = lies('oper/tosca/index.html');
    for (const [, start] of tosca.matchAll(/"startDate":"([^"]+)"/g)) {
        if (!start.includes('T')) continue;
        const monat = Number(start.slice(5, 7));
        const erwartet = monat >= 4 && monat <= 9 ? '+02:00' : (monat === 11 || monat === 12 || monat <= 2 ? '+01:00' : null);
        if (erwartet) assert.ok(start.endsWith(erwartet), start);
    }
});

test('der Knopf in die App steht in der mitlaufenden Leiste oben, auf jeder Seite', () => {
    const css = lies('seiten/stil.css');
    assert.match(css, /\.kopf \{[^}]*position: sticky;[^}]*top: 0;/);
    for (const p of ALLE) {
        const html = lies(p);
        const kopf = html.match(/<header class="kopf">([\s\S]*?)<\/header>/)?.[1] || '';
        assert.match(kopf, /<a class="knopf knopf--kopf" href="\/(#\/(opera|house|composer)\/[^"]+)?">In OpernLog öffnen<\/a>/, p);
    }
    assert.match(lies('oper/tosca/index.html'), /class="knopf knopf--kopf" href="\/#\/opera\/tosca"/);
});

test('jeder Termin nennt das Haus als Ensemble (performer), aber keine erfundenen Preise', () => {
    const html = lies('oper/tosca/index.html');
    const roh = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
    const ereignisse = roh.flat().filter(d => d['@type'] === 'Event');
    assert.ok(ereignisse.length > 0);
    for (const e of ereignisse) {
        assert.equal(e.performer['@type'], 'PerformingGroup');
        assert.equal(e.performer.name, e.location.name);
        assert.equal(e.offers.price, undefined);
    }
});
