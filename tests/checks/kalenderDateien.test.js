// kalender/ – die Kalenderdateien, die iPhone und iPad vom Server öffnen.
//
// Sie entstehen aus src/data/spielplan.js (tests/werkzeug/kalender-dateien.mjs).
// Fehlt eine, bleibt auf dem iPhone das Fenster nach "In den Kalender" leer;
// ist eine veraltet, landet ein falscher Abend im Kalender. Beides fiele erst
// auf dem Gerät auf, deshalb hier.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { spielplan, SPIELPLAN_STAND, SPIELPLAN_ZUSATZWERKE } from '../../src/data/spielplan.js';
import { kalenderDateiname } from '../../src/kalender.js';
import { kalenderDateien, KALENDER_ORDNER } from '../werkzeug/kalender-dateien.mjs';

const NEU_ERZEUGEN = 'Neu erzeugen: node tests/werkzeug/kalender-dateien.mjs';

// Werke aus operas.js: der ganze Inhalt steht fest.
const erwartet = kalenderDateien(spielplan, SPIELPLAN_STAND);
// Werke aus der Datenbank: Titel und Komponist kennt die Prüfung ohne Netz
// nicht, wohl aber, welche Dateien es geben muss.
const ausDatenbank = new Map(spielplan.filter(e => SPIELPLAN_ZUSATZWERKE.includes(e.werk))
    .flatMap(e => e.termine.map(t => [kalenderDateiname({ id: e.werk }, { id: e.haus }, t), t])));
const vorhanden = fs.readdirSync(KALENDER_ORDNER).filter(n => n.endsWith('.ics'));

test('zu jedem Termin im Spielplan liegt eine Datei bereit', () => {
    assert.ok(erwartet.size > 0);
    const fehlt = [...erwartet.keys(), ...ausDatenbank.keys()].filter(n => !vorhanden.includes(n));
    assert.deepEqual(fehlt.slice(0, 10), [], `${fehlt.length} Dateien fehlen. ${NEU_ERZEUGEN}`);
});

test('auch Werke aus der Datenbank haben ihre Dateien, mit richtigem Abend', () => {
    // Anlass: Rienzi steht nur in der Datenbank; die Datei fehlte, und das
    // iPhone zeigte nach "In den Kalender" eine 404-Seite.
    for (const [n, datum] of ausDatenbank) {
        if (!vorhanden.includes(n)) continue;   // meldet die Prüfung oben
        const text = fs.readFileSync(path.join(KALENDER_ORDNER, n), 'utf8');
        assert.match(text, new RegExp(`^UID:${n.replace(/\.ics$/, '')}@`, 'm'), n);
        assert.match(text, new RegExp(`^DTSTART[;:][^\r\n]*${datum.replace(/-/g, '')}`, 'm'), n);
        assert.match(text, /^SUMMARY:\S/m, n);
    }
});

test('keine Datei für einen Abend, der nicht (mehr) im Spielplan steht', () => {
    const zuviel = vorhanden.filter(n => !erwartet.has(n) && !ausDatenbank.has(n));
    assert.deepEqual(zuviel.slice(0, 10), [], `${zuviel.length} Dateien zu viel. ${NEU_ERZEUGEN}`);
});

test('jede Datei hat den Inhalt, den die App selbst erzeugen würde', () => {
    const anders = [...erwartet].filter(([n, text]) =>
        vorhanden.includes(n) && fs.readFileSync(path.join(KALENDER_ORDNER, n), 'utf8') !== text).map(([n]) => n);
    assert.deepEqual(anders.slice(0, 10), [], `${anders.length} Dateien veraltet. ${NEU_ERZEUGEN}`);
});

test('die Dateinamen taugen unverändert als Adresse', () => {
    for (const n of [...erwartet.keys(), ...ausDatenbank.keys()]) assert.match(n, /^[a-z0-9-]+\.ics$/, n);
});
