import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SAMMLUNGEN, bundeslaender, fortschritt } from '../../src/data/sammlungen.js';
import { operas } from '../../src/data/operas.js';
import { operaHouses } from '../../src/data/operaHouses.js';

const stand = (liste, id) => liste.find(s => s.sammlung.id === id);

test('jedes Mitglied einer Sammlung steht im Katalog', () => {
    for (const s of SAMMLUNGEN.filter(s => s.art !== 'bundeslaender')) {
        const katalog = s.art === 'werke' ? operas : operaHouses;
        const fehlt = s.mitglieder.filter(id => !katalog.some(e => e.id === id));
        assert.deepEqual(fehlt, [], `${s.id}: nicht im Katalog`);
    }
});

test('die Bundesländer sind die 16 deutschen, ohne Österreich und die Schweiz', () => {
    const liste = bundeslaender();
    assert.equal(liste.length, 16);
    assert.ok(!liste.includes('Österreich') && !liste.includes('Schweiz'));
});

test('ein Werk zählt geloggt oder als "schon gesehen" markiert', () => {
    const liste = fortschritt([{ operaId: 'ring-walkuere', houseId: 'semperoper' }], ['ring-rheingold']);
    const ring = stand(liste, 'ring');
    assert.equal(ring.erledigt, 2);
    assert.equal(ring.gesamt, 4);
    assert.deepEqual(ring.teile.filter(t => t.erledigt).map(t => t.id), ['ring-rheingold', 'ring-walkuere']);
    assert.equal(ring.teile[0].name, 'Das Rheingold');
});

test('ein Haus zählt nur geloggt, ein Bundesland über seine Häuser', () => {
    const liste = fortschritt([
        { operaId: 'tosca', houseId: 'staatsoper-berlin' },
        { operaId: 'aida', houseId: 'semperoper' },
    ], ['don-giovanni']);
    assert.equal(stand(liste, 'berlin').erledigt, 1);
    const laender = stand(liste, 'bundeslaender');
    assert.equal(laender.erledigt, 2);
    assert.deepEqual(laender.teile.filter(t => t.erledigt).map(t => t.id), ['Berlin', 'Sachsen']);
});

test('begonnene zuerst, die vollständigen danach, unbegonnene zuletzt', () => {
    const liste = fortschritt([
        { operaId: 'nozze-di-figaro', houseId: 'x' }, { operaId: 'don-giovanni', houseId: 'x' },
        { operaId: 'cosi-fan-tutte', houseId: 'x' }, { operaId: 'ring-rheingold', houseId: 'x' },
        { operaId: 'rigoletto', houseId: 'x' }, { operaId: 'la-traviata', houseId: 'x' },
    ]);
    const ids = liste.map(s => s.sammlung.id);
    // Trilogia 2/3 vor Ring 1/4 vor Bayreuth 1/10; dann Da Ponte (vollständig).
    assert.deepEqual(ids.slice(0, 4), ['trilogia', 'ring', 'bayreuth', 'da-ponte']);
    assert.ok(stand(liste, 'da-ponte').vollstaendig);
    // Unbegonnene: die kleinsten vorn.
    assert.equal(liste.at(-1).sammlung.id, 'bundeslaender');
});
