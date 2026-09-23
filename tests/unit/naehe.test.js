// "In der Nähe": welche Abende im Umkreis und Zeitraum, in welcher Reihenfolge.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { abendeInDerNaehe, tagePlus, umkreisNachZoom, naechsteStufe, rundeKm } from '../../src/data/spielplanAbfrage.js';

const DATEN = [
    { werk: 'tosca', haus: 'semperoper', url: 'https://s.example/tosca',
      termine: ['2026-09-20', '2026-10-01', '2026-10-03'], zeiten: { '2026-10-01': '19:00-22:00' } },
    { werk: 'carmen', haus: 'oper-leipzig', url: 'https://l.example/carmen',
      termine: ['2026-10-01'], zeiten: { '2026-10-01': '18:00' } },
    { werk: 'aida', haus: 'wiener-staatsoper', url: 'https://w.example/aida', termine: ['2026-10-01'] },
    { werk: 'tosca', haus: 'unbekanntes-haus', url: 'https://x.example', termine: ['2026-10-01'] },
];
const DRESDEN = { lat: 51.05, lon: 13.74 };

test('jeder Abend einzeln, nach Datum und Beginn; ohne Uhrzeit ans Ende des Tages', () => {
    const a = abendeInDerNaehe({ heute: '2026-09-22', daten: DATEN });
    assert.deepEqual(a.map(x => `${x.datum} ${x.werk}@${x.haus.id}`), [
        '2026-10-01 carmen@oper-leipzig',
        '2026-10-01 tosca@semperoper',
        '2026-10-01 aida@wiener-staatsoper',
        '2026-10-03 tosca@semperoper',
    ]);
    assert.equal(a[1].zeit, '19:00-22:00');
    assert.equal(a[2].zeit, null);
    assert.equal(a[0].km, null, 'ohne Standort keine Entfernung');
});

test('Vergangenes fällt weg, unbekannte Häuser auch', () => {
    const a = abendeInDerNaehe({ heute: '2026-09-22', daten: DATEN });
    assert.ok(!a.some(x => x.datum === '2026-09-20'));
    assert.ok(!a.some(x => x.haus.id === 'unbekanntes-haus'));
});

test('mit Standort: nur im Umkreis, mit Entfernung', () => {
    const a = abendeInDerNaehe({ heute: '2026-09-22', daten: DATEN, position: DRESDEN, radiusKm: 150 });
    assert.deepEqual([...new Set(a.map(x => x.haus.id))].sort(), ['oper-leipzig', 'semperoper']);
    assert.ok(a.every(x => x.km <= 150));
    // Ohne Umkreis alle, aber mit Entfernung.
    const alle = abendeInDerNaehe({ heute: '2026-09-22', daten: DATEN, position: DRESDEN, radiusKm: null });
    assert.equal(alle.length, 4);
    assert.ok(alle.find(x => x.haus.id === 'wiener-staatsoper').km > 300);
});

test('der Zeitraum schließt den letzten Tag ein', () => {
    const bis = tagePlus('2026-09-22', 9);
    assert.equal(bis, '2026-10-01');
    const a = abendeInDerNaehe({ heute: '2026-09-22', bis, daten: DATEN });
    assert.deepEqual([...new Set(a.map(x => x.datum))], ['2026-10-01']);
});

test('nur bestimmte Werke, etwa die der Wunschliste', () => {
    const a = abendeInDerNaehe({ heute: '2026-09-22', daten: DATEN, werke: new Set(['tosca']) });
    assert.ok(a.length > 0 && a.every(x => x.werk === 'tosca'));
});

test('tagePlus rechnet über Monats- und Jahresgrenzen', () => {
    assert.equal(tagePlus('2026-12-30', 3), '2027-01-02');
    assert.equal(tagePlus('2027-02-27', 2), '2027-03-01');
});

test('Zoomen: Finger auseinander verkleinert den Umkreis, zusammen vergrößert ihn', () => {
    assert.equal(umkreisNachZoom(100, 2), 50);
    assert.equal(umkreisNachZoom(100, 0.5), 200);
    assert.equal(umkreisNachZoom(100, 1), 100);
    // stufenlos, nur gerundet – nicht auf die Stufen des Schiebers gerastet
    assert.equal(umkreisNachZoom(100, 1.2), 85);
    assert.equal(umkreisNachZoom(20, 1.5), 13);
    assert.equal(umkreisNachZoom(10, 4), 5, 'nicht unter 5 km');
});

test('ganz herausgezoomt: alle Häuser; von dort hinein: knapp unter 300 km', () => {
    assert.equal(umkreisNachZoom(300, 0.7), null);
    assert.equal(umkreisNachZoom(null, 1.4), 290);
    assert.equal(umkreisNachZoom(null, 1), null);
});

test('gerundet wird nah fein, weiter draußen gröber, zwischen 5 und 300 km', () => {
    assert.deepEqual([3, 13.4, 22, 83, 147, 999].map(rundeKm), [5, 13, 20, 85, 150, 300]);
});

test('gemerkte Werte landen auf der nächsten Stufe', () => {
    assert.equal(naechsteStufe(90), 100);
    assert.equal(naechsteStufe(1), 5);
    assert.equal(naechsteStufe(1000), 300);
});
