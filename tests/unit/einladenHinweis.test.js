// Wann das Tagebuch fragt, ob man jemanden einladen will (src/einladenHinweis.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { einladenFragen, geradeGeloggtMerken, EINLADEN_GEFRAGT, GERADE_GELOGGT } from '../../src/einladenHinweis.js';

const speicher = () => {
    const m = new Map();
    return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
};
const umgebung = () => ({ sessionStorage: speicher(), localStorage: speicher() });

test('gefragt wird nur gleich nach dem Loggen, ab drei Abenden, mit Konto – und nur einmal', () => {
    const u = umgebung();
    assert.equal(einladenFragen({ anzahl: 5, cloud: true, umgebung: u }), false, 'ohne Loggen');

    geradeGeloggtMerken(u);
    assert.equal(einladenFragen({ anzahl: 2, cloud: true, umgebung: u }), false, 'zu wenige');
    // Der Merker gilt für genau einen Besuch im Tagebuch.
    assert.equal(u.sessionStorage.getItem(GERADE_GELOGGT), null);

    geradeGeloggtMerken(u);
    assert.equal(einladenFragen({ anzahl: 3, cloud: false, umgebung: u }), false, 'ohne Konto');

    geradeGeloggtMerken(u);
    assert.equal(einladenFragen({ anzahl: 3, cloud: true, umgebung: u }), true);
    assert.match(u.localStorage.getItem(EINLADEN_GEFRAGT), /^\d{4}-\d{2}-\d{2}$/);

    geradeGeloggtMerken(u);
    assert.equal(einladenFragen({ anzahl: 4, cloud: true, umgebung: u }), false, 'ein zweites Mal');
});

test('ohne Speicher wird nicht gefragt, statt zu scheitern', () => {
    const kaputt = { get sessionStorage() { throw new Error('gesperrt'); } };
    assert.equal(einladenFragen({ anzahl: 9, cloud: true, umgebung: kaputt }), false);
    assert.doesNotThrow(() => geradeGeloggtMerken(kaputt));
});

test('LogVisit merkt sich nur neue Abende, die schon in der Cloud sind', () => {
    const quelle = fs.readFileSync(new URL('../../src/pages/LogVisit.js', import.meta.url), 'utf8');
    assert.match(quelle, /if \(!editVisit && !ergebnis\?\.ausstehend\) geradeGeloggtMerken\(\);/);
});
