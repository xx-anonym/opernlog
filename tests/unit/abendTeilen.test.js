// Einen Abend teilen: Link, Text und Bilddaten (src/abendTeilen.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { abendLink, abendDirektlink, sterneSatz, abendText, abendbildDaten, abendDateiname } from '../../src/abendTeilen.js';
import { abendDatum } from '../../src/components/Teilbild.js';

const TOSCA = { id: 'tosca', title: 'Tosca', composer: 'Giacomo Puccini' };
const SEMPER = { id: 'semperoper', name: 'Semperoper Dresden', city: 'Dresden' };

test('der Link führt auf die Seite des Werks unter opernlog.de', () => {
    assert.equal(abendLink(TOSCA), 'https://opernlog.de/oper/tosca/');
    assert.equal(abendLink({ id: 'le nozze', title: 'x' }), 'https://opernlog.de/oper/le%20nozze/');
});

test('ein Werk aus der Datenbank hat vielleicht noch keine Seite: dann die Startseite', () => {
    assert.equal(abendLink({ ...TOSCA, id: 'neu', ausDatenbank: true }), 'https://opernlog.de/');
    assert.equal(abendLink(undefined), 'https://opernlog.de/');
});

test('Sterne als Satz, halbe mit Komma, ohne Bewertung leer', () => {
    assert.equal(sterneSatz(4), '4 von 5 Sternen');
    assert.equal(sterneSatz(3.5), '3,5 von 5 Sternen');
    assert.equal(sterneSatz(1), '1 von 5 Stern');
    assert.equal(sterneSatz(0), '');
    assert.equal(sterneSatz(null), '');
    assert.equal(sterneSatz(9), '5 von 5 Sternen');
});

test('das Datum kommt aus dem Kalendertag, nicht aus der Ortszeit', () => {
    assert.equal(abendDatum('2026-05-01'), 'Freitag, 1. Mai 2026');
    assert.equal(abendDatum('2026-05-01T23:30:00+02:00'), 'Freitag, 1. Mai 2026');
    assert.equal(abendDatum(''), '');
    assert.equal(abendDatum(undefined), '');
});

test('der Text nennt Werk, Haus, Datum, Sterne und endet mit dem Link', () => {
    const t = abendText({ date: '2026-05-01', rating: 4 }, TOSCA, SEMPER);
    assert.equal(t, 'Tosca von Giacomo Puccini\nSemperoper Dresden · Freitag, 1. Mai 2026 · 4 von 5 Sternen\n\nhttps://opernlog.de/oper/tosca/');
});

test('ohne Haus und Bewertung bleibt der Text kurz', () => {
    assert.equal(abendText({ date: '2026-05-01' }, TOSCA, undefined),
        'Tosca von Giacomo Puccini\nFreitag, 1. Mai 2026\n\nhttps://opernlog.de/oper/tosca/');
    assert.equal(abendText({}, undefined, undefined), 'Ein Abend in der Oper\n\nhttps://opernlog.de/');
});

test('die Bilddaten nehmen nur, was der Abend hat – keine Fotos', () => {
    const d = abendbildDaten({ date: '2026-05-01', rating: 3.5, review: 'Großartig.', conductor: ' Christian Thielemann ', director: null, andenken: [{}] }, TOSCA, SEMPER);
    assert.deepEqual(d, {
        titel: 'Tosca', komponist: 'Giacomo Puccini', haus: 'Semperoper Dresden', stadt: 'Dresden',
        datum: '2026-05-01', sterne: 3.5, review: 'Großartig.', dirigent: 'Christian Thielemann', regie: '',
    });
});

test('der Dateiname ist sicher für jedes System', () => {
    assert.equal(abendDateiname({ date: '2026-05-01' }, TOSCA), 'opernlog-tosca-2026-05-01.png');
    assert.equal(abendDateiname({ date: '2026-05-01' }, { id: 'a/b c' }), 'opernlog-abc-2026-05-01.png');
    assert.equal(abendDateiname({}, undefined), 'opernlog-abend-abend.png');
});

const ID = 'aaaaaaaa-1111-4000-8000-000000000001';

test('der Direktlink führt auf opernlog.de/abend/<id> – nur für Abende in der Datenbank', () => {
    assert.equal(abendDirektlink({ id: ID }), `https://opernlog.de/abend/${ID}`);
    // Ohne Konto: Ids wie "visit-171…" liegen nur im Gerät.
    assert.equal(abendDirektlink({ id: 'visit-1731000000000' }), null);
    // Noch nicht abgeglichen: auf dem Server gibt es ihn noch nicht.
    assert.equal(abendDirektlink({ id: ID, ausstehend: true }), null);
    assert.equal(abendDirektlink(undefined), null);
});

test('mit Direktlink endet der Text darauf, statt auf der Seite des Werks', () => {
    const t = abendText({ id: ID, date: '2026-05-01', rating: 4 }, TOSCA, SEMPER);
    assert.match(t, new RegExp(`\\nhttps://opernlog\\.de/abend/${ID}$`));
    assert.doesNotMatch(t, /\/oper\/tosca\//);
});
