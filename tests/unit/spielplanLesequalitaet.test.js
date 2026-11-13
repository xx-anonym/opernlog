// Wie gut ein Haus gelesen wurde (tests/werkzeug/spielplan-lesequalitaet.mjs)
// und was daraus folgt: bei lückenhaft gelesenen Häusern fällt nichts weg,
// weder in der Übernahme noch im Bericht.
//
// Anlass ist der Lauf vom 13.11.2026 auf GitHub, dessen Issue 28 Produktionen
// "nicht mehr gefunden" meldete. 23 davon gehörten der Bayerischen
// Staatsoper, die jede zweite Seite mit 403 beantwortet hatte.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { gesperrt, gesperrteSeiten, geleseneSeiten, lueckenhaft, luecken, unsicher, lueckeZaehlt, leseGrund, zweiterVersuchLohnt, besseresErgebnis } from '../werkzeug/spielplan-lesequalitaet.mjs';
import { dazunehmen, zeitenZusammen, lueckenhafteHaeuser } from '../werkzeug/spielplan-uebernehmen.mjs';
import { vergleichen, bericht, zusammenfassung } from '../werkzeug/spielplan-vergleich.mjs';
import { bekannteSeiten, mitBekannten } from '../werkzeug/spielplaene-lesen.mjs';

const HEUTE = '2026-11-13';
const zeile = (werk, haus, termine, zeiten) => ({ werk, haus, url: `https://${haus}.example/${werk}`, termine, ...(zeiten ? { zeiten } : {}) });

// Die Bayerische Staatsoper am 13.11.2026, gekürzt.
const MUENCHEN = {
    besucht: [
        { url: 'https://www.staatsoper.de/spielplan/2026-11', status: 403 },
        { url: 'https://www.staatsoper.de/spielplan/2026-12', status: 200 },
        { url: 'https://www.staatsoper.de/spielplan/2027-01', status: 403 },
    ],
    treffer: [
        { url: 'https://www.staatsoper.de/stuecke/carmen/2027-04-21-1900-16268', status: 403, werk: 'carmen' },
        { url: 'https://www.staatsoper.de/stuecke/la-traviata/2026-12-05-1900-16156', status: 200, werk: 'la-traviata' },
    ],
    fehler: [],
    werke: { 'la-traviata': { termine: ['2026-12-05'] }, carmen: { termine: [] } },
};

test('gesperrt sind 403, 429, 5xx und keine Antwort – 404 nicht', () => {
    assert.deepEqual([0, 403, 429, 500, 503].map(gesperrt), [true, true, true, true, true]);
    // Die Staatsoper Berlin hat für August noch keinen Kalender: 404 ist dort
    // die richtige Antwort, kein Zeichen einer Sperre.
    assert.deepEqual([200, 301, 404, 410].map(gesperrt), [false, false, false, false]);
});

test('gesperrte Seiten zählen aus Einstieg, Produktionsseiten und Ladefehlern, jede einmal', () => {
    assert.equal(gesperrteSeiten(MUENCHEN).length, 3);
    assert.equal(geleseneSeiten(MUENCHEN), 5);
    assert.equal(lueckenhaft(MUENCHEN), true);
    assert.equal(leseGrund(MUENCHEN), '3 von 5 Seiten gesperrt (HTTP 403)');
    // Gärtnerplatz: die Einstiegsseite antwortete nicht.
    const ohneAntwort = { besucht: [], treffer: [], fehler: ['https://www.gaertnerplatztheater.de/de/spielplan/index.html: page.goto: Timeout 30000ms exceeded.'] };
    assert.equal(leseGrund(ohneAntwort), '1 von 1 Seite gesperrt (keine Antwort)');
    // Alles lud: nicht lückenhaft, auch mit einem 404 darunter.
    const berlin = { besucht: [{ url: 'a', status: 200 }, { url: 'b', status: 404 }], treffer: [{ url: 'c', status: 200 }], fehler: [] };
    assert.equal(lueckenhaft(berlin), false);
    assert.equal(leseGrund(berlin), 'Seiten luden, aber ohne ein Werk mit Terminen');
    assert.equal(lueckenhaft(undefined), false);
});

