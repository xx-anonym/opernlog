// Neue Werke und Häuser aus dem Formular des Admins im nächsten monatlichen
// Spielplan-Lauf (16.11.2026): das Datum im Formular, die Spielplan-Seite
// als Einstiegsseite des Laufs, die Prüfung der Adresse.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { naechsterLauf, naechsterLaufText } from '../../src/data/spielplanLauf.js';
import { pruefeHaus } from '../../src/data/katalogRegeln.js';
import { quellenAusDatenbank } from '../werkzeug/spielplaene-lesen.mjs';

test('der nächste Lauf: am 3., nach dem 3. im nächsten Monat, über den Jahreswechsel', () => {
    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    assert.equal(iso(naechsterLauf(new Date(2026, 10, 16))), '2026-12-03');
    assert.equal(iso(naechsterLauf(new Date(2026, 11, 1))), '2026-12-03');
    // Am Lauftag ist er schon gelaufen.
    assert.equal(iso(naechsterLauf(new Date(2026, 11, 3, 12))), '2027-01-03');
    assert.equal(iso(naechsterLauf(new Date(2026, 11, 31))), '2027-01-03');
    assert.equal(naechsterLaufText(new Date(2026, 10, 16)), '3. Dezember');
});

test('eine Spielplan-Seite aus der Datenbank wird Einstiegsseite – außer die Datei kennt das Haus schon', () => {
    const quellen = { 'theater-bielefeld': ['https://theater-bielefeld.de/spielplan'] };
    const dazu = quellenAusDatenbank([
        { id: 'theater-neu', spielplan_seite: ' https://theater-neu.de/spielplan ' },
        { id: 'theater-bielefeld', spielplan_seite: 'https://anders.de/' },
        { id: 'theater-ohne', spielplan_seite: '' },
        { id: 'theater-alt' },
    ], quellen);
    assert.deepEqual(dazu, ['theater-neu']);
    assert.deepEqual(quellen['theater-neu'], ['https://theater-neu.de/spielplan']);
    assert.deepEqual(quellen['theater-bielefeld'], ['https://theater-bielefeld.de/spielplan']);
    assert.equal(quellen['theater-ohne'], undefined);
});

test('die Spielplan-Seite ist freiwillig, aber wenn, dann eine Adresse', () => {
    const haus = {
        id: 'theater-neu', name: 'Theater Neu', city: 'Neustadt', state: 'Sachsen', description: 'Ein Haus.',
        lat: 51.0, lon: 13.0, capacity: 500, founded: 1900, color: '#123456',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/X.jpg/500px-X.jpg',
    };
    const mangel = m => m.some(x => x.includes('Spielplan-Seite'));
    assert.ok(!mangel(pruefeHaus(haus)));
    assert.ok(!mangel(pruefeHaus({ ...haus, spielplanSeite: 'https://www.theater-neu.de/spielplan/oper' })));
    assert.ok(mangel(pruefeHaus({ ...haus, spielplanSeite: 'theater-neu.de/spielplan' })));
    assert.ok(mangel(pruefeHaus({ ...haus, spielplanSeite: 'https://spielplan' })));
});
