// daten/spielplan.json – was die Datenbank für die Mitteilungen zur
// Wunschliste liest (spielplan_mitteilungen_migration.sql).
//
// Die Datei entsteht aus src/data/spielplan.js (tests/werkzeug/spielplan-daten.mjs).
// Passt sie nicht, meldet die Datenbank Neues, das keines ist, oder schweigt
// zu Neuem. Beides fiele erst bei den Nutzern auf.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { spielplan, SPIELPLAN_STAND, SPIELPLAN_ZUSATZWERKE } from '../../src/data/spielplan.js';
import { spielplanDaten, alsText, DATEN_DATEI } from '../werkzeug/spielplan-daten.mjs';

const NEU = 'Neu erzeugen: node tests/werkzeug/spielplan-daten.mjs';
const datei = JSON.parse(fs.readFileSync(DATEN_DATEI, 'utf8'));
const erwartet = spielplanDaten(spielplan, SPIELPLAN_STAND);
const schluessel = e => `${e.werk}@${e.haus}`;

test('Stand wie im Spielplan', () => {
    assert.equal(datei.stand, SPIELPLAN_STAND, NEU);
});

test('jeder Eintrag aus dem Repo steht genau so in der Datei', () => {
    const inDatei = new Map(datei.eintraege.map(e => [schluessel(e), e]));
    for (const e of erwartet.eintraege) {
        assert.deepEqual(inDatei.get(schluessel(e)), e, `${schluessel(e)} fehlt oder ist veraltet. ${NEU}`);
    }
});

test('Werke aus der Datenbank stehen mit Titel und denselben Terminen drin', () => {
    const inDatei = new Map(datei.eintraege.map(e => [schluessel(e), e]));
    for (const z of spielplan.filter(z => SPIELPLAN_ZUSATZWERKE.includes(z.werk))) {
        const e = inDatei.get(schluessel(z));
        assert.ok(e, `${schluessel(z)} fehlt. ${NEU}`);
        assert.ok(e.titel?.trim(), `${schluessel(z)} ohne Titel`);
        assert.deepEqual(e.termine, z.termine);
    }
});

test('nichts in der Datei, was nicht im Spielplan steht', () => {
    const imPlan = new Set(spielplan.map(schluessel));
    const zuviel = datei.eintraege.map(schluessel).filter(k => !imPlan.has(k));
    assert.deepEqual(zuviel, [], NEU);
});

test('die Datei ist so geschrieben, wie das Werkzeug schreibt', () => {
    // Eine Zeile je Eintrag; sonst wird jeder Lauf ein unlesbarer Diff.
    const text = fs.readFileSync(DATEN_DATEI, 'utf8');
    assert.equal(text, alsText(datei));
});

// ── Die Seite der Datenbank ──────────────────────────────────────────────

const SQL = fs.readFileSync(new URL('../../supabase/migrations/spielplan_mitteilungen_migration.sql', import.meta.url), 'utf8');

test('die Datenbank holt genau diese Datei, von dieser Website', () => {
    const adresse = SQL.match(/url := '([^']+)'/)?.[1];
    assert.ok(adresse, 'keine Adresse in spielplan_holen');
    const { pathname, hostname } = new URL(adresse);
    assert.equal(hostname, 'opernlog.vercel.app');
    assert.ok(DATEN_DATEI.endsWith(pathname), `${pathname} ist nicht ${DATEN_DATEI}`);
    // und die Datei wird ausgeliefert
    const ausgeschlossen = fs.readFileSync(new URL('../../.vercelignore', import.meta.url), 'utf8')
        .split('\n').map(z => z.trim()).filter(z => z && !z.startsWith('#')).map(z => z.replace(/\/$/, ''));
    assert.ok(!ausgeschlossen.includes(pathname.split('/')[1]), `${pathname} steht in .vercelignore`);
});

test('holen und abgleichen laufen jeden Morgen, abgleichen nach holen', () => {
    const holen = SQL.match(/cron\.schedule\('spielplan-holen', '(\d+) (\d+) \* \* \*'/);
    const abgleichen = SQL.match(/cron\.schedule\('spielplan-abgleichen', '(\d+) (\d+) \* \* \*'/);
    assert.ok(holen && abgleichen, 'Termine fehlen');
    const minuten = m => Number(m[2]) * 60 + Number(m[1]);
    assert.ok(minuten(abgleichen) > minuten(holen), 'abgleichen läuft vor holen');
});

test('niemand außer der Datenbank ruft die Funktionen', () => {
    assert.match(SQL, /REVOKE ALL ON FUNCTION public\.spielplan_holen\(\) FROM PUBLIC, anon, authenticated/);
    assert.match(SQL, /REVOKE ALL ON FUNCTION public\.spielplan_abgleichen\(JSONB, BOOLEAN\) FROM PUBLIC, anon, authenticated/);
});

test('der erste Abgleich meldet nichts, eine kaputte Datei ändert nichts', () => {
    assert.match(SQL, /erster_lauf := NOT EXISTS \(SELECT 1 FROM public\.spielplan_paare\)/);
    assert.match(SQL, /IF NOT erster_lauf THEN/);
    assert.match(SQL, /jsonb_array_length\(daten->'eintraege'\) < 50/);
});
