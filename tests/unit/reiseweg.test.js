// Der Weg zwischen den Häusern einer Spielzeit: reiseweg() in
// src/data/season.js sammelt die Halte, reisewegSVG() in
// src/components/Reiseweg.js zeichnet sie für die Story – Norden oben,
// je Strecke ein Bogen, je Haus ein Punkt.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { reiseweg, buildSeasonReview } from '../../src/data/season.js';
import { reisewegSVG } from '../../src/components/Reiseweg.js';
import { operaHouses } from '../../src/data/operaHouses.js';

const abend = (houseId, date) => ({ houseId, operaId: 'tosca', date, rating: 4 });
const haus = id => operaHouses.find(h => h.id === id);

test('reiseweg: Häuser in der Reihenfolge der Abende, zwei Abende hintereinander im selben Haus sind ein Halt', () => {
    const halte = reiseweg([
        abend('semperoper', '2025-09-01'), abend('semperoper', '2025-09-08'),
        abend('oper-leipzig', '2025-10-01'), abend('gibt-es-nicht', '2025-10-05'),
        abend('semperoper', '2025-11-01'),
    ]);
    assert.deepEqual(halte.map(h => h.id), ['semperoper', 'oper-leipzig', 'semperoper']);
});

test('der Rückblick trägt den Weg; die Kilometer bleiben die Luftlinie entlang der Halte', () => {
    const r = buildSeasonReview([abend('semperoper', '2025-09-01'), abend('oper-leipzig', '2025-10-01')], 2025);
    assert.deepEqual(r.route.map(h => h.id), ['semperoper', 'oper-leipzig']);
    assert.ok(r.travelKm > 90 && r.travelKm < 120, `${r.travelKm} km Dresden–Leipzig`);
});

const punkte = svg => [...svg.matchAll(/data-haus="([^"]+)" cx="([\d.-]+)" cy="([\d.-]+)"/g)]
    .map(m => ({ id: m[1], x: Number(m[2]), y: Number(m[3]) }));

test('reisewegSVG: Norden oben, Osten rechts; je Strecke ein Bogen, je Haus ein Punkt', () => {
    const svg = reisewegSVG(['semperoper', 'staatsoper-berlin', 'oper-leipzig', 'wiener-staatsoper', 'semperoper'].map(haus));
    const p = Object.fromEntries(punkte(svg).map(q => [q.id, q]));
    assert.deepEqual(Object.keys(p).sort(), ['oper-leipzig', 'semperoper', 'staatsoper-berlin', 'wiener-staatsoper']);
    assert.ok(p['staatsoper-berlin'].y < p.semperoper.y, 'Berlin liegt nördlich von Dresden');
    assert.ok(p['wiener-staatsoper'].y > p.semperoper.y, 'Wien liegt südlich');
    assert.ok(p['oper-leipzig'].x < p.semperoper.x, 'Leipzig liegt westlich');
    assert.ok(p['wiener-staatsoper'].x > p['oper-leipzig'].x, 'Wien liegt östlich von Leipzig');
    const linie = svg.match(/class="reiseweg__linie" pathLength="1" d="([^"]+)"/)[1];
    assert.equal(linie.match(/Q/g).length, 4);
    // Alles im Bild.
    for (const q of Object.values(p)) assert.ok(q.x > 0 && q.x < 300 && q.y > 0 && q.y < 220, JSON.stringify(q));
    assert.match(svg, /class="reiseweg__land"/);
});

test('reisewegSVG: zwei Nachbarstädte füllen nicht das ganze Bild; ein Halt allein: nichts', () => {
    const [a, b] = punkte(reisewegSVG([haus('deutsche-oper-berlin'), haus('staatsoper-berlin')]));
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 30, 'zwei Häuser in Berlin liegen dicht beieinander');
    assert.equal(reisewegSVG([haus('semperoper')]), '');
    assert.equal(reisewegSVG([]), '');
});
