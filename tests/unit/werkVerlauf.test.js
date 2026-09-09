// Der eigene Verlauf mit einem Werk.
//
// Die Reihenfolge ist hier der Kern der Sache: aufsteigend, weil ein Verlauf
// von vorn gelesen wird – überall sonst in der App stehen die Besuche
// absteigend. Und sie muss bei gleichem Datum feststehen, sonst wechselt die
// Anzeige, je nachdem wie die Besuche geladen wurden.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { werkVerlauf, mehrfachGesehen } from '../../src/data/werkVerlauf.js';

const besuch = (o) => ({
    id: 'v1', houseId: 'semperoper', operaId: 'tosca', date: '2020-01-01', rating: 4, ...o,
});

test('ohne Besuche gibt es keinen Verlauf', () => {
    assert.equal(werkVerlauf([], 'tosca'), null);
    assert.equal(werkVerlauf(), null);
    assert.deepEqual(mehrfachGesehen([]), []);
});

test('ein Werk, das der Katalog nicht kennt, ergibt keinen Verlauf', () => {
    // Sonst stünde eine Überschrift ohne Werktitel da.
    assert.equal(werkVerlauf([besuch({ operaId: 'gibtesnicht' })], 'gibtesnicht'), null);
});

test('die Abende stehen aufsteigend, ältester zuerst', () => {
    const v = werkVerlauf([
        besuch({ id: 'b', date: '2024-06-01' }),
        besuch({ id: 'a', date: '2019-03-10' }),
        besuch({ id: 'c', date: '2026-02-20' }),
    ], 'tosca');
    assert.deepEqual(v.abende.map(a => a.datum), ['2019-03-10', '2024-06-01', '2026-02-20']);
    assert.equal(v.erste.datum, '2019-03-10');
    assert.equal(v.letzte.datum, '2026-02-20');
});

test('bei gleichem Datum entscheidet die Id, nicht die Ladereihenfolge', () => {
    const ids = (besuche) => werkVerlauf(besuche, 'tosca').abende.map(a => a.visit.id);
    const x = [besuch({ id: 'b2', date: '2024-06-01' }), besuch({ id: 'a1', date: '2024-06-01' })];
    assert.deepEqual(ids(x), ids([...x].reverse()));
    assert.deepEqual(ids(x), ['a1', 'b2']);
});

test('Besuche aus der Cloud werden genauso gelesen wie lokale', () => {
    // Die Cloud liefert snake_case, der lokale Speicher camelCase. Wer nur eine
    // Schreibweise kennt, zeigt je nach Herkunft der Daten einen leeren Verlauf.
    const v = werkVerlauf([
        { id: '1', opera_id: 'tosca', house_id: 'semperoper', date: '2021-05-05', rating: 3 },
        { id: '2', operaId: 'tosca', houseId: 'semperoper', date: '2022-05-05', rating: 5 },
    ], 'tosca');
    assert.equal(v.anzahl, 2);
    assert.equal(v.abende[0].haus.id, 'semperoper');
    assert.equal(v.abende[1].haus.id, 'semperoper');
});

test('die Cloud liefert die Bewertung als Text – sie zählt trotzdem', () => {
    // DECIMAL kommt über PostgREST als Zeichenkette an.
    const v = werkVerlauf([
        besuch({ id: '1', date: '2020-01-01', rating: '3.0' }),
        besuch({ id: '2', date: '2021-01-01', rating: '5.0' }),
    ], 'tosca');
    assert.equal(v.schnitt, 4);
    assert.equal(v.entwicklung, 2);
});

test('verschiedene Häuser werden gezählt, dasselbe Haus nur einmal', () => {
    const v = werkVerlauf([
        besuch({ id: '1', houseId: 'semperoper', date: '2020-01-01' }),
        besuch({ id: '2', houseId: 'semperoper', date: '2021-01-01' }),
        besuch({ id: '3', houseId: 'bayerische-staatsoper', date: '2022-01-01' }),
    ], 'tosca');
    assert.equal(v.anzahl, 3);
    assert.equal(v.haeuser, 2);
});

