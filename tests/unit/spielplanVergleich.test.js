// Der Bericht des monatlichen Spielplan-Laufs (tests/werkzeug/spielplan-vergleich.mjs):
// was als Änderung zählt, und welche Häuser in die Übernahme dürfen.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { vergleichen, bericht, gelesen, leerGelesen, geaenderteHaeuser, zusammenfassung } from '../werkzeug/spielplan-vergleich.mjs';

const HEUTE = '2026-10-03';
const zeile = (werk, haus, termine, zeiten) => ({ werk, haus, url: `https://${haus}.example/${werk}`, termine, ...(zeiten ? { zeiten } : {}) });

test('vergangene Termine zählen nicht als weggefallen', () => {
    const alt = [zeile('tosca', 'semperoper', ['2026-09-20', HEUTE, '2026-11-01'])];
    const neu = [zeile('tosca', 'semperoper', ['2026-11-01'])];
    const v = vergleichen(alt, neu, { heute: HEUTE });
    assert.equal(zusammenfassung(v), 'Keine Änderungen');
});

test('neu, weg, Termine dazu und entfallen', () => {
    const alt = [
        zeile('aida', 'semperoper', ['2026-11-01', '2026-11-05']),
        zeile('tosca', 'oper-leipzig', ['2026-12-01']),
    ];
    const neu = [
        zeile('aida', 'semperoper', ['2026-11-05', '2026-11-09']),
        zeile('carmen', 'oper-leipzig', ['2027-01-10']),
    ];
    const v = vergleichen(alt, neu, { heute: HEUTE });
    assert.deepEqual(v.neu.map(z => z.werk), ['carmen']);
    assert.deepEqual(v.weg.map(z => z.werk), ['tosca']);
    assert.deepEqual(v.geaendert.map(z => [z.werk, z.dazu, z.entfallen]), [['aida', ['2026-11-09'], ['2026-11-01']]]);
    assert.deepEqual(v.uhrzeiten, []);
});

test('nur andere Uhrzeiten stehen für sich, getrennt von echten Änderungen', () => {
    const alt = [zeile('aida', 'dnt-weimar', ['2026-11-01'], { '2026-11-01': '19:30' })];
    const neu = [zeile('aida', 'dnt-weimar', ['2026-11-01'], { '2026-11-01': '19:30-22:30' })];
    const v = vergleichen(alt, neu, { heute: HEUTE });
    assert.deepEqual(v.geaendert, []);
    assert.deepEqual(v.uhrzeiten[0].zeiten, [{ termin: '2026-11-01', vorher: '19:30', nachher: '19:30-22:30' }]);
});

test('ein Haus gilt als gelesen, sobald eine seiner Seiten lud', () => {
    assert.equal(gelesen({ besucht: [{ url: 'a', status: 403 }, { url: 'b', status: 200 }] }), true);
    assert.equal(gelesen({ besucht: [{ url: 'a', status: 403 }] }), false);
    assert.equal(gelesen({ besucht: [] }), false);
    assert.equal(gelesen(undefined), false);
});

test('ein Haus, bei dem der Lauf kein einziges Werk fand, gilt als nicht gelesen', () => {
    // Die Bayerische Staatsoper auf GitHub, 27.09.2026: Seiten luden, aber
    // ohne ein Werk – eher eine Sperrseite als ein leerer Spielplan.
    const alt = [
        zeile('tosca', 'bayerische-staatsoper', ['2027-05-17']),
        zeile('aida', 'bayerische-staatsoper', ['2027-01-10']),
        zeile('carmen', 'oper-leipzig', ['2027-05-09']),
        // nur Vergangenes – kein Grund zum Verdacht
        zeile('norma', 'theater-kiel', ['2026-09-01']),
    ];
    const neu = [zeile('carmen', 'oper-leipzig', ['2027-05-10'])];
    assert.deepEqual(leerGelesen(alt, neu, HEUTE), ['bayerische-staatsoper']);
});

test('gemeldet werden alle Häuser mit Änderungen, auch solche mit nur anderen Uhrzeiten', () => {
    const alt = [
        zeile('aida', 'semperoper', ['2026-11-01']),
        zeile('tosca', 'oper-leipzig', ['2026-11-01']),
        zeile('carmen', 'theater-ulm', ['2026-12-13'], { '2026-12-13': '11:00' }),
        zeile('norma', 'oper-graz', ['2026-11-01']),
    ];
    const neu = [
        zeile('aida', 'semperoper', ['2026-11-01', '2026-11-02']),
        zeile('carmen', 'theater-ulm', ['2026-12-13'], { '2026-12-13': '12:00' }),
        zeile('norma', 'oper-graz', ['2026-11-01']),
    ];
    assert.deepEqual(geaenderteHaeuser(vergleichen(alt, neu, { heute: HEUTE })), ['oper-leipzig', 'semperoper', 'theater-ulm']);
});

test('der Bericht nennt Werk und Haus beim Namen und markiert Ladefehler', () => {
    const alt = [zeile('tannhaeuser', 'theater-kiel', ['2026-11-08'])];
    const v = vergleichen(alt, [], { heute: HEUTE });
    const namen = { werk: id => ({ tannhaeuser: 'Tannhäuser' }[id] || id), haus: id => ({ 'theater-kiel': 'Theater Kiel' }[id] || id) };
    const text = bericht(v, { heute: HEUTE, stand: '2026-09-23', namen, fehlerJeHaus: { 'theater-kiel': 8 }, nichtGelesen: ['theater-kiel'] });
    assert.match(text, /\*\*Tannhäuser\*\* – Theater Kiel: 08\.11\.2026/);
    assert.match(text, /8 Seiten des Hauses ließen sich nicht laden/);
    assert.match(text, /### Nicht gelesen[\s\S]*Theater Kiel/);
});

test('ein zu langer Bericht wird gekürzt, bevor GitHub ihn abweist', () => {
    const alt = Array.from({ length: 2000 }, (_, i) => zeile(`werk-${i}`, 'semperoper', ['2026-11-01', '2026-11-02', '2026-11-03']));
    const v = vergleichen(alt, [], { heute: HEUTE });
    const namen = { werk: id => id, haus: id => id };
    const text = bericht(v, { heute: HEUTE, stand: '2026-09-23', namen, fuss: 'FUSS' });
    assert.ok(text.length < 65536, `${text.length} Zeichen`);
    assert.match(text, /gekürzt/);
    assert.ok(text.endsWith('FUSS'));
});
