// Reihenfolge und Blöcke im Tagebuch.
//
// Der Fehler, der zu diesem Modul geführt hat: die Seite sortierte richtig und
// gruppierte danach immer nach Monat. Die Gruppierung hob die Sortierung wieder
// auf – "Beste Bewertung zuerst" zeigte oben den jüngsten Monat, und die Noten
// standen nur innerhalb eines Monatsblocks in der richtigen Reihenfolge.
//
// Deshalb prüft hier nichts die Sortierung für sich allein. Geprüft wird, was
// nach dem Gruppieren übrig ist.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { sortiereBesuche, gruppiereBesuche, notenTitel, note, nachNote }
    from '../../src/data/tagebuch.js';

const besuch = (id, date, rating) => ({ id, date, rating });

/** Die Abende in der Reihenfolge, in der sie am Ende untereinander stehen. */
function reihenfolge(besuche, sort) {
    return gruppiereBesuche(besuche, sort).flatMap(g => g.besuche.map(b => b.id));
}

// Der Zuschnitt ist der eigentliche Test: im August liegen der beste und der
// schlechteste Abend beieinander. Eine Gruppierung nach Monat zöge den
// schlechten mit nach oben, sobald der gute dort steht. Läge in jedem Monat
// nur ein Abend, käme dieselbe Reihenfolge auch falsch gruppiert heraus.
const ABENDE = [
    besuch('juli-schlecht', '2026-07-20', 2),
    besuch('august-top', '2026-08-05', 5),
    besuch('august-schlecht', '2026-08-20', 1),
    besuch('september-mittel', '2025-09-05', 3),
    besuch('maerz-top', '2026-03-01', 5),
];

test('nach Bewertung sortiert steht die beste Note oben', () => {
    // Der gemeldete Fehler: august-top und maerz-top haben beide fünf Sterne,
    // standen aber in verschiedenen Monatsblöcken – dazwischen der Juliabend
    // mit zwei Sternen, weil sein Monat jünger ist als der März.
    assert.deepEqual(reihenfolge(ABENDE, 'rating-desc'),
        ['august-top', 'maerz-top', 'september-mittel', 'juli-schlecht', 'august-schlecht']);
});

test('nach schlechtester Bewertung sortiert steht die schlechteste oben', () => {
    assert.deepEqual(reihenfolge(ABENDE, 'rating-asc'),
        ['august-schlecht', 'juli-schlecht', 'september-mittel', 'august-top', 'maerz-top']);
});

test('gleiche Note: der jüngere Abend zuerst', () => {
    // Ohne diesen zweiten Vergleich hinge die Reihenfolge davon ab, wie die
    // Besuche aus der Datenbank kamen, und spränge bei jedem Laden. Deshalb
    // steht der ältere Abend hier bewusst vorn: eine stabile Sortierung ohne
    // zweiten Vergleich würde ihn vorn lassen.
    const gleichauf = [
        besuch('alt', '2024-02-01', 4),
        besuch('neu', '2026-02-01', 4),
    ];
    assert.deepEqual(reihenfolge(gleichauf, 'rating-desc'), ['neu', 'alt']);
    assert.deepEqual(reihenfolge(gleichauf, 'rating-asc'), ['neu', 'alt']);
    // Auch ohne Note bleibt es bei dieser Reihenfolge.
    assert.deepEqual(reihenfolge([
        besuch('alt', '2024-02-01', 0),
        besuch('neu', '2026-02-01', 0),
    ], 'rating-desc'), ['neu', 'alt']);
});

test('jede Note bildet genau einen Block', () => {
    const gruppen = gruppiereBesuche(ABENDE, 'rating-desc');
    assert.deepEqual(gruppen.map(g => g.titel),
        ['5 Sterne', '3 Sterne', '2 Sterne', '1 Stern']);
    assert.deepEqual(gruppen.map(g => g.besuche.length), [2, 1, 1, 1]);
    assert.deepEqual(gruppen.map(g => g.typ), ['note', 'note', 'note', 'note']);
});

test('nach Bewertung sortiert gibt es keine Spielzeit an den Blöcken', () => {
    // Die Trennlinie zwischen zwei Spielzeiten hängt daran. Stünde hier eine
    // Zahl, zöge die Seite eine Grenze zwischen zwei Notenblöcke.
    for (const g of gruppiereBesuche(ABENDE, 'rating-desc')) {
        assert.equal(g.spielzeit, null);
    }
});

test('chronologisch sortiert bleiben es Monatsblöcke mit Spielzeit', () => {
    const gruppen = gruppiereBesuche(ABENDE, 'date-desc');
    assert.deepEqual(gruppen.map(g => g.titel),
        ['August 2026', 'Juli 2026', 'März 2026', 'September 2025']);
    assert.deepEqual(gruppen.map(g => g.besuche.map(b => b.id))[0],
        ['august-schlecht', 'august-top']);
    assert.deepEqual(gruppen.map(g => g.spielzeit), [2026, 2025, 2025, 2025]);
    assert.deepEqual(gruppen.map(g => g.typ), ['monat', 'monat', 'monat', 'monat']);
});

