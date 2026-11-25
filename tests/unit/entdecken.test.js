// Der geheime Entdecken-Modus (src/entdecken.js): Taste, Zufall, Titel.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { istEntdeckenTaste, zufallsAufnahme, aufnahmeTitel, zeileHTML } from '../../src/entdecken.js';

test('Strg+E und Cmd+E – sonst nichts', () => {
    assert.equal(istEntdeckenTaste({ key: 'e', ctrlKey: true }), true);
    assert.equal(istEntdeckenTaste({ key: 'e', metaKey: true }), true);
    assert.equal(istEntdeckenTaste({ key: 'E', ctrlKey: true }), true, 'Feststelltaste');
    assert.equal(istEntdeckenTaste({ key: 'e' }), false);
    assert.equal(istEntdeckenTaste({ key: 'e', ctrlKey: true, shiftKey: true }), false);
    assert.equal(istEntdeckenTaste({ key: 'e', ctrlKey: true, altKey: true }), false);
    assert.equal(istEntdeckenTaste({ key: 'f', ctrlKey: true }), false);
    assert.equal(istEntdeckenTaste({ key: 'e', ctrlKey: true, repeat: true }), false, 'gehaltene Taste blättert nicht');
});

test('zufällige Aufnahme: aus der Liste, nicht zweimal dieselbe, nur https', () => {
    const liste = [
        { werk_id: 'tosca', stelle: 'Vissi d’arte', url: 'https://www.youtube.com/watch?v=a' },
        { werk_id: 'turandot', stelle: 'Nessun dorma', url: 'https://www.youtube.com/watch?v=b' },
        { werk_id: 'x', stelle: 'kaputt', url: 'javascript:alert(1)' },
    ];
    assert.equal(zufallsAufnahme(liste, { zufall: () => 0 }).stelle, 'Vissi d’arte');
    assert.equal(zufallsAufnahme(liste, { zufall: () => 0.999 }).stelle, 'Nessun dorma');
    // Dieselbe wie eben wird übersprungen, solange es eine andere gibt.
    assert.equal(zufallsAufnahme(liste, { zufall: () => 0, nicht: 'https://www.youtube.com/watch?v=a' }).stelle, 'Nessun dorma');
    assert.equal(zufallsAufnahme([liste[0]], { nicht: liste[0].url }).stelle, 'Vissi d’arte');
    // Gleichmäßig genug: jede kommt vor.
    const gesehen = new Set(Array.from({ length: 200 }, () => zufallsAufnahme(liste).stelle));
    assert.deepEqual([...gesehen].sort(), ['Nessun dorma', 'Vissi d’arte']);
    assert.equal(zufallsAufnahme([]), null);
    assert.equal(zufallsAufnahme(null), null);
});

test('Titel: Stelle und Werk', () => {
    assert.equal(aufnahmeTitel({ werk_id: 'tosca', stelle: 'Vissi d’arte' }), 'Vissi d’arte · Tosca');
    assert.equal(aufnahmeTitel({ werk_id: 'gibt-es-nicht', stelle: 'Arie' }), 'Arie');
});

test('die Zeile: Titel als Link zum Werk, bei blockiertem Tab auch die Aufnahme', () => {
    const a = { werk_id: 'rake-progress', stelle: 'Here I stand', url: 'https://www.youtube.com/watch?v=vDBN56pYtHw' };
    const werke = [{ id: 'rake-progress', title: 'The Rake’s Progress' }];
    assert.equal(zeileHTML(a, { werke }),
        '<a class="entdecken__werk" href="#/opera/rake-progress">Here I stand · The Rake’s Progress</a>');
    assert.match(zeileHTML(a, { werke, blockiert: true }),
        /<a class="entdecken__aufnahme" href="https:\/\/www\.youtube\.com\/watch\?v=vDBN56pYtHw" target="_blank" rel="noopener">Aufnahme öffnen<\/a>$/);
    // Unbekanntes Werk: kein Link ins Leere, und alles maskiert.
    assert.equal(zeileHTML({ werk_id: 'x', stelle: '<b>', url: 'https://a.b' }, { werke }), '&lt;b&gt;');
});
