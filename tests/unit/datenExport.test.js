// "Meine Daten herunterladen": was aus den Datenbankzeilen in die Datei wird
// (src/datenExport.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { datenExport, exportDateiname } from '../../src/datenExport.js';

const WERKE = [{ id: 'tosca', title: 'Tosca' }, { id: 'aida', title: 'Aida' }];
const HAEUSER = [{ id: 'semperoper', name: 'Semperoper' }];
const ICH = 'u-ich';
const ANNA = 'u-anna';

function roh(zusatz = {}) {
    return {
        konto: { id: ICH, email: 'ich@example.org' },
        profil: { id: ICH, username: 'Ich' },
        abende: [{ id: 'v1', user_id: ICH, opera_id: 'tosca', house_id: 'semperoper', date: '2026-05-01', rating: 5, cast_list: 'Netrebko' }],
        listen: [{ id: 'l1', type: 'wishlist', items: ['aida', 'semperoper', 'gibt-es-nicht'] }],
        gesehen: [{ user_id: ICH, opera_id: 'aida', created_at: '2026-01-01' }],
        ichFolge: [{ follower_id: ICH, following_id: ANNA, created_at: '2026-02-01' }],
        folgenMir: [{ follower_id: ANNA, following_id: ICH, created_at: '2026-02-02' }],
        anfragen: [{ id: 'a1', sender_id: ANNA, receiver_id: ICH, status: 'accepted' }],
        pushAbos: [{ id: 'p1', endpoint: 'https://push.example/1', p256dh: 'GEHEIM', auth: 'GEHEIM' }],
        passkeys: [],
        personen: [{ id: ANNA, username: 'Anna' }],
        katalog: { werke: [], haeuser: [], komponisten: [], bildausschnitte: [] },
        ...zusatz,
    };
}

test('jeder Abend behält seine Spalten und bekommt Werk und Haus als Namen dazu', () => {
    const [abend] = datenExport(roh(), { werke: WERKE, haeuser: HAEUSER }).abende;
    assert.equal(abend.werk, 'Tosca');
    assert.equal(abend.haus, 'Semperoper');
    assert.equal(abend.cast_list, 'Netrebko');
    assert.equal(abend.rating, 5);
});

test('Listeneinträge tragen ihren Namen, unbekannte Kennungen bleiben mit null stehen', () => {
    const [liste] = datenExport(roh(), { werke: WERKE, haeuser: HAEUSER }).listen;
    assert.deepEqual(liste.eintraege, [
        { id: 'aida', name: 'Aida' },
        { id: 'semperoper', name: 'Semperoper' },
        { id: 'gibt-es-nicht', name: null },
    ]);
});

test('Freunde und Anfragen nennen die andere Person beim Namen', () => {
    const e = datenExport(roh(), { werke: WERKE, haeuser: HAEUSER });
    assert.deepEqual(e.freunde.du_folgst, [{ id: ANNA, name: 'Anna', seit: '2026-02-01' }]);
    assert.deepEqual(e.freunde.folgen_dir, [{ id: ANNA, name: 'Anna', seit: '2026-02-02' }]);
    assert.equal(e.freundschaftsanfragen[0].von, 'Anna');
    assert.equal(e.freundschaftsanfragen[0].an, null);
});

test('die Schlüssel der Push-Abos kommen nicht in die Datei', () => {
    const e = datenExport(roh());
    assert.deepEqual(e.mitteilungen_geraete, [{ id: 'p1', endpoint: 'https://push.example/1' }]);
    assert.doesNotMatch(JSON.stringify(e), /GEHEIM/);
});

test('nicht übertragene Abende und Katalogeinträge erscheinen nur, wenn es welche gibt', () => {
    const ohne = datenExport(roh());
    assert.ok(!('noch_nicht_uebertragen' in ohne));
    assert.ok(!('katalog_von_dir' in ohne));

    const katalog = { werke: [{ id: 'rienzi' }], haeuser: [], komponisten: [], bildausschnitte: [] };
    const mit = datenExport(roh({ katalog }), { ausstehend: [{ id: 'offline-1' }] });
    assert.deepEqual(mit.noch_nicht_uebertragen, [{ id: 'offline-1' }]);
    assert.deepEqual(mit.katalog_von_dir, katalog);
});

test('ließen sich die Passkeys nicht laden, steht null da und keine leere Liste', () => {
    assert.equal(datenExport(roh({ passkeys: null })).passkeys, null);
    assert.deepEqual(datenExport(roh()).passkeys, []);
});

test('Kopf der Datei: Version und Zeitpunkt', () => {
    const jetzt = new Date('2026-09-27T21:30:00Z');
    const e = datenExport(roh(), { version: '2026.09.27', jetzt });
    assert.equal(e.ueber.version, '2026.09.27');
    assert.equal(e.ueber.erstellt, '2026-09-27T21:30:00.000Z');
});

test('der Dateiname trägt das lokale Datum', () => {
    // Kurz vor Mitternacht: nach UTC wäre es noch der Vortag oder schon der
    // nächste, je nach Zeitzone. Gebaut aus lokalen Angaben, passt es immer.
    assert.equal(exportDateiname(new Date(2026, 8, 27, 23, 59)), 'opernlog-daten-2026-09-27.json');
    assert.equal(exportDateiname(new Date(2027, 0, 5, 0, 1)), 'opernlog-daten-2027-01-05.json');
});
