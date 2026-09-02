// Spielzeit-Grenze und Saisonrückblick.
//
// Zwei Fehler sind hier schon passiert und sollen nicht wiederkommen:
//   1. Der "beste Abend" war der schlechteste – absteigend sortiert und dann
//      mit .pop() das letzte Element genommen.
//   2. Datumsangaben rutschten je nach Zeitzone einen Tag zurück, was am
//      31. Juli über die Zuordnung zur Spielzeit entscheidet.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    seasonStartYear, seasonLabel, visitsInSeason, seasonsWithVisits,
    lastCompletedSeasonStartYear, buildSeasonReview,
} from '../../src/data/season.js';

const besuch = (o) => ({
    houseId: 'bayerische-staatsoper', operaId: 'zauberflote', date: '2025-09-01', ...o,
});

test('die Spielzeit beginnt am 1. August', () => {
    assert.equal(seasonStartYear('2025-07-31'), 2024);
    assert.equal(seasonStartYear('2025-08-01'), 2025);
    assert.equal(seasonStartYear('2025-12-31'), 2025);
    assert.equal(seasonStartYear('2026-01-01'), 2025);
});

test('unbrauchbare Datumsangaben ergeben null statt einer falschen Saison', () => {
    assert.equal(seasonStartYear(''), null);
    assert.equal(seasonStartYear(null), null);
    assert.equal(seasonStartYear('irgendwas'), null);
});

test('die Grenze hält auch in einer westlichen Zeitzone', () => {
    // 'JJJJ-MM-TT' an new Date() übergeben landet auf Mitternacht UTC. Wer in
    // New York sitzt, hätte den 1. August dann als 31. Juli gelesen – und der
    // Abend wäre in der falschen Spielzeit gelandet. season.js zerlegt die
    // Zeichenkette deshalb von Hand; das wird hier festgehalten.
    const vorher = process.env.TZ;
    try {
        process.env.TZ = 'America/New_York';
        assert.equal(seasonStartYear('2025-08-01'), 2025);
        assert.equal(seasonStartYear('2025-07-31'), 2024);
    } finally {
        if (vorher === undefined) delete process.env.TZ; else process.env.TZ = vorher;
    }
});

test('seasonLabel schreibt zweistellig weiter, auch über die Jahrhundertgrenze', () => {
    assert.equal(seasonLabel(2025), '2025/26');
    assert.equal(seasonLabel(1999), '1999/00');
});

test('visitsInSeason filtert und sortiert aufsteigend', () => {
    const alle = [
        besuch({ date: '2026-03-01' }),
        besuch({ date: '2025-08-01' }),
        besuch({ date: '2025-07-30' }),   // noch die Saison davor
    ];
    const drin = visitsInSeason(alle, 2025);
    assert.deepEqual(drin.map(v => v.date), ['2025-08-01', '2026-03-01']);
});

test('seasonsWithVisits gibt die jüngste Spielzeit zuerst', () => {
    const alle = [besuch({ date: '2023-09-01' }), besuch({ date: '2025-09-01' }), besuch({ date: '2024-09-01' })];
    assert.deepEqual(seasonsWithVisits(alle), [2025, 2024, 2023]);
});

test('lastCompletedSeasonStartYear liegt vor dem heutigen Tag', () => {
    assert.equal(lastCompletedSeasonStartYear(new Date(2026, 6, 30)), 2024); // 30.7.2026
    assert.equal(lastCompletedSeasonStartYear(new Date(2026, 7, 1)), 2025);  // 1.8.2026
});

test('eine Saison ohne Besuche liefert leer statt eines halb gefüllten Rückblicks', () => {
    const r = buildSeasonReview([besuch({ date: '2023-09-01' })], 2025);
    assert.equal(r.leer, true);
    assert.equal(r.visitCount, 0);
    assert.equal(r.label, '2025/26');
});

test('der beste Abend ist der bestbewertete, nicht der schlechteste', () => {
    // Genau hier lag der Fehler: absteigend sortiert und dann .pop().
    const r = buildSeasonReview([
        besuch({ date: '2025-09-01', operaId: 'zauberflote', rating: 2 }),
        besuch({ date: '2025-10-01', operaId: 'don-giovanni', rating: 5 }),
        besuch({ date: '2025-11-01', operaId: 'la-traviata', rating: 3 }),
    ], 2025);
    assert.equal(r.bestVisit.visit.rating, 5);
    assert.equal(r.bestVisit.opera.id, 'don-giovanni');
});

test('bei gleicher Bewertung gewinnt der spätere Abend', () => {
    const r = buildSeasonReview([
        besuch({ date: '2025-09-01', operaId: 'zauberflote', rating: 5 }),
        besuch({ date: '2026-01-04', operaId: 'don-giovanni', rating: 5 }),
    ], 2025);
    assert.equal(r.bestVisit.visit.date, '2026-01-04');
});

test('Abende ohne Bewertung verderben den Schnitt nicht', () => {
    const r = buildSeasonReview([
        besuch({ date: '2025-09-01', rating: 4 }),
        besuch({ date: '2025-10-01', operaId: 'don-giovanni' }),          // keine Bewertung
        besuch({ date: '2025-11-01', operaId: 'la-traviata', rating: 2 }),
    ], 2025);
    assert.equal(r.avgRating, 3);
    assert.equal(r.visitCount, 3);
});

test('neue Häuser sind die, die vorher nie vorkamen', () => {
    const r = buildSeasonReview([
        besuch({ date: '2024-09-01', houseId: 'bayerische-staatsoper' }),
        besuch({ date: '2025-09-01', houseId: 'bayerische-staatsoper' }),
        besuch({ date: '2025-10-01', houseId: 'gaertnerplatztheater' }),
    ], 2025);
    assert.deepEqual(r.newHouses.map(h => h.id), ['gaertnerplatztheater']);
});

test('erster und letzter Abend stehen chronologisch', () => {
    const r = buildSeasonReview([
        besuch({ date: '2026-03-01' }),
        besuch({ date: '2025-08-02' }),
    ], 2025);
    assert.equal(r.firstVisit.date, '2025-08-02');
    assert.equal(r.lastVisit.date, '2026-03-01');
});

test('mehrfach gesehene Werke tauchen als Wiederholung auf', () => {
    const r = buildSeasonReview([
        besuch({ date: '2025-09-01', operaId: 'la-traviata' }),
        besuch({ date: '2026-02-01', operaId: 'la-traviata' }),
        besuch({ date: '2025-10-01', operaId: 'zauberflote' }),
    ], 2025);
    assert.equal(r.repeats.length, 1);
    assert.equal(r.repeats[0].opera.id, 'la-traviata');
    assert.equal(r.repeats[0].anzahl, 2);
});

test('der häufigste Dirigent kommt aus den Mitwirkenden – in beiden Schreibweisen', () => {
    const r = buildSeasonReview([
        besuch({ date: '2025-09-01', conductor: 'Kirill Petrenko' }),
        besuch({ date: '2025-10-01', operaId: 'don-giovanni', conductor: 'Kirill Petrenko' }),
        besuch({ date: '2025-11-01', operaId: 'la-traviata', conductor: 'Simone Young' }),
    ], 2025);
    assert.equal(r.topConductor.wert, 'Kirill Petrenko');
    assert.equal(r.topConductor.anzahl, 2);
});