test('ein zweiter Versuch lohnt nach Sperren und nach einem leeren Ergebnis', () => {
    const inDerApp = [zeile('carmen', 'x', ['2027-04-21'])];
    assert.equal(zweiterVersuchLohnt(MUENCHEN, inDerApp, HEUTE), true);
    const leer = { besucht: [{ url: 'a', status: 200 }], treffer: [], fehler: [], werke: {} };
    assert.equal(zweiterVersuchLohnt(leer, inDerApp, HEUTE), true);
    // Ein Haus, das die App gar nicht führt oder das nur Vergangenes hat, darf leer sein.
    assert.equal(zweiterVersuchLohnt(leer, [], HEUTE), false);
    assert.equal(zweiterVersuchLohnt(leer, [zeile('carmen', 'x', ['2026-10-01'])], HEUTE), false);
    const gut = { besucht: [{ url: 'a', status: 200 }], treffer: [], fehler: [], werke: { tosca: { termine: ['2027-01-01'] } } };
    assert.equal(zweiterVersuchLohnt(gut, inDerApp, HEUTE), false);
    // Detmold: nur die Kalenderseiten nach Ende der Spielzeit fehlen – kein Grund.
    assert.equal(zweiterVersuchLohnt(DETMOLD, [zeile('alcina', 'landestheater-detmold', ['2027-01-13'])], HEUTE), false);
    assert.equal(zweiterVersuchLohnt(DETMOLD, [zeile('alcina', 'landestheater-detmold', ['2027-08-13'])], HEUTE), true);
});

// Detmold und Luzern antworten für Monate ohne Kalender mit 500 statt 404.
const DETMOLD = {
    besucht: [
        { url: 'https://www.landestheater-detmold.de/de/programm/01-05-2027', status: 200, monat: '2027-05' },
        { url: 'https://www.landestheater-detmold.de/de/programm/01-08-2027', status: 500, monat: '2027-08' },
        { url: 'https://www.landestheater-detmold.de/de/programm/01-09-2027', status: 0, monat: '2027-09' },
    ],
    treffer: [{ url: 'https://www.landestheater-detmold.de/de/programm/alcina/41725783', status: 200, werk: 'alcina' }],
    fehler: ['https://www.landestheater-detmold.de/de/programm/01-09-2027: page.goto: Timeout 30000ms exceeded.'],
    werke: { alcina: { termine: ['2027-01-13'] } },
};

test('was fehlt: das ganze Haus, einzelne Monate oder einzelne Werke', () => {
    // München: Monatsseiten ohne Monatsangabe (alter Lauf) zählen fürs ganze
    // Haus, die gesperrte Produktionsseite für ihr Werk.
    assert.deepEqual(luecken(MUENCHEN), { ganz: true, monate: [], werke: ['carmen'] });
    assert.deepEqual(luecken(DETMOLD), { ganz: false, monate: ['2027-08', '2027-09'], werke: [] });
    assert.equal(luecken({ besucht: [{ url: 'a', status: 200 }, { url: 'b', status: 404 }], treffer: [], fehler: [] }), null);
    // Nur die Seite einer Produktion fehlt.
    const eine = { besucht: [{ url: 'a', status: 200 }], treffer: [{ url: 'c', status: 503, werk: 'tosca' }, { url: 'd', status: 200, werk: 'aida' }], fehler: [] };
    assert.deepEqual(luecken(eine), { ganz: false, monate: [], werke: ['tosca'] });
    // Die Ansicht eines einzelnen Termins (Frankfurt) kostet höchstens eine Uhrzeit.
    assert.equal(luecken({ besucht: [{ url: 'a', status: 200 }], treffer: [], fehler: ['https://oper-frankfurt.de/de/spielplan/aida_3/?id_datum=4972: page.goto: Timeout 30000ms exceeded.'] }), null);

    const l = luecken(DETMOLD);
    assert.equal(unsicher(l, 'alcina', '2027-08-20'), true);
    assert.equal(unsicher(l, 'alcina', '2027-05-11'), false);
    assert.equal(unsicher(luecken(eine), 'tosca', '2027-05-11'), true);
    assert.equal(unsicher(luecken(eine), 'aida', '2027-05-11'), false);
    assert.equal(unsicher(luecken(MUENCHEN), 'aida', '2027-05-11'), true);
    assert.equal(unsicher(null, 'aida', '2027-05-11'), false);

    // Gemeldet wird eine Lücke nur, wenn sie etwas trifft, das die App zeigt.
    assert.equal(lueckeZaehlt(l, [zeile('alcina', 'landestheater-detmold', ['2027-01-13'])], HEUTE), false);
    assert.equal(lueckeZaehlt(l, [zeile('alcina', 'landestheater-detmold', ['2027-08-13'])], HEUTE), true);
    assert.equal(lueckeZaehlt(luecken(eine), [], HEUTE), true);
    assert.equal(lueckeZaehlt(null, [], HEUTE), false);
});

