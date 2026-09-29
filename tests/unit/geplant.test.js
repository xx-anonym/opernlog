// Geplante Besuche (src/data/geplant.js): welche kommen, welche sind vorbei
// und noch offen, und wie die Startseite "wann" sagt.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { kommendePlaene, offenePlaene, planZuBesuch, erledigt, wannText } from '../../src/data/geplant.js';

const HEUTE = '2026-09-28';   // ein Montag
const plan = (id, datum, operaId = 'tosca', houseId = 'semperoper', zeit = null) => ({ id, operaId, houseId, datum, zeit });

test('kommende Pläne: ab heute, der nächste zuerst, am selben Tag nach Uhrzeit', () => {
    const p = [plan('a', '2026-10-05'), plan('b', '2026-09-27'), plan('c', HEUTE, 'aida', 'semperoper', '19:30'), plan('d', HEUTE, 'carmen', 'semperoper', '11:00')];
    assert.deepEqual(kommendePlaene(p, HEUTE).map(x => x.id), ['d', 'c', 'a']);
});

test('offen ist, was vorbei und noch nicht geloggt ist – der jüngste zuerst', () => {
    const p = [plan('alt', '2026-09-20'), plan('gestern', '2026-09-27'), plan('geloggt', '2026-09-25', 'aida'), plan('morgen', '2026-09-29')];
    const besuche = [{ operaId: 'aida', houseId: 'semperoper', date: '2026-09-25' }];
    assert.deepEqual(offenePlaene(p, besuche, HEUTE).map(x => x.id), ['gestern', 'alt']);
    assert.equal(erledigt(p[2], besuche), true);
    // Ein anderes Haus am selben Tag erledigt den Plan nicht.
    assert.equal(erledigt(p[2], [{ operaId: 'aida', houseId: 'oper-leipzig', date: '2026-09-25' }]), false);
});

test('ein geloggter Abend findet seinen Plan', () => {
    const p = [plan('x', '2026-09-27'), plan('y', '2026-09-27', 'aida')];
    assert.equal(planZuBesuch(p, { operaId: 'aida', houseId: 'semperoper', date: '2026-09-27' }).id, 'y');
    assert.equal(planZuBesuch(p, { operaId: 'aida', houseId: 'semperoper', date: '2026-09-26' }), null);
});

test('wann in Worten: heute, gestern, morgen, ein Wochentag, sonst das Datum', () => {
    assert.equal(wannText(HEUTE, HEUTE), 'heute');
    assert.equal(wannText('2026-09-27', HEUTE), 'gestern');
    assert.equal(wannText('2026-09-29', HEUTE), 'morgen');
    assert.equal(wannText('2026-09-26', HEUTE), 'am Samstag');
    assert.equal(wannText('2026-10-03', HEUTE), 'am Samstag');
    assert.equal(wannText('2026-11-14', HEUTE), 'am 14. November');
    assert.equal(wannText('2026-09-14', HEUTE), 'am 14. September');
});
