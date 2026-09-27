// Der Bericht des monatlichen Spielplan-Laufs (tests/werkzeug/spielplan-vergleich.mjs):
// was als Änderung zählt, und welche Häuser in die Übernahme dürfen.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { vergleichen, bericht, gelesen, unsichereHaeuser, geaenderteHaeuser, uebernahmeLauf, zusammenfassung } from '../werkzeug/spielplan-vergleich.mjs';

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

test('Häuser mit Ladefehlern, bei denen etwas wegfiele, kommen nicht in die Übernahme', () => {
    const alt = [
        zeile('tannhaeuser', 'theater-kiel', ['2026-11-08']),
        zeile('aida', 'semperoper', ['2026-11-01']),
        zeile('tosca', 'oper-leipzig', ['2026-11-01']),
    ];
    const neu = [
        zeile('aida', 'semperoper', ['2026-11-01', '2026-11-02']),
        zeile('tosca', 'oper-leipzig', ['2026-11-02']),
    ];
    const v = vergleichen(alt, neu, { heute: HEUTE });
    // Kiel verliert einen Eintrag und hatte Ladefehler; die Semperoper hatte
    // auch welche, verliert aber nichts; Leipzig verliert einen Termin, lud
    // aber alles.
    const fehler = { 'theater-kiel': 8, 'semperoper': 1 };
    assert.deepEqual(unsichereHaeuser(v, fehler), ['theater-kiel']);
    assert.deepEqual(geaenderteHaeuser(v), ['oper-leipzig', 'semperoper', 'theater-kiel']);
});

test('der Übernahmelauf enthält nur die genannten Häuser und sagt es für --dazu', () => {
    const lauf = { _werke: [{ id: 'rienzi' }], _haeuserKatalog: [], semperoper: { werke: {} }, 'theater-kiel': { werke: {} } };
    const u = uebernahmeLauf(lauf, ['semperoper']);
    assert.deepEqual(Object.keys(u).filter(k => !k.startsWith('_')), ['semperoper']);
    assert.deepEqual(u._haeuser, ['semperoper']);
    assert.deepEqual(u._werke, [{ id: 'rienzi' }]);
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