test('ein Abend in einem unbekannten Haus bleibt stehen', () => {
    // Der Abend hat stattgefunden – nur der Name des Hauses fehlt. Ihn
    // wegzulassen machte die Zahl über der Liste größer als die Liste.
    const v = werkVerlauf([
        besuch({ id: '1', houseId: 'abgerissenes-haus', date: '2020-01-01' }),
        besuch({ id: '2', date: '2021-01-01' }),
    ], 'tosca');
    assert.equal(v.anzahl, 2);
    assert.equal(v.abende[0].haus, null);
    assert.equal(v.haeuser, 1, 'nur das bekannte Haus zählt');
});

test('unbewertete Abende zählen mit, verfälschen aber den Schnitt nicht', () => {
    const v = werkVerlauf([
        besuch({ id: '1', date: '2020-01-01', rating: 4 }),
        besuch({ id: '2', date: '2021-01-01', rating: 0 }),
        besuch({ id: '3', date: '2022-01-01', rating: 2 }),
    ], 'tosca');
    assert.equal(v.anzahl, 3);
    assert.equal(v.schnitt, 3, 'nur die beiden bewerteten');
});

test('ohne jede Bewertung gibt es keinen Schnitt und keine Entwicklung', () => {
    const v = werkVerlauf([
        besuch({ id: '1', date: '2020-01-01', rating: 0 }),
        besuch({ id: '2', date: '2021-01-01', rating: null }),
    ], 'tosca');
    assert.equal(v.schnitt, null);
    assert.equal(v.entwicklung, null);
    assert.equal(v.beste, null);
});

test('die Entwicklung geht vom ersten zum letzten bewerteten Abend', () => {
    const v = werkVerlauf([
        besuch({ id: '1', date: '2019-01-01', rating: 2 }),
        besuch({ id: '2', date: '2021-01-01', rating: 3 }),
        besuch({ id: '3', date: '2026-01-01', rating: 5 }),
    ], 'tosca');
    assert.equal(v.entwicklung, 3);
});

test('bei einem einzigen Abend gibt es keine Entwicklung', () => {
    const v = werkVerlauf([besuch({ rating: 4 })], 'tosca');
    assert.equal(v.anzahl, 1);
    assert.equal(v.entwicklung, null);
    assert.equal(v.schnitt, 4);
});

test('der beste Abend ist bei Gleichstand der frühere', () => {
    const v = werkVerlauf([
        besuch({ id: '1', date: '2020-01-01', rating: 5 }),
        besuch({ id: '2', date: '2024-01-01', rating: 5 }),
    ], 'tosca');
    assert.equal(v.beste.datum, '2020-01-01');
});

test('Mitwirkende stehen an jedem Abend bereit', () => {
    const v = werkVerlauf([
        besuch({ id: '1', conductor: 'Thielemann', cast_list: 'Harteros' }),
    ], 'tosca');
    assert.equal(v.abende[0].credits.conductor, 'Thielemann');
    assert.equal(v.abende[0].credits.castList, 'Harteros', 'auch in snake_case');
    assert.equal(v.abende[0].credits.any, true);
});

test('mehrfachGesehen nennt nur Werke ab zwei Abenden', () => {
    const liste = mehrfachGesehen([
        besuch({ id: '1', operaId: 'tosca', date: '2020-01-01' }),
        besuch({ id: '2', operaId: 'tosca', date: '2021-01-01' }),
        besuch({ id: '3', operaId: 'zauberflote', date: '2022-01-01' }),
    ]);
    assert.deepEqual(liste.map(v => v.werk.id), ['tosca']);
    assert.equal(liste[0].anzahl, 2);
});

test('mehrfachGesehen sortiert nach Anzahl, bei Gleichstand nach Titel', () => {
    const b = (opera, i) => besuch({ id: `${opera}${i}`, operaId: opera, date: `202${i}-01-01` });
    const liste = mehrfachGesehen([
        b('zauberflote', 1), b('zauberflote', 2),
        b('tosca', 3), b('tosca', 4), b('tosca', 5),
        b('don-giovanni', 6), b('don-giovanni', 7),
    ]);
    assert.deepEqual(liste.map(v => v.werk.title),
        ['Tosca', 'Die Zauberflöte', 'Don Giovanni'],
        'Tosca mit drei Abenden zuerst, dann alphabetisch: "Die Zauberflöte" vor "Don Giovanni"');
});