test('von zwei Versuchen bleibt der mit mehr Werken, sonst der mit weniger Sperren', () => {
    const zweiter = { ...MUENCHEN, besucht: MUENCHEN.besucht.map(b => ({ ...b, status: 200 })), werke: { 'la-traviata': { termine: ['2026-12-05'] }, carmen: { termine: ['2027-04-21'] } } };
    assert.equal(besseresErgebnis(MUENCHEN, zweiter), zweiter);
    assert.equal(besseresErgebnis(zweiter, MUENCHEN), zweiter);
    const gleichVielAberOffen = { ...MUENCHEN, besucht: MUENCHEN.besucht.map(b => ({ ...b, status: 200 })) };
    assert.equal(besseresErgebnis(MUENCHEN, gleichVielAberOffen), gleichVielAberOffen);
    // Kein Unterschied: der erste bleibt.
    assert.equal(besseresErgebnis(MUENCHEN, { ...MUENCHEN }), MUENCHEN);
});

test('an einem lückenhaft gelesenen Haus fällt nichts weg, Neues kommt dazu', () => {
    const bestehend = { stand: '2026-11-03', zeilen: [
        zeile('carmen', 'bayerische-staatsoper', ['2026-11-01', '2027-04-21', '2027-04-24']),
        zeile('la-traviata', 'bayerische-staatsoper', ['2026-12-05', '2026-12-08'], { '2026-12-05': '19:00' }),
        zeile('tosca', 'semperoper', ['2026-12-01', '2026-12-09']),
    ] };
    const nachtrag = { stand: HEUTE, zeilen: [
        // Traviata: ein Abend nicht mehr gefunden, einer neu, eine Uhrzeit neu.
        zeile('la-traviata', 'bayerische-staatsoper', ['2026-12-05', '2026-12-11'], { '2026-12-11': '18:00' }),
        zeile('tosca', 'semperoper', ['2026-12-09']),
    ] };
    const haeuser = ['bayerische-staatsoper', 'semperoper'];
    const mit = dazunehmen(bestehend, nachtrag, { haeuser, lueckenhaft: { 'bayerische-staatsoper': luecken(MUENCHEN) } }).zeilen;
    const finde = (zeilen, werk) => zeilen.find(z => z.werk === werk);
    assert.deepEqual(finde(mit, 'carmen').termine, ['2026-11-01', '2027-04-21', '2027-04-24']);
    assert.deepEqual(finde(mit, 'la-traviata').termine, ['2026-12-05', '2026-12-08', '2026-12-11']);
    assert.deepEqual(finde(mit, 'la-traviata').zeiten, { '2026-12-05': '19:00', '2026-12-11': '18:00' });
    // Die Semperoper wurde ganz gelesen: dort entfällt der 1. Dezember.
    assert.deepEqual(finde(mit, 'tosca').termine, ['2026-12-09']);

    // Ohne die Angabe wie bisher: Carmen wäre bis auf den gespielten Abend weg.
    const ohne = dazunehmen(bestehend, nachtrag, { haeuser }).zeilen;
    assert.deepEqual(finde(ohne, 'carmen').termine, ['2026-11-01']);
    assert.deepEqual(finde(ohne, 'la-traviata').termine, ['2026-12-05', '2026-12-11']);

    // Und der Bericht meldet für München nur, was dazukam.
    const v = vergleichen(bestehend.zeilen, mit, { heute: HEUTE });
    assert.equal(zusammenfassung(v), '2 mit geänderten Terminen');
    assert.deepEqual(v.geaendert.map(z => [z.werk, z.dazu, z.entfallen]), [['la-traviata', ['2026-12-11'], []], ['tosca', [], ['2026-12-01']]]);
});

