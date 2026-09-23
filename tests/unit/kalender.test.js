// Kalenderdateien für einen Termin aus dem Spielplan.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { kalenderEintrag, kalenderDateiname } from '../../src/kalender.js';

const TOSCA = { id: 'tosca', title: 'Tosca', composer: 'Giacomo Puccini' };
const SEMPER = { id: 'semperoper', name: 'Semperoper', city: 'Dresden', state: 'Sachsen', lat: 51.0543, lon: 13.7351 };
const WIEN = { id: 'wiener-staatsoper', name: 'Wiener Staatsoper', city: 'Wien', state: 'Österreich', lat: 48.2, lon: 16.37 };
const JETZT = new Date(Date.UTC(2026, 8, 23, 12, 0, 0));
const URL = 'https://www.semperoper.de/spielplan/tosca';

// Gefaltete Zeilen zurück zu einer, wie ein Kalender sie liest.
const zeilen = ics => ics.replace(/\r\n /g, '').split('\r\n');
const wert = (ics, name) => zeilen(ics).find(z => z.startsWith(name))?.slice(name.length);

test('mit Beginn und Ende: Ortszeit samt Zeitzone, Ort, Link', () => {
    const ics = kalenderEintrag({ werk: TOSCA, haus: SEMPER, datum: '2026-12-05', zeit: '19:00-22:30', url: URL, jetzt: JETZT });
    assert.equal(wert(ics, 'DTSTART;TZID=Europe/Berlin:'), '20261205T190000');
    assert.equal(wert(ics, 'DTEND;TZID=Europe/Berlin:'), '20261205T223000');
    assert.ok(zeilen(ics).includes('TZID:Europe/Berlin'), 'die Zeitzone ist beschrieben');
    assert.equal(wert(ics, 'SUMMARY:'), 'Tosca – Semperoper');
    assert.equal(wert(ics, 'LOCATION:'), 'Semperoper\\, Dresden');
    assert.equal(wert(ics, 'GEO:'), '51.0543;13.7351');
    assert.equal(wert(ics, 'URL:'), URL);
    assert.equal(wert(ics, 'UID:'), 'tosca-semperoper-2026-12-05@opernlog.vercel.app');
    assert.equal(wert(ics, 'DTSTAMP:'), '20260923T120000Z');
    assert.match(wert(ics, 'DESCRIPTION:'), /Giacomo Puccini: Tosca\\nTermine und Karten: https/);
    assert.doesNotMatch(ics, /geschätzt/);
});

test('ohne Ende drei Stunden, und die Beschreibung sagt es', () => {
    const ics = kalenderEintrag({ werk: TOSCA, haus: SEMPER, datum: '2026-12-05', zeit: '19:30', url: URL, jetzt: JETZT });
    assert.equal(wert(ics, 'DTEND;TZID=Europe/Berlin:'), '20261205T223000');
    assert.match(wert(ics, 'DESCRIPTION:'), /Das Ende ist geschätzt \(3 Stunden\)/);
});

test('über Mitternacht geht es in den nächsten Tag', () => {
    const lang = kalenderEintrag({ werk: TOSCA, haus: SEMPER, datum: '2026-12-31', zeit: '22:30-01:15', jetzt: JETZT });
    assert.equal(wert(lang, 'DTEND;TZID=Europe/Berlin:'), '20270101T011500');
    const spaet = kalenderEintrag({ werk: TOSCA, haus: SEMPER, datum: '2026-12-05', zeit: '22:30', jetzt: JETZT });
    assert.equal(wert(spaet, 'DTEND;TZID=Europe/Berlin:'), '20261206T013000');
});

test('ohne Uhrzeit ganztägig, mit Hinweis', () => {
    const ics = kalenderEintrag({ werk: TOSCA, haus: SEMPER, datum: '2026-12-05', url: URL, jetzt: JETZT });
    assert.equal(wert(ics, 'DTSTART;VALUE=DATE:'), '20261205');
    assert.equal(wert(ics, 'DTEND;VALUE=DATE:'), '20261206');
    assert.ok(!ics.includes('VTIMEZONE'), 'ohne Uhrzeit keine Zeitzone');
    assert.match(wert(ics, 'DESCRIPTION:'), /Die Uhrzeit steht auf der Seite des Hauses/);
});

test('ein Haus in Österreich bekommt die Wiener Zeitzone', () => {
    const ics = kalenderEintrag({ werk: TOSCA, haus: WIEN, datum: '2026-12-05', zeit: '19:00', jetzt: JETZT });
    assert.equal(wert(ics, 'DTSTART;TZID=Europe/Vienna:'), '20261205T190000');
});

test('Sonderzeichen werden maskiert, lange Zeilen gefaltet, Zeilen enden mit CRLF', () => {
    const werk = { id: 'x', title: 'Ein Titel; mit, Zeichen', composer: 'Komponistin mit einem sehr, sehr langen Namen und noch mehr Text dahinter' };
    const ics = kalenderEintrag({ werk, haus: SEMPER, datum: '2026-12-05', zeit: '19:00', url: URL, jetzt: JETZT });
    assert.equal(wert(ics, 'SUMMARY:'), String.raw`Ein Titel\; mit\, Zeichen – Semperoper`);
    for (const z of ics.split('\r\n')) assert.ok(new TextEncoder().encode(z).length <= 75, `zu lang: ${z}`);
    assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
    assert.ok(!/[^\r]\n/.test(ics), 'nur CRLF');
});

test('Dateiname aus Werk, Haus und Tag', () => {
    assert.equal(kalenderDateiname(TOSCA, SEMPER, '2026-12-05'), 'tosca-semperoper-2026-12-05.ics');
});
