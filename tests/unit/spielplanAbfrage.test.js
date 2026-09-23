// Wo läuft ein Werk demnächst – Auswahl, Reihenfolge, Schreibweise.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { kommendeAuffuehrungen, terminKurz, heuteIso } from '../../src/data/spielplanAbfrage.js';
import { uebernehmen, seitenrahmen } from '../werkzeug/spielplan-uebernehmen.mjs';

const DATEN = [
    { werk: 'tosca', haus: 'wiener-staatsoper', url: 'https://w.example/tosca', termine: ['2026-10-01', '2026-10-05'] },
    { werk: 'tosca', haus: 'semperoper', url: 'https://s.example/tosca', termine: ['2026-09-01', '2026-11-08'] },
    { werk: 'tosca', haus: 'hamburgische-staatsoper', url: 'https://h.example/tosca', termine: ['2026-09-10'] },
    { werk: 'carmen', haus: 'semperoper', url: 'https://s.example/carmen', termine: ['2026-10-02'] },
];

test('nur kommende Termine, nur das gefragte Werk', () => {
    const z = kommendeAuffuehrungen('tosca', { heute: '2026-09-22', daten: DATEN });
    assert.deepEqual(z.map(x => x.haus.id), ['wiener-staatsoper', 'semperoper']);
    assert.deepEqual(z[1].termine, ['2026-11-08'], 'der vergangene Termin steht noch da');
    // Hamburg hat nur Vergangenes – die Zeile fällt ganz weg.
});

test('ohne Standort nach dem nächsten Termin', () => {
    const z = kommendeAuffuehrungen('tosca', { heute: '2026-09-22', daten: DATEN });
    assert.equal(z[0].km, null);
    assert.equal(z[0].termine[0], '2026-10-01');
});

test('mit Standort nach Entfernung', () => {
    // Dresden: die Semperoper liegt näher als Wien, trotz späterem Termin.
    const z = kommendeAuffuehrungen('tosca', { heute: '2026-09-22', daten: DATEN, position: { lat: 51.05, lon: 13.74 } });
    assert.deepEqual(z.map(x => x.haus.id), ['semperoper', 'wiener-staatsoper']);
    assert.ok(z[0].km < 5, `${z[0].km} km bis zur Semperoper`);
});

test('ein unbekanntes Haus fällt weg statt die Seite zu sprengen', () => {
    const z = kommendeAuffuehrungen('tosca', { heute: '2026-09-22', daten: [{ werk: 'tosca', haus: 'gibt-es-nicht', url: 'x', termine: ['2027-01-01'] }] });
    assert.deepEqual(z, []);
});

test('Termine kurz, mit Jahr nur außerhalb des laufenden', () => {
    assert.equal(terminKurz('2026-10-08', '2026-09-22'), '8. Okt');
    assert.equal(terminKurz('2027-03-01', '2026-09-22'), '1. Mär 2027');
});

test('heute in Ortszeit', () => {
    assert.equal(heuteIso(new Date(2026, 8, 22, 23, 30)), '2026-09-22');
});

// ── Übernahme aus einem Lauf ─────────────────────────────────────────────

const LAUF = {
    'semperoper': { stand: '2026-09-22', start: ['https://semperoper.example/spielplan'], werke: {
        'tosca': { url: 'https://semperoper.example/tosca', komponistGenannt: true, termine: ['2026-10-08', '2026-10-11'] },
        'faust': { url: 'https://semperoper.example/faust', komponistGenannt: false, termine: ['2026-11-01'] },
        'carmen': { url: 'https://semperoper.example/carmen', komponistGenannt: true, termine: [] },
        'gibts-nicht': { url: 'x', komponistGenannt: true, termine: ['2026-10-01'] },
    } },
    'kein-haus': { stand: '2026-09-22', werke: { 'tosca': { url: 'x', komponistGenannt: true, termine: ['2026-10-01'] } } },
};
const LEER = { ausschliessen: [], aufnehmen: [], termineEntfernen: [], adressen: [] };

test('übernommen wird nur, was sicher ein Opernabend ist', () => {
    const { zeilen, weggelassen, stand } = uebernehmen(LAUF, LEER);
    assert.deepEqual(zeilen, [{ werk: 'tosca', haus: 'semperoper', url: 'https://semperoper.example/tosca', termine: ['2026-10-08', '2026-10-11'] }]);
    assert.equal(stand, '2026-09-22');
    const gruende = Object.fromEntries(weggelassen.map(w => [w.werk, w.grund]));
    assert.equal(gruende.faust, 'Komponist nicht genannt');
    assert.equal(gruende.carmen, 'keine Termine');
    assert.equal(gruende['gibts-nicht'], 'nicht im Katalog');
});

test('Korrekturen aus der Durchsicht greifen', () => {
    const { zeilen, weggelassen } = uebernehmen(LAUF, {
        ausschliessen: [{ haus: 'semperoper', werk: 'tosca', grund: 'Ballett' }],
        aufnehmen: [{ haus: 'semperoper', werk: 'faust' }],
        termineEntfernen: [],
        adressen: [{ haus: 'semperoper', werk: 'faust', url: 'https://semperoper.example/faust-gounod' }],
    });
    assert.deepEqual(zeilen.map(z => [z.werk, z.url]), [['faust', 'https://semperoper.example/faust-gounod']]);
    assert.equal(weggelassen.find(w => w.werk === 'tosca').grund, 'Ballett');
});