test('lückenhafte Häuser eines Laufs, mit Grund', () => {
    const lauf = { _werke: [], 'bayerische-staatsoper': MUENCHEN, semperoper: { besucht: [{ url: 'a', status: 200 }], treffer: [], fehler: [] } };
    assert.deepEqual([...lueckenhafteHaeuser(lauf)], [['bayerische-staatsoper', { ganz: true, monate: [], werke: ['carmen'], grund: '3 von 5 Seiten gesperrt (HTTP 403)' }]]);
});

test('fehlt nur die Kalenderseite eines Monats, bleiben nur dessen Termine', () => {
    // La Traviata in Detmold, 13.11.2026: der 11.5. ist jetzt ein Gastspiel
    // in Viersen und fällt weg – obwohl die Seiten für August und September
    // 500 gaben. Ein Termin im August bliebe.
    const bestehend = { stand: '2026-11-03', zeilen: [
        zeile('la-traviata', 'landestheater-detmold', ['2027-05-11']),
        zeile('alcina', 'landestheater-detmold', ['2027-01-13', '2027-08-20']),
    ] };
    const nachtrag = { stand: HEUTE, zeilen: [zeile('alcina', 'landestheater-detmold', ['2027-01-13'])] };
    const nachher = dazunehmen(bestehend, nachtrag, { haeuser: ['landestheater-detmold'], lueckenhaft: lueckenhafteHaeuser({ 'landestheater-detmold': DETMOLD }) }).zeilen;
    assert.deepEqual(nachher.map(z => [z.werk, z.termine]), [['alcina', ['2027-01-13', '2027-08-20']]]);
});

