// src/data/landkarte.js – die Ländergrenzen unter der Häuserkarte.
//
// Erzeugt aus Natural Earth (tests/werkzeug/landkarte-erzeugen.mjs). Geprüft
// wird, dass sie zu den Häusern passt: jedes Haus liegt in Deutschland,
// Österreich, der Schweiz oder Liechtenstein – oder dicht an ihrer Grenze,
// denn die Linien sind vereinfacht.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { LAENDER } from '../../src/data/landkarte.js';
import { operaHouses } from '../../src/data/operaHouses.js';

const kern = LAENDER.filter(l => l.kern);

function innen(lon, lat, ring) {
    let drin = false;
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
        const [xi, yi, xj, yj] = [ring[i], ring[i + 1], ring[j], ring[j + 1]];
        if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) drin = !drin;
    }
    return drin;
}

function randAbstand(lon, lat, ring) {
    let min = Infinity;
    for (let i = 0, j = ring.length - 2; i < ring.length; j = i, i += 2) {
        const [ax, ay, bx, by] = [ring[j], ring[j + 1], ring[i], ring[i + 1]];
        const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
        const t = l ? Math.max(0, Math.min(1, ((lon - ax) * dx + (lat - ay) * dy) / l)) : 0;
        min = Math.min(min, Math.hypot(lon - (ax + t * dx), lat - (ay + t * dy)));
    }
    return min;
}

test('Deutschland, Österreich, Schweiz und Liechtenstein sind der Kern', () => {
    assert.deepEqual(kern.map(l => l.id).sort(), ['AUT', 'CHE', 'DEU', 'LIE']);
});

test('jedes Haus liegt im Kern oder höchstens 5 km neben seiner Grenze', () => {
    const daneben = operaHouses.filter(h => Number.isFinite(h.lat)).filter(h =>
        !kern.some(l => l.ringe.some(r => innen(h.lon, h.lat, r)))
        && !kern.some(l => l.ringe.some(r => randAbstand(h.lon, h.lat, r) < 0.05)));
    assert.deepEqual(daneben.map(h => h.id), []);
});

test('die Datei bleibt klein', () => {
    const punkte = LAENDER.reduce((s, l) => s + l.ringe.reduce((t, r) => t + r.length / 2, 0), 0);
    assert.ok(punkte < 3000, `${punkte} Punkte`);
});