test('einzelne falsche Termine lassen sich entfernen', () => {
    const { zeilen } = uebernehmen(LAUF, { ...LEER, termineEntfernen: [{ haus: 'semperoper', werk: 'tosca', termine: ['2026-10-08'] }] });
    assert.deepEqual(zeilen[0].termine, ['2026-10-11']);
});

test('Termine auf den Seiten vieler Stücke gehören zur Seite, nicht zum Stück', () => {
    // Die Bayerische Staatsoper zeigt auf jeder Stückseite eine Datumsleiste.
    const leiste = ['2026-09-24', '2026-09-25'];
    const werke = {
        'tosca': { url: 'https://oper.example/tosca', ausSeite: [...leiste, '2027-05-17'], ausListe: [] },
        'carmen': { url: 'https://oper.example/carmen', ausSeite: [...leiste, '2027-04-21'], ausListe: ['2026-09-25'] },
        'aida': { url: 'https://oper.example/aida', ausSeite: [...leiste, '2027-03-01'], ausListe: [] },
        // Ein Abend aus drei Stücken auf einer Seite zählt einmal.
        'il-tabarro': { url: 'https://oper.example/trittico', ausSeite: ['2026-10-03'], ausListe: [] },
        'suor-angelica': { url: 'https://oper.example/trittico', ausSeite: ['2026-10-03'], ausListe: [] },
        'gianni-schicchi': { url: 'https://oper.example/trittico', ausSeite: ['2026-10-03'], ausListe: [] },
    };
    assert.deepEqual([...seitenrahmen(werke)].sort(), leiste);
    const lauf = { 'semperoper': { stand: '2026-09-22', werke: Object.fromEntries(Object.entries(werke).map(([id, w]) =>
        [id, { ...w, komponistGenannt: true, termine: [...new Set([...w.ausSeite, ...w.ausListe])].sort() }])) } };
    const termine = Object.fromEntries(uebernehmen(lauf, LEER).zeilen.map(z => [z.werk, z.termine]));
    assert.deepEqual(termine.tosca, ['2027-05-17']);
    // Was eine Kalenderliste direkt am Titel nennt, bleibt.
    assert.deepEqual(termine.carmen, ['2026-09-25', '2027-04-21']);
    assert.deepEqual(termine['gianni-schicchi'], ['2026-10-03']);
});

test('der Tag des Laufs fällt weg', () => {
    // Kalender auf der Seite zeigen das heutige Datum (Gärtnerplatztheater).
    const lauf = { 'semperoper': { stand: '2026-09-22', werke: {
        'tosca': { url: 'https://semperoper.example/tosca', komponistGenannt: true, termine: ['2026-09-22', '2026-10-08'] },
        'aida': { url: 'https://semperoper.example/aida', komponistGenannt: true, termine: ['2026-09-22'] },
    } } };
    const { zeilen, weggelassen } = uebernehmen(lauf, LEER);
    assert.deepEqual(zeilen.map(z => [z.werk, z.termine]), [['tosca', ['2026-10-08']]]);
    assert.equal(weggelassen.find(w => w.werk === 'aida').grund, 'keine Termine');
});

test('Termine aus einem Spielzeitheft kommen dazu und veralten von selbst', () => {
    const { zeilen, weggelassen } = uebernehmen(LAUF, { ...LEER, ergaenzen: [
        // ein Haus, das der Lauf nicht lesen konnte
        { haus: 'badisches-staatstheater', werk: 'arabella', url: 'https://karlsruhe.example/', termine: ['2026-09-01', '2027-04-04', '2028-01-01'] },
        // ein Werk, das der Lauf schon kennt: die Termine kommen hinzu
        { haus: 'semperoper', werk: 'tosca', url: 'https://heft.example/', termine: ['2026-10-11', '2026-12-01'] },
        { haus: 'semperoper', werk: 'unbekanntes-werk', url: 'https://heft.example/', termine: ['2026-12-01'] },
    ] });
    const zeile = (haus, werk) => zeilen.find(z => z.haus === haus && z.werk === werk);
    // Vor dem Stand und nach der Spielzeit fällt weg.
    assert.deepEqual(zeile('badisches-staatstheater', 'arabella'), { werk: 'arabella', haus: 'badisches-staatstheater', url: 'https://karlsruhe.example/', termine: ['2027-04-04'] });
    // Der Link des Laufs bleibt, die Termine werden vereinigt.
    assert.deepEqual(zeile('semperoper', 'tosca'), { werk: 'tosca', haus: 'semperoper', url: 'https://semperoper.example/tosca', termine: ['2026-10-08', '2026-10-11', '2026-12-01'] });
    assert.equal(zeile('semperoper', 'unbekanntes-werk'), undefined);
    assert.ok(weggelassen.some(w => w.werk === 'unbekanntes-werk' && w.grund === 'nicht im Katalog'));
});
