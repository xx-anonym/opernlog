// seenOperaList – die Quelle für Kachel "Werke gesehen" und die Liste dahinter.
//
// Der Fehler, der hier gefangen werden soll: die Kachel zählte lange nur
// geloggte Werke, die Liste zeigte auch markierte. Zahl und Liste müssen aus
// derselben Funktion kommen, sonst sagt die eine acht und die andere sieben.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { seenOperaList } from '../../src/data/seenOperas.js';

const besuch = (operaId, date = '2025-09-01') => ({ operaId, date, houseId: 'bayerische-staatsoper' });

test('ohne Besuche und ohne Markierungen ist die Liste leer', () => {
    assert.deepEqual(seenOperaList([], []), []);
    assert.deepEqual(seenOperaList(), []);
});

test('ein geloggtes Werk gilt als gesehen', () => {
    const liste = seenOperaList([besuch('zauberflote')], []);
    assert.equal(liste.length, 1);
    assert.equal(liste[0].opera.id, 'zauberflote');
    assert.equal(liste[0].abende, 1);
    assert.equal(liste[0].markiert, false);
});

test('ein markiertes Werk gilt auch ohne Besuch als gesehen', () => {
    const liste = seenOperaList([], ['don-giovanni']);
    assert.equal(liste.length, 1);
    assert.equal(liste[0].abende, 0);
    assert.equal(liste[0].markiert, true);
});

test('geloggt und markiert ergibt einen Eintrag, nicht zwei', () => {
    const liste = seenOperaList([besuch('la-traviata')], ['la-traviata']);
    assert.equal(liste.length, 1);
    assert.equal(liste[0].abende, 1);
    assert.equal(liste[0].markiert, true);
});

test('mehrere Abende desselben Werks werden gezählt', () => {
    const liste = seenOperaList(
        [besuch('la-traviata', '2025-09-01'), besuch('la-traviata', '2026-01-04')],
        []
    );
    assert.equal(liste.length, 1);
    assert.equal(liste[0].abende, 2);
});

test('Werke, die der Katalog nicht kennt, fallen heraus', () => {
    // Sonst wäre die Zahl über der Liste größer als die Liste selbst.
    const liste = seenOperaList([besuch('gibt-es-nicht')], ['auch-nicht']);
    assert.deepEqual(liste, []);
});

test('Besuche ohne operaId stürzen nicht ab', () => {
    assert.deepEqual(seenOperaList([{ date: '2025-09-01' }, null], []), []);
});

test('alphabetisch nach Titel, deutsche Sortierung', () => {
    const liste = seenOperaList([], ['zauberflote', 'don-giovanni', 'la-traviata']);
    assert.deepEqual(liste.map(e => e.opera.title), ['Die Zauberflöte', 'Don Giovanni', 'La Traviata']);
});