test('älteste zuerst dreht die Monate um', () => {
    assert.deepEqual(gruppiereBesuche(ABENDE, 'date-asc').map(g => g.titel),
        ['September 2025', 'März 2026', 'Juli 2026', 'August 2026']);
});

test('ein Monat mit mehreren Abenden bleibt ein Block', () => {
    const gruppen = gruppiereBesuche([
        besuch('a', '2026-03-01', 4),
        besuch('b', '2026-03-28', 1),
    ], 'date-desc');
    assert.equal(gruppen.length, 1);
    assert.deepEqual(gruppen[0].besuche.map(b => b.id), ['b', 'a']);
});

// ── Abende ohne Note ─────────────────────────────────────────────────────

test('ohne Note heißt nicht null Sterne', () => {
    // Bei "Schlechteste zuerst" stünde ein Abend ohne Note sonst ganz oben und
    // behauptete ein Urteil, das niemand gefällt hat.
    const mitLeer = [...ABENDE, besuch('ohne', '2026-06-01', 0)];
    assert.equal(reihenfolge(mitLeer, 'rating-asc').at(-1), 'ohne');
    assert.equal(reihenfolge(mitLeer, 'rating-desc').at(-1), 'ohne');
});

test('Abende ohne Note stehen in einem eigenen Block', () => {
    const gruppen = gruppiereBesuche([
        besuch('a', '2026-03-01', 4),
        besuch('b', '2026-04-01', null),
        besuch('c', '2026-05-01', undefined),
    ], 'rating-desc');
    assert.deepEqual(gruppen.map(g => g.titel), ['4 Sterne', 'Ohne Bewertung']);
    assert.deepEqual(gruppen.at(-1).besuche.map(b => b.id), ['c', 'b']);
    assert.equal(gruppen.at(-1).note, null);
});

test('note() nimmt die Null als fehlende Note', () => {
    assert.equal(note({ rating: 0 }), null);
    assert.equal(note({ rating: null }), null);
    assert.equal(note({}), null);
    assert.equal(note({ rating: 4.5 }), 4.5);
});

// ── Kleinkram, der trotzdem sichtbar wird ────────────────────────────────

test('DECIMAL aus der Cloud kommt auch als Zeichenkette an', () => {
    // Ohne Number() verglichen stünde "10" vor "9" – und "3.0" bekäme einen
    // eigenen Block neben der 3.
    const gruppen = gruppiereBesuche([
        besuch('zahl', '2026-03-01', 3),
        besuch('text', '2026-04-01', '3.0'),
    ], 'rating-desc');
    assert.equal(gruppen.length, 1);
    assert.equal(gruppen[0].titel, '3 Sterne');
});

test('halbe Sterne bekommen ein Komma', () => {
    assert.equal(notenTitel(4.5), '4,5 Sterne');
    assert.equal(notenTitel(5), '5 Sterne');
    assert.equal(notenTitel(1), '1 Stern');
    assert.equal(notenTitel(0.5), '0,5 Sterne');
    assert.equal(notenTitel(null), 'Ohne Bewertung');
});

test('halbe Sterne sortieren zwischen den ganzen', () => {
    assert.deepEqual(reihenfolge([
        besuch('vier', '2026-01-01', 4),
        besuch('viereinhalb', '2026-01-02', 4.5),
        besuch('fuenf', '2026-01-03', 5),
    ], 'rating-desc'), ['fuenf', 'viereinhalb', 'vier']);
});

test('sortiereBesuche lässt die übergebene Liste in Ruhe', () => {
    // renderDiary() gibt die gefilterte Liste weiter und zählt danach noch
    // ihre Länge; ein Sortieren an Ort und Stelle wäre hier harmlos, beim
    // nächsten Aufrufer nicht.
    const original = [besuch('a', '2026-01-01', 1), besuch('b', '2026-02-01', 5)];
    const kopie = [...original];
    sortiereBesuche(original, 'rating-desc');
    assert.deepEqual(original.map(b => b.id), kopie.map(b => b.id));
});

test('nachNote unterscheidet die vier Sortierungen', () => {
    assert.equal(nachNote('rating-desc'), true);
    assert.equal(nachNote('rating-asc'), true);
    assert.equal(nachNote('date-desc'), false);
    assert.equal(nachNote('date-asc'), false);
});

test('ohne Besuche kommen keine Blöcke', () => {
    assert.deepEqual(gruppiereBesuche([], 'rating-desc'), []);
    assert.deepEqual(gruppiereBesuche(undefined, 'date-desc'), []);
});