test('der Bericht nennt lückenhaft gelesene Häuser und den Grund für nicht gelesene', () => {
    const namen = { werk: id => id, haus: id => ({ 'bayerische-staatsoper': 'Bayerische Staatsoper', gaertnerplatztheater: 'Gärtnerplatztheater' }[id] || id) };
    const text = bericht(vergleichen([], [], { heute: HEUTE }), {
        heute: HEUTE, stand: '2026-11-03', namen,
        lueckenhaft: { 'bayerische-staatsoper': '31 von 42 Seiten gesperrt (HTTP 403)', gaertnerplatztheater: '1 von 1 Seite gesperrt (keine Antwort)' },
        nichtGelesen: ['gaertnerplatztheater'],
        gruende: { gaertnerplatztheater: '1 von 1 Seite gesperrt (keine Antwort)' },
    });
    assert.match(text, /### Lückenhaft gelesen[\s\S]*- Bayerische Staatsoper: 31 von 42 Seiten gesperrt \(HTTP 403\)/);
    assert.match(text, /### Nicht gelesen[\s\S]*- Gärtnerplatztheater: 1 von 1 Seite gesperrt \(keine Antwort\)/);
    // Ein nicht gelesenes Haus steht nicht zweimal da.
    assert.equal(text.match(/Gärtnerplatztheater/g).length, 1);
});

test('eine Uhrzeit verliert ihr Ende nicht, nur weil die Seite es gerade nicht zeigt', () => {
    // Koblenz, 13.11.2026: "18:00-21:20 → 18:00" stand als Änderung im Issue.
    assert.deepEqual(zeitenZusammen({ a: '18:00-21:20' }, { a: '18:00' }), { a: '18:00-21:20' });
    // Ein anderer Beginn ist eine Änderung, ein anderes Ende auch.
    assert.deepEqual(zeitenZusammen({ a: '18:00-21:20' }, { a: '19:30' }), { a: '19:30' });
    assert.deepEqual(zeitenZusammen({ a: '18:00-20:40' }, { a: '18:00-21:00' }), { a: '18:00-21:00' });
    // Neues kommt dazu, Altes ohne Nachricht bleibt.
    assert.deepEqual(zeitenZusammen({ a: '18:00' }, { a: '18:00-21:00', b: '19:00' }), { a: '18:00-21:00', b: '19:00' });
    assert.deepEqual(zeitenZusammen({ a: '18:00' }, {}), { a: '18:00' });
    assert.deepEqual(zeitenZusammen(undefined, undefined), {});

    const bestehend = { stand: '2026-11-03', zeilen: [zeile('hoffmanns-erzaehlungen', 'theater-koblenz', ['2026-11-14'], { '2026-11-14': '18:00-21:20' })] };
    const nachtrag = { stand: HEUTE, zeilen: [zeile('hoffmanns-erzaehlungen', 'theater-koblenz', ['2026-11-14'], { '2026-11-14': '18:00' })] };
    const nachher = dazunehmen(bestehend, nachtrag, { haeuser: ['theater-koblenz'] }).zeilen;
    assert.equal(zusammenfassung(vergleichen(bestehend.zeilen, nachher, { heute: HEUTE })), 'Keine Änderungen');
});

test('die Seiten, auf die die App verlinkt, liest der Lauf immer mit', () => {
    const app = [
        { werk: 'salome', haus: 'staatsoper-berlin', url: 'https://www.staatsoper-berlin.de/de/veranstaltungen/salome.96/#termine', termine: ['2027-01-10'] },
        { werk: 'tosca', haus: 'staatsoper-berlin', url: 'https://www.staatsoper-berlin.de/de/veranstaltungen/tosca.23/', termine: ['2026-12-01'] },
        // vorbei: kein Grund mehr, die Seite zu lesen
        { werk: 'aida', haus: 'staatsoper-berlin', url: 'https://www.staatsoper-berlin.de/de/veranstaltungen/aida.1/', termine: ['2026-10-01'] },
        { werk: 'salome', haus: 'semperoper', url: 'https://www.semperoper.de/salome', termine: ['2027-01-10'] },
    ];
    const bekannt = bekannteSeiten(app, 'staatsoper-berlin', HEUTE);
    assert.deepEqual(bekannt, [
        { werk: 'salome', url: 'https://www.staatsoper-berlin.de/de/veranstaltungen/salome.96/' },
        { werk: 'tosca', url: 'https://www.staatsoper-berlin.de/de/veranstaltungen/tosca.23/' },
    ]);
    // Tosca fand der Lauf selbst; Salome nicht – ihr Kalender lud nur halb.
    const auswahl = new Map([['https://www.staatsoper-berlin.de/de/veranstaltungen/tosca.23/', new Set(['tosca'])]]);
    mitBekannten(auswahl, bekannt, new Set(), null);
    assert.deepEqual([...auswahl.keys()], [
        'https://www.staatsoper-berlin.de/de/veranstaltungen/tosca.23/',
        'https://www.staatsoper-berlin.de/de/veranstaltungen/salome.96/',
    ]);
    assert.deepEqual([...auswahl.get('https://www.staatsoper-berlin.de/de/veranstaltungen/salome.96/')], ['salome']);
    // Eine Seite, die schon als Übersicht gelesen ist, nicht noch einmal;
    // ein Werk, nach dem gerade nicht gesucht wird, auch nicht.
    assert.equal(mitBekannten(new Map(), bekannt, new Set(bekannt.map(b => b.url)), null).size, 0);
    assert.deepEqual([...mitBekannten(new Map(), bekannt, new Set(), new Set(['tosca'])).keys()], ['https://www.staatsoper-berlin.de/de/veranstaltungen/tosca.23/']);
    // Ein Werk, das der Katalog nicht (mehr) kennt, wird nicht gelesen.
    assert.equal(mitBekannten(new Map(), [{ werk: 'gibt-es-nicht', url: 'https://x.example/' }], new Set(), null).size, 0);
});

test('sperrt ein Haus schon alle Einstiegsseiten, liest der Lauf dort nicht weiter', async () => {
    const { ganzGesperrt } = await import('../werkzeug/spielplaene-lesen.mjs');
    assert.equal(ganzGesperrt({ besucht: [{ url: 'a', status: 403 }, { url: 'b', status: 403 }], fehler: [] }), true);
    assert.equal(ganzGesperrt({ besucht: [], fehler: ['https://x.example/: page.goto: Timeout 30000ms exceeded.'] }), true);
    // Eine Seite lud: weiterlesen (München auf GitHub, 13.11.2026).
    assert.equal(ganzGesperrt({ besucht: [{ url: 'a', status: 403 }, { url: 'b', status: 200 }], fehler: [] }), false);
    // Ein 404 ist keine Sperre, und ohne Einstiegsseite gibt es nichts zu sperren.
    assert.equal(ganzGesperrt({ besucht: [{ url: 'a', status: 404 }], fehler: [] }), false);
    assert.equal(ganzGesperrt({ besucht: [], fehler: [] }), false);
});
