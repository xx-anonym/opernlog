// Blinde Flecken – Werke der eigenen Komponisten, die noch fehlen.
//
// Die Werk-Ids kommen aus dem Katalog statt aus einer abgeschriebenen Liste:
// kommt eine Oper hinzu, sollen diese Tests weiter das Verhalten prüfen und
// nicht an einer veralteten Zahl scheitern.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { blindSpots } from '../../src/data/blindSpots.js';
import { operas } from '../../src/data/operas.js';

const werkeVon = (komponist) => operas.filter(o => o.composer === komponist);
const MOZART = werkeVon('Wolfgang Amadeus Mozart');
const VERDI = werkeVon('Giuseppe Verdi');
const WAGNER = werkeVon('Richard Wagner');

const besuch = (operaId, o = {}) => ({
    operaId, houseId: 'bayerische-staatsoper', date: '2025-09-01', ...o,
});

test('ohne Daten gibt es weder Gruppen noch eine Erfolgsmeldung', () => {
    const r = blindSpots([], []);
    assert.deepEqual(r.gruppen, []);
    assert.equal(r.allesGesehen, false);
});

test('ein Abend beim Komponisten macht dessen übrige Werke zu blinden Flecken', () => {
    const r = blindSpots([besuch(MOZART[0].id)], []);
    assert.equal(r.gruppen.length, 1);
    const g = r.gruppen[0];
    assert.equal(g.composer, 'Wolfgang Amadeus Mozart');
    assert.equal(g.abende, 1);
    assert.equal(g.gesehen, 1);
    assert.equal(g.gesamt, MOZART.length);
    assert.equal(g.fehlendGesamt, MOZART.length - 1);
});

test('Markierungen zählen als gesehen, aber nicht als Abend', () => {
    // Ein markiertes Werk hat kein Datum, kein Haus und keine Bewertung –
    // es darf die Abendzahl nicht aufblähen, muss aber die Lücke schließen.
    const r = blindSpots([], [MOZART[0].id, MOZART[1].id]);
    const g = r.gruppen[0];
    assert.equal(g.abende, 0);
    assert.equal(g.markiert, 2);
    assert.equal(g.gesehen, 2);
    assert.equal(g.fehlendGesamt, MOZART.length - 2);
});

test('ein Werk, das geloggt und markiert ist, wird nicht doppelt gezählt', () => {
    const r = blindSpots([besuch(MOZART[0].id)], [MOZART[0].id]);
    const g = r.gruppen[0];
    assert.equal(g.gesehen, 1);
    assert.equal(g.markiert, 0, 'schon geloggt – die Markierung fügt nichts hinzu');
});

test('Markierungen entscheiden die Reihenfolge mit', () => {
    // Verdi: ein Abend und drei Markierungen (4). Wagner: drei Abende (3).
    // Wer einen Komponisten nur von früher kennt, soll nicht hinten stehen.
    const besuche = [
        besuch(VERDI[0].id),
        besuch(WAGNER[0].id), besuch(WAGNER[1].id), besuch(WAGNER[2].id),
    ];
    const markiert = [VERDI[1].id, VERDI[2].id, VERDI[3].id];
    const r = blindSpots(besuche, markiert);
    assert.deepEqual(r.gruppen.map(g => g.composer), ['Giuseppe Verdi', 'Richard Wagner']);
});

test('wer bei allen seinen Komponisten alles gesehen hat, bekommt keine leere Liste', () => {
    const r = blindSpots(MOZART.map(o => besuch(o.id)), []);
    assert.deepEqual(r.gruppen, []);
    assert.equal(r.allesGesehen, true);
});

test('fehlendGesamt nennt die ganze Lücke, fehlend nur die angezeigten Chips', () => {
    const r = blindSpots([besuch(VERDI[0].id)], [], { maxWerke: 2 });
    const g = r.gruppen[0];
    assert.equal(g.fehlend.length, 2);
    assert.equal(g.fehlendGesamt, VERDI.length - 1);
    assert.ok(g.fehlendGesamt > g.fehlend.length, 'sonst prüft dieser Test nichts');
});

test('maxKomponisten wird eingehalten', () => {
    const r = blindSpots(
        [besuch(MOZART[0].id), besuch(VERDI[0].id), besuch(WAGNER[0].id)],
        [], { maxKomponisten: 2 }
    );
    assert.equal(r.gruppen.length, 2);
});

test('innerhalb eines Komponisten steht das bekanntere Werk vorn', () => {
    // Die Katalogreihenfolge ist nach Bekanntheit gepflegt; der Vorschlag soll
    // ihr folgen, nicht dem Alphabet.
    const r = blindSpots([besuch(VERDI[5].id)], [], { maxWerke: 3 });
    const erwartet = VERDI.filter(o => o.id !== VERDI[5].id).slice(0, 3).map(o => o.id);
    assert.deepEqual(r.gruppen[0].fehlend.map(o => o.id), erwartet);
});

test('unbekannte Ids werden übergangen', () => {
    const r = blindSpots([besuch('gibt-es-nicht')], ['auch-nicht']);
    assert.deepEqual(r.gruppen, []);
    assert.equal(r.allesGesehen, false);
});
