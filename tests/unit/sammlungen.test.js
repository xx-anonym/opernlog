import { test } from 'node:test';
import assert from 'node:assert/strict';

import { SAMMLUNGEN, bundeslaender, fortschritt, merkmalWerte } from '../../src/data/sammlungen.js';
import { operas } from '../../src/data/operas.js';
import { operaHouses } from '../../src/data/operaHouses.js';

const stand = (liste, id) => liste.find(s => s.sammlung.id === id);

test('jedes Mitglied einer Sammlung steht im Katalog', () => {
    for (const s of SAMMLUNGEN.filter(s => s.art !== 'merkmal')) {
        const katalog = s.art === 'werke' ? operas : operaHouses;
        const fehlt = s.mitglieder.filter(id => !katalog.some(e => e.id === id));
        assert.deepEqual(fehlt, [], `${s.id}: nicht im Katalog`);
    }
});

// Ein Wert, den kein Werk und kein Haus im Katalog hat, ließe sich nie abhaken.
test('jeden Wert eines Merkmals trägt mindestens ein Eintrag im Katalog', () => {
    for (const s of SAMMLUNGEN.filter(s => s.art === 'merkmal')) {
        const katalog = s.von === 'werke' ? operas : operaHouses;
        const vorhanden = new Set(katalog.flatMap(s.merkmal));
        const fehlt = merkmalWerte(s).filter(w => !vorhanden.has(w));
        assert.deepEqual(fehlt, [], `${s.id}: unerreichbar`);
    }
});

// Die Regeln hinter den Werklisten, gegen den Katalog: kommt ein Werk hinzu,
// das dazugehört, fällt das hier auf.
const ids = id => SAMMLUNGEN.find(s => s.id === id).mitglieder.slice().sort();

test('Mozart: alle seine Opern ab Idomeneo (1781)', () => {
    const regel = operas.filter(o => o.composer === 'Wolfgang Amadeus Mozart' && o.yearComposed >= 1781).map(o => o.id).sort();
    assert.deepEqual(ids('mozart'), regel);
    assert.equal(regel.length, 7);
});

test('Strauss & Hofmannsthal: alle Strauss-Opern mit seinem Libretto', () => {
    const regel = operas.filter(o => o.composer === 'Richard Strauss' && /Hofmannsthal/.test(o.librettist || '')).map(o => o.id).sort();
    assert.deepEqual(ids('strauss-hofmannsthal'), regel);
});

test('Sprachen: genau die, in denen der Katalog mindestens fünf Werke hat', () => {
    const zahl = {};
    operas.forEach(o => String(o.language || '').split('/').forEach(l => { zahl[l] = (zahl[l] || 0) + 1; }));
    const regel = Object.keys(zahl).filter(l => zahl[l] >= 5).sort();
    assert.deepEqual(merkmalWerte(SAMMLUNGEN.find(s => s.id === 'sprachen')).slice().sort(), regel);
});

test('die zehn meistgespielten sind zehn verschiedene Werke', () => {
    assert.equal(new Set(ids('meistgespielt')).size, 10);
});

test('Merkmale: ein Werk zählt für seine Sprache, sein Jahrhundert, seinen Komponisten', () => {
    // Orfeo 1607 italienisch (Monteverdi), Lucia 1835 italienisch (Donizetti),
    // Written on Skin 2012 englisch.
    const liste = fortschritt([{ operaId: 'orfeo', houseId: 'x' }, { operaId: 'written-on-skin', houseId: 'x' }], ['lucia']);
    assert.deepEqual(stand(liste, 'jahrhunderte').teile.filter(t => t.erledigt).map(t => t.id),
        ['17. Jahrhundert', '19. Jahrhundert', '21. Jahrhundert']);
    assert.deepEqual(stand(liste, 'sprachen').teile.filter(t => t.erledigt).map(t => t.id), ['Italienisch', 'Englisch']);
    assert.deepEqual(stand(liste, 'belcanto').teile.filter(t => t.erledigt).map(t => t.id), ['Gaetano Donizetti']);
});

test('ein mehrsprachiges Werk zählt für jede seiner Sprachen', () => {
    // Henzes Bassariden: Deutsch/Englisch.
    const sprachen = stand(fortschritt([{ operaId: 'bassariden', houseId: 'x' }]), 'sprachen');
    assert.deepEqual(sprachen.teile.filter(t => t.erledigt).map(t => t.id), ['Deutsch', 'Englisch']);
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
    const reihe = liste.map(s => s.sammlung.id);
    // Begonnene nach Anteil: Trilogia 2/3, Mozart 3/7, Meistgespielt 4/10,
    // Jahrhunderte 2/5, Sprachen 2/6, Ring 1/4, Bayreuth 1/10; dann Da Ponte
    // (vollständig).
    assert.deepEqual(reihe.slice(0, 8),
        ['trilogia', 'mozart', 'meistgespielt', 'jahrhunderte', 'sprachen', 'ring', 'bayreuth', 'da-ponte']);
    assert.ok(stand(liste, 'da-ponte').vollstaendig);
    // Unbegonnene: die kleinsten vorn.
    assert.equal(liste.at(-1).sammlung.id, 'bundeslaender');
});
