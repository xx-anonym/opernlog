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
        for (const [, ziel] of lies(p).matchAll(/href="(?:https:\/\/opernlog\.de)?(\/(?:oper|haus|komponist|stadt)\/[^"#]*)"/g)) {
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
        assert.match(kopf, /<a class="knopf knopf--kopf" href="\/(#\/(opera|house|composer|person)\/[^"]+|#\/houses)?">In OpernLog öffnen<\/a>/, p);
    }
    assert.match(lies('oper/tosca/index.html'), /class="knopf knopf--kopf" href="\/#\/opera\/tosca"/);
});

test('jeder Termin nennt das Haus als Ensemble (performer), aber keine erfundenen Preise', () => {
    const html = lies('oper/tosca/index.html');
    const roh = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
    const ereignisse = roh.flat().filter(d => d['@type'] === 'Event');
    assert.ok(ereignisse.length > 0);
    for (const e of ereignisse) {
        // Mit bekannter Besetzung (seit 24.11.2026) eine Liste: das Ensemble zuerst, dann die Einzelnen.
        const [gruppe, ...leute] = [e.performer].flat();
        assert.equal(gruppe['@type'], 'PerformingGroup');
        assert.equal(gruppe.name, e.location.name);
        for (const p of leute) {
            assert.equal(p['@type'], 'Person');
            assert.match(p.url, /^https:\/\/opernlog\.de\/person\/[a-z0-9-]+\/$/);
        }
        assert.equal(e.offers.price, undefined);
    }
});

test('Besetzung je Termin: Dirigat, Regie, Rollen, verlinkt auf Personenseiten', async () => {
    const { termineAb, mitwirkende, personenAus, personSeite } = await import('../werkzeug/seiten-erzeugen.mjs');
    const plan = [{ werk: 'la-traviata', haus: 'hamburgische-staatsoper', url: 'https://example.org/traviata', termine: ['2027-01-03', '2027-01-14'] }];
    const abend = { zeit: '17:00', dirigent: 'Sesto Quatrini', regie: 'Johannes Erath',
        besetzung: [{ rolle: 'Violetta Valery', name: 'Yaritza Véliz' }, { rolle: 'Flora Bervoix', name: 'Ida Aldrian' }] };
    const besetzung = new Map([['hamburgische-staatsoper', { 'la-traviata|2027-01-03': abend }]]);
    const termine = termineAb('2026-12-01', plan, besetzung);
    assert.equal(termine[0].besetzung, abend);
    assert.equal(termine[1].besetzung, null, 'ein Termin ohne Angabe des Hauses bleibt ohne');
    assert.deepEqual(mitwirkende(abend).map(m => m.als), ['Dirigat', 'Regie', 'Violetta Valery', 'Flora Bervoix']);
    const personen = personenAus(termine);
    assert.deepEqual([...personen.keys()], ['ida-aldrian', 'johannes-erath', 'sesto-quatrini', 'yaritza-veliz']);
    const werke = new Map(operas.map(w => [w.id, w]));
    const haeuser = new Map(operaHouses.map(h => [h.id, h]));
    const html = personSeite(personen.get('yaritza-veliz'), { werke, haeuser, stand: '2026-12-01' });
    assert.match(html, /<h1>Yaritza Véliz<\/h1>/);
    assert.match(html, /als Violetta Valery/);
    assert.match(html, /href="\/#\/person\/Yaritza%20V%C3%A9liz"/);
});

test('die Werkseite zeigt die Besetzung der Häuser, die sie nennen, und die Personenseiten gibt es', () => {
    const html = lies('oper/la-traviata/index.html');
    const links = [...html.matchAll(/<details class="besetzung">[\s\S]*?<\/details>/g)].flatMap(m => [...m[0].matchAll(/href="https:\/\/opernlog\.de\/(person\/[^"]+)"/g)].map(x => x[1]));
    assert.ok(links.length > 0, 'keine Besetzung auf der Traviata-Seite');
    for (const l of links) assert.ok(ALLE.includes(`${l}index.html`), l);
});

test('Brotkrumen: OpernLog › Bereich › Seite, mit gültigen Adressen', () => {
    const krumen = (datei) => [...lies(datei).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
        .map(m => JSON.parse(m[1])).flat().find(d => d['@type'] === 'BreadcrumbList');
    const tosca = krumen('oper/tosca/index.html');
    assert.deepEqual(tosca.itemListElement.map(e => [e.position, e.name, e.item]), [
        [1, 'OpernLog', 'https://opernlog.de/'],
        [2, 'Opern', 'https://opernlog.de/oper/'],
        [3, 'Tosca', 'https://opernlog.de/oper/tosca/'],
    ]);
    assert.equal(krumen('haus/semperoper/index.html').itemListElement[1].name, 'Häuser');
    assert.equal(krumen('komponist/giacomo-puccini/index.html').itemListElement[1].name, 'Komponisten');
    assert.equal(krumen('oper/index.html').itemListElement.length, 2);
    // Jede Seite hat genau eine Krumenliste.
    for (const datei of ALLE) {
        const n = [...lies(datei).matchAll(/"@type":"BreadcrumbList"/g)].length;
        assert.equal(n, 1, datei);
    }
});

test('Stadtseiten: jede Stadt mit Haus hat eine, Häuser verlinken dorthin', async () => {
    const { stadtId } = await import('../werkzeug/seiten-erzeugen.mjs');
    for (const h of operaHouses) {
        const p = `stadt/${stadtId(h.city)}/index.html`;
        assert.ok(ALLE.includes(p), `${h.city}: ${p} fehlt`);
        assert.ok(lies(`haus/${h.id}/index.html`).includes(`/stadt/${stadtId(h.city)}/`), `${h.id}: kein Link zur Stadt`);
    }
    const wien = lies('stadt/wien/index.html');
    assert.match(wien, /<title>Oper in Wien: Spielplan und Termine \| OpernLog<\/title>/);
    assert.match(wien, /<h1>Oper in Wien<\/h1>/);
    for (const h of operaHouses.filter(x => x.city === 'Wien')) assert.ok(wien.includes(`/haus/${h.id}/`), h.id);
    assert.ok(lies('stadt/index.html').includes('/stadt/wien/'));
    assert.ok(stadtId('München') === 'muenchen' && stadtId('Zürich') === 'zuerich');
});

test('Hausseiten: "Spielplan & Programm" mit Spielzeit, die Stadt nur, wenn sie fehlt', async () => {
    const { spielzeit } = await import('../werkzeug/seiten-erzeugen.mjs');
    assert.equal(spielzeit('2026-11-14'), '2026/27');
    assert.equal(spielzeit('2027-03-01'), '2026/27');
    assert.equal(spielzeit('2027-08-15'), '2027/28');
    assert.equal(spielzeit('2099-09-01'), '2099/00');
    assert.match(lies('haus/oper-frankfurt/index.html'), /<title>Oper Frankfurt: Spielplan &amp; Programm \d{4}\/\d{2} \| OpernLog<\/title>/);
    assert.match(lies('haus/mecklenburgisches-staatstheater/index.html'), /<title>Mecklenburgisches Staatstheater Schwerin: Spielplan/);
});
