// Entfernung und Vorauswahl des nächsten Opernhauses beim Loggen.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { distanceKm, nearestOperaHouse, operaHouses } from '../../src/data/operaHouses.js';

const haus = (id) => operaHouses.find(h => h.id === id);

test('dieselbe Stelle hat den Abstand null', () => {
    assert.equal(distanceKm(48.1397, 11.5794, 48.1397, 11.5794), 0);
});

test('München–Bayreuth sind gut 200 km', () => {
    const m = haus('bayerische-staatsoper');
    const b = haus('festspielhaus-bayreuth');
    const d = distanceKm(m.lat, m.lon, b.lat, b.lon);
    assert.ok(d > 195 && d < 210, `erwartet ~202 km, war ${d.toFixed(1)}`);
});

test('die Richtung spielt keine Rolle', () => {
    const a = haus('bayerische-staatsoper');
    const b = haus('festspielhaus-bayreuth');
    assert.equal(
        distanceKm(a.lat, a.lon, b.lat, b.lon).toFixed(6),
        distanceKm(b.lat, b.lon, a.lat, a.lon).toFixed(6)
    );
});

test('am Marienplatz wird die Bayerische Staatsoper vorgeschlagen', () => {
    const t = nearestOperaHouse(48.1374, 11.5755);
    assert.equal(t.house.id, 'bayerische-staatsoper');
    assert.ok(t.distanceKm < 1);
});

test('die Koordinaten meinen das Gebäude, nicht den Stadtmittelpunkt', () => {
    // München hat zwei Häuser gut 1 km auseinander. Lägen beide auf dem
    // Stadtmittelpunkt, wäre die Vorauswahl dort Zufall.
    const a = haus('bayerische-staatsoper');
    const b = haus('gaertnerplatztheater');
    const d = distanceKm(a.lat, a.lon, b.lat, b.lon);
    assert.ok(d > 0.3 && d < 3, `erwartet rund 1 km, war ${d.toFixed(2)}`);
});

test('wer weit weg ist, bekommt nichts vorgeschlagen', () => {
    // Lissabon: das nächste der Häuser ist hunderte Kilometer entfernt und
    // wäre als Vorauswahl nur im Weg.
    assert.equal(nearestOperaHouse(38.7223, -9.1393), null);
});

test('maxKm schneidet zuverlässig ab', () => {
    // Bayreuth liegt gut 200 km von München entfernt.
    assert.equal(nearestOperaHouse(49.9578, 11.5803, 1).house.id, 'festspielhaus-bayreuth');
    assert.equal(nearestOperaHouse(49.5, 11.0, 5), null);
});

test('unbrauchbare Koordinaten ergeben null statt eines zufälligen Hauses', () => {
    assert.equal(nearestOperaHouse(NaN, 11), null);
    assert.equal(nearestOperaHouse(undefined, undefined), null);
    assert.equal(nearestOperaHouse(null, null), null);
});
