// Wo läuft ein Werk demnächst – Auswahl, Reihenfolge, Schreibweise.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { kommendeAuffuehrungen, terminKurz, heuteIso } from '../../src/data/spielplanAbfrage.js';
import { uebernehmen, seitenrahmen } from '../werkzeug/spielplan-uebernehmen.mjs';

const DATEN = [
    { werk: 'tosca', haus: 'wiener-staatsoper', url: 'https://w.example/tosca', termine: ['2026-10-01', '2026-10-05'] },
    { werk: 'tosca', haus: 'semperoper', url: 'https://s.example/tosca', termine: ['2026-09-01', '2026-11-08'] },
    { werk: 'tosca', haus: 'hamburgische-staatsoper', url: 'https://h.example/tosca', termine: ['2026-09-10'] },
    { werk: 'carmen', haus: 'semperoper', url: 'https://s.example/carmen', termine: ['2026-10-02'] },
];

test('nur kommende Termine, nur das gefragte Werk', () => {
    const z = kommendeAuffuehrungen('tosca', { heute: '2026-09-22', daten: DATEN });
    assert.deepEqual(z.map(x => x.haus.id), ['wiener-staatsoper', 'semperoper']);
    assert.deepEqual(z[1].termine, ['2026-11-08'], 'der vergangene Termin steht noch da');
    // Hamburg hat nur Vergangenes – die Zeile fällt ganz weg.
});

test('ohne Standort nach dem nächsten Termin', () => {
    const z = kommendeAuffuehrungen('tosca', { heute: '2026-09-22', daten: DATEN });
    assert.equal(z[0].km, null);
    assert.equal(z[0].termine[0], '2026-10-01');
});

test('mit Standort nach Entfernung', () => {
    // Dresden: die Semperoper liegt näher als Wien, trotz späterem Termin.
    const z = kommendeAuffuehrungen('tosca', { heute: '2026-09-22', daten: DATEN, position: { lat: 51.05, lon: 13.74 } });
    assert.deepEqual(z.map(x => x.haus.id), ['semperoper', 'wiener-staatsoper']);
    assert.ok(z[0].km < 5, `${z[0].km} km bis zur Semperoper`);
});

test('ein unbekanntes Haus fällt weg statt die Seite zu sprengen', () => {
    const z = kommendeAuffuehrungen('tosca', { heute: '2026-09-22', daten: [{ werk: 'tosca', haus: 'gibt-es-nicht', url: 'x', termine: ['2027-01-01'] }] });
    assert.deepEqual(z, []);
});

test('Termine kurz, mit Jahr nur außerhalb des laufenden', () => {
    assert.equal(terminKurz('2026-10-08', '2026-09-22'), '8. Okt');
    assert.equal(terminKurz('2027-03-01', '2026-09-22'), '1. Mär 2027');
});

test('heute in Ortszeit', () => {
    assert.equal(heuteIso(new Date(2026, 8, 22, 23, 30)), '2026-09-22');
});

// ── Übernahme aus einem Lauf ─────────────────────────────────────────────

const LAUF = {
    'semperoper': { stand: '2026-09-22', start: ['https://semperoper.example/spielplan'], werke: {
        'tosca': { url: 'https://semperoper.example/tosca', komponistGenannt: true, termine: ['2026-10-08', '2026-10-11'] },
        'faust': { url: 'https://semperoper.example/faust', komponistGenannt: false, termine: ['2026-11-01'] },
        'carmen': { url: 'https://semperoper.example/carmen', komponistGenannt: true, termine: [] },
        'gibts-nicht': { url: 'x', komponistGenannt: true, termine: ['2026-10-01'] },
    } },
    'kein-haus': { stand: '2026-09-22', werke: { 'tosca': { url: 'x', komponistGenannt: true, termine: ['2026-10-01'] } } },
};
const LEER = { ausschliessen: [], aufnehmen: [], termineEntfernen: [], adressen: [] };

test('übernommen wird nur, was sicher ein Opernabend ist', () => {
    const { zeilen, weggelassen, stand } = uebernehmen(LAUF, LEER);
    assert.deepEqual(zeilen, [{ werk: 'tosca', haus: 'semperoper', url: 'https://semperoper.example/tosca', termine: ['2026-10-08', '2026-10-11'] }]);
    assert.equal(stand, '2026-09-22');
    const gruende = Object.fromEntries(weggelassen.map(w => [w.werk, w.grund]));
    assert.equal(gruende.faust, 'Komponist nicht genannt');
    assert.equal(gruende.carmen, 'keine Termine');
    assert.equal(gruende['gibts-nicht'], 'nicht im Katalog');
});

test('Korrekturen aus der Durchsicht greifen', () => {
    const { zeilen, weggelassen } = uebernehmen(LAUF, {
        ausschliessen: [{ haus: 'semperoper', werk: 'tosca', grund: 'Ballett' }],
        aufnehmen: [{ haus: 'semperoper', werk: 'faust' }],
        termineEntfernen: [],
        adressen: [{ haus: 'semperoper', werk: 'faust', url: 'https://semperoper.example/faust-gounod' }],
    });
    assert.deepEqual(zeilen.map(z => [z.werk, z.url]), [['faust', 'https://semperoper.example/faust-gounod']]);
    assert.equal(weggelassen.find(w => w.werk === 'tosca').grund, 'Ballett');
});

test('einzelne falsche Termine lassen sich entfernen', () => {
    const { zeilen } = uebernehmen(LAUF, { ...LEER, termineEntfernen: [{ haus: 'semperoper', werk: 'tosca', termine: ['2026-10-08'] }] });
    assert.deepEqual(zeilen[0].termine, ['2026-10-11']);
});

test('Termine auf den Seiten vieler Stücke gehören zur Seite, nicht zum Stück', () => {
    // Die Bayerische Staatsoper zeigt auf jeder Stückseite eine Datumsleiste.
    const leiste = ['2026-09-24', '2026-09-25'];
    const werke = {
        'tosca': { url: 'https://oper.example/tosca', ausSeite: [...leiste, '2027-05-17'], ausListe: [] },
        'carmen': { url: 'https://oper.example/carmen', ausSeite: [...leiste, '2027-04-21'], ausListe: ['2026-09-25'] },
        'aida': { url: 'https://oper.example/aida', ausSeite: [...leiste, '2027-03-01'], ausListe: [] },
        // Ein Abend aus drei Stücken auf einer Seite zählt einmal.
        'il-tabarro': { url: 'https://oper.example/trittico', ausSeite: ['2026-10-03'], ausListe: [] },
        'suor-angelica': { url: 'https://oper.example/trittico', ausSeite: ['2026-10-03'], ausListe: [] },
        'gianni-schicchi': { url: 'https://oper.example/trittico', ausSeite: ['2026-10-03'], ausListe: [] },
    };
    assert.deepEqual([...seitenrahmen(werke)].sort(), leiste);
    const lauf = { 'semperoper': { stand: '2026-09-22', werke: Object.fromEntries(Object.entries(werke).map(([id, w]) =>
        [id, { ...w, komponistGenannt: true, termine: [...new Set([...w.ausSeite, ...w.ausListe])].sort() }])) } };
    const termine = Object.fromEntries(uebernehmen(lauf, LEER).zeilen.map(z => [z.werk, z.termine]));
    assert.deepEqual(termine.tosca, ['2027-05-17']);
    // Was eine Kalenderliste direkt am Titel nennt, bleibt.
    assert.deepEqual(termine.carmen, ['2026-09-25', '2027-04-21']);
    assert.deepEqual(termine['gianni-schicchi'], ['2026-10-03']);
});

test('der Tag des Laufs fällt weg', () => {
    // Kalender auf der Seite zeigen das heutige Datum (Gärtnerplatztheater).
    const lauf = { 'semperoper': { stand: '2026-09-22', werke: {
        'tosca': { url: 'https://semperoper.example/tosca', komponistGenannt: true, termine: ['2026-09-22', '2026-10-08'] },
        'aida': { url: 'https://semperoper.example/aida', komponistGenannt: true, termine: ['2026-09-22'] },
    } } };
    const { zeilen, weggelassen } = uebernehmen(lauf, LEER);
    assert.deepEqual(zeilen.map(z => [z.werk, z.termine]), [['tosca', ['2026-10-08']]]);
    assert.equal(weggelassen.find(w => w.werk === 'aida').grund, 'keine Termine');
});

test('Termine aus einem Spielzeitheft kommen dazu und veralten von selbst', () => {
    const { zeilen, weggelassen } = uebernehmen(LAUF, { ...LEER, ergaenzen: [
        // ein Haus, das der Lauf nicht lesen konnte
        { haus: 'badisches-staatstheater', werk: 'arabella', url: 'https://karlsruhe.example/', termine: ['2026-09-01', '2027-04-04', '2028-01-01'] },
        // ein Werk, das der Lauf schon kennt: die Termine kommen hinzu
        { haus: 'semperoper', werk: 'tosca', url: 'https://heft.example/', termine: ['2026-10-11', '2026-12-01'] },
        { haus: 'semperoper', werk: 'unbekanntes-werk', url: 'https://heft.example/', termine: ['2026-12-01'] },
    ] });
    const zeile = (haus, werk) => zeilen.find(z => z.haus === haus && z.werk === werk);
    // Vor dem Stand und nach der Spielzeit fällt weg.
    assert.deepEqual(zeile('badisches-staatstheater', 'arabella'), { werk: 'arabella', haus: 'badisches-staatstheater', url: 'https://karlsruhe.example/', termine: ['2027-04-04'] });
    // Der Link des Laufs bleibt, die Termine werden vereinigt.
    assert.deepEqual(zeile('semperoper', 'tosca'), { werk: 'tosca', haus: 'semperoper', url: 'https://semperoper.example/tosca', termine: ['2026-10-08', '2026-10-11', '2026-12-01'] });
    assert.equal(zeile('semperoper', 'unbekanntes-werk'), undefined);
    assert.ok(weggelassen.some(w => w.werk === 'unbekanntes-werk' && w.grund === 'nicht im Katalog'));
});

import { dazunehmen } from '../werkzeug/spielplan-uebernehmen.mjs';
import { uebersichtsSeiten, seitenAuswahl, seitenTermine } from '../werkzeug/spielplaene-lesen.mjs';
import { zeitenAusLd } from '../werkzeug/spielplan-termine.mjs';

test('Werke aus der Datenbank zählen, wenn der Lauf sie kannte', () => {
    const lauf = { _werke: [{ id: 'neues-werk', title: 'Neues Werk', composer: 'A. Komponist' }], 'semperoper': { stand: '2026-09-22', werke: {
        'neues-werk': { url: 'https://semperoper.example/neu', komponistGenannt: true, termine: ['2026-11-01'] },
    } } };
    const { zeilen, zusatzwerke } = uebernehmen(lauf, LEER);
    assert.deepEqual(zeilen.map(z => z.werk), ['neues-werk']);
    assert.deepEqual(zusatzwerke, ['neues-werk']);
    // Ohne den Hinweis des Laufs ist es unbekannt.
    const ohne = uebernehmen({ 'semperoper': lauf.semperoper }, LEER);
    assert.equal(ohne.zeilen.length, 0);
    assert.equal(ohne.weggelassen[0].grund, 'nicht im Katalog');
});

test('ein Nachtrag ersetzt nur die gesuchten Werke', () => {
    const bestehend = { stand: '2026-09-23', zeilen: [
        { werk: 'aida', haus: 'semperoper', url: 'https://a.example/', termine: ['2026-10-01'] },
        { werk: 'tosca', haus: 'semperoper', url: 'https://t.example/', termine: ['2026-10-02'] },
    ] };
    const nachtrag = { stand: '2026-11-05', zeilen: [
        { werk: 'tosca', haus: 'oper-frankfurt', url: 'https://f.example/', termine: ['2026-12-01'] },
        // nicht gesucht – bleibt draußen, auch wenn der Lauf es gefunden hat
        { werk: 'aida', haus: 'oper-frankfurt', url: 'https://f.example/aida', termine: ['2026-12-02'] },
    ] };
    const erg = dazunehmen(bestehend, nachtrag, { werke: ['tosca'] });
    assert.deepEqual(erg.zeilen.map(z => `${z.werk}@${z.haus}`), ['aida@semperoper', 'tosca@oper-frankfurt']);
    assert.equal(erg.stand, '2026-09-23');
});

test('ein Nachtrag für ein Haus ersetzt nur dessen Einträge', () => {
    const bestehend = { stand: '2026-09-23', zeilen: [
        { werk: 'elektra', haus: 'opernhaus-zuerich', url: 'https://z.example/elektra', termine: ['2026-10-01'] },
        { werk: 'tosca', haus: 'opernhaus-zuerich', url: 'https://z.example/tosca-alt', termine: ['2026-10-03'] },
        { werk: 'tosca', haus: 'semperoper', url: 'https://t.example/', termine: ['2026-10-02'] },
    ] };
    // Der Lauf fand in Zürich mehr – Elektra ist dort vorbei und fehlt.
    const nachtrag = { stand: '2026-09-24', zeilen: [
        { werk: 'samson-dalila', haus: 'opernhaus-zuerich', url: 'https://z.example/samson', termine: ['2027-03-01'] },
        { werk: 'tosca', haus: 'opernhaus-zuerich', url: 'https://z.example/tosca', termine: ['2027-01-10'] },
        // ein Heft-Nachtrag eines anderen Hauses – bleibt draußen
        { werk: 'tosca', haus: 'badisches-staatstheater', url: 'https://heft.example/', termine: ['2026-12-01'] },
    ] };
    const erg = dazunehmen(bestehend, nachtrag, { haeuser: ['opernhaus-zuerich'] });
    assert.deepEqual(erg.zeilen.map(z => `${z.werk}@${z.haus} ${z.url}`), [
        'samson-dalila@opernhaus-zuerich https://z.example/samson',
        'tosca@opernhaus-zuerich https://z.example/tosca',
        'tosca@semperoper https://t.example/',
    ]);
    assert.equal(erg.stand, '2026-09-23');
});

test('aus dem Menü zählt nur, was ganz eine Übersicht benennt', () => {
    const links = [
        { href: 'https://oper.example/produktion/musiktheaterclub-1/', text: '', menueText: 'Musiktheaterclub 1', verborgen: true },
        { href: 'https://oper.example/service/abos#premieren', text: '', menueText: 'Premieren-Abo (PrA)', verborgen: true },
        { href: 'https://oper.example/spielzeit-26-27', text: '', menueText: 'Spielzeit 26.27', verborgen: true },
        { href: 'https://oper.example/programm/musiktheater', text: '', menueText: 'Musiktheater', verborgen: true },
        // sichtbar gilt die weite Regel wie bisher
        { href: 'https://oper.example/musiktheater-premieren', text: 'Alle Premieren im Musiktheater', verborgen: false },
    ];
    assert.deepEqual(uebersichtsSeiten(links, 'https://oper.example/spielplan'), [
        'https://oper.example/musiktheater-premieren',
        'https://oper.example/spielzeit-26-27',
        'https://oper.example/programm/musiktheater',
    ]);
});

test('ein Menülink auf die Seite eines Werks ist keine Übersicht', () => {
    // Burg Gars: "Oper" im Menü führt direkt zur Bohème.
    const links = [
        { href: 'https://operburggars.at/portfolio-item/la-boheme/', text: '', menueText: 'Oper', verborgen: true },
        { href: 'https://operburggars.at/saison-2026/', text: '', menueText: 'Saison 2026/27', verborgen: true },
    ];
    assert.deepEqual(uebersichtsSeiten(links, 'https://operburggars.at/'), ['https://operburggars.at/saison-2026/']);
});

test('große Häuser: erst jedes Werk eine Seite, dann die zweite', () => {
    // 40 Werke mit je zwei Seiten: früher bekamen die ersten 30 je zwei
    // Seiten, und zehn Werke fielen weg (Wien, München).
    const kandidaten = new Map();
    for (let i = 0; i < 40; i++) {
        kandidaten.set(`https://oper.example/werk-${i}/`, new Set([`w${i}`]));
        kandidaten.set(`https://oper.example/werk-${i}/2026-10-0${1 + (i % 9)}/`, new Set([`w${i}`]));
    }
    const auswahl = seitenAuswahl(kandidaten, new Set(), 60);
    assert.equal(auswahl.size, 60);
    const werke = new Set([...auswahl.values()].flatMap(ids => [...ids]));
    assert.equal(werke.size, 40, 'Werke ohne Seite');
    // die erste Seite je Werk ist die der Produktion, nicht die einer Vorstellung
    assert.ok(auswahl.has('https://oper.example/werk-39/'));
    // schon gelesene Übersichten zählen nicht
    const ohne = seitenAuswahl(new Map([['https://oper.example/spielplan', new Set(['w1'])]]), new Set(['https://oper.example/spielplan']));
    assert.equal(ohne.size, 0);
});

test('ein Termin im Nebensatz verdrängt nicht die Terminliste aus den Attributen', () => {
    const fenster = { von: '2026-09-24', bis: '2027-09-30' };
    // Gelsenkirchen: Termine nur in data-Attributen, im Text ein Hinweis.
    const mir = {
        text: 'Der fliegende Holländer\nOper von Richard Wagner\nMit Audiodeskription am 11.12.2026, 17.00 Uhr\nMitwirkende',
        zusatz: '2026-12-11 19:00 2026-12-18 19:00 2026-12-26 18:00 2027-01-03 18:00',
    };
    assert.deepEqual(seitenTermine(mir, fenster).termine, ['2026-12-11', '2026-12-18', '2026-12-26', '2027-01-03']);
    // Eine Seite mit genau einer Vorstellung im Terminblock bleibt dabei,
    // auch wenn die Attribute mehr Daten tragen (etwa eine Datumsleiste).
    const eine = { text: 'Tosca\nSa 17.10.2026\n19:30 Uhr\nGroßes Haus', zusatz: '2026-10-17 2026-10-18 2026-10-19' };
    assert.deepEqual(seitenTermine(eine, fenster).termine, ['2026-10-17']);
    assert.equal(seitenTermine(eine, fenster).ohneUhrzeit, false);
});

test('mit terminSelektor zählt nur die Terminliste, nicht die Begleittermine im Text', () => {
    const fenster = { von: '2026-09-24', bis: '2027-09-30' };
    // Erfurt: im Text Premiere, Matinee, "Rang frei!" und Absacker; die
    // Vorstellungen nur im Reiter "Termine".
    const erfurt = {
        text: 'Premiere / Sa, 10.10.2026, 19 Uhr\nMatinee / So, 27.09.2026, 11 Uhr\nRang frei! / Di, 06.10.2026, 18.30 Uhr\nAbsacker / Fr, 12.02.2027, 22.40 Uhr',
        zusatz: '2026-09-27 2026-10-06 2026-10-10',
        eintraege: [
            { datum: '2026-09-20', text: 'So. 20 / Sept. 2026 18:00' },
            { datum: '2026-10-10', text: 'Sa. 10 / Okt. 2026 Premiere 19:00' },
            { datum: '2026-10-18', text: 'So. 18 / Okt. 2026 18:00 Tickets' },
            { datum: '2027-02-12', text: 'Fr. 12 / Feb. 2027 19:30' },
        ],
    };
    const erg = seitenTermine(erfurt, fenster);
    assert.deepEqual(erg.termine, ['2026-10-10', '2026-10-18', '2027-02-12']);
    assert.deepEqual(erg.zeiten, { '2026-10-10': '19:00', '2026-10-18': '18:00', '2027-02-12': '19:30' });
    assert.equal(erg.ohneUhrzeit, false);
    // Ohne Einträge (Selektor trifft nichts) gilt die bisherige Lesart.
    assert.ok(seitenTermine({ ...erfurt, eintraege: [] }, fenster).termine.includes('2026-10-06'));
});

test('eine vergangene Spielzeit in der Adresse bestimmt das Jahr nicht', () => {
    const fenster = { von: '2026-09-25', bis: '2027-09-30' };
    // Oldenburg: Wiederaufnahme unter der Adresse der Premierenspielzeit
    const alt = { endUrl: 'https://staatstheater.de/programm/musiktheater/spielzeit-25/26/il-barbiere-di-siviglia', text: 'SA 17.10. 19:30 UHR\nKARTEN', zusatz: '' };
    assert.deepEqual(seitenTermine(alt, fenster).termine, ['2026-10-17']);
    const neu = { endUrl: 'https://staatstheater.de/programm/musiktheater/spielzeit-2627/fidelio', text: 'SA 12.6. 19:30 UHR\nKARTEN', zusatz: '' };
    assert.deepEqual(seitenTermine(neu, fenster).termine, ['2027-06-12']);
});

test('Übersichtslinks aus dem zugeklappten Menü zählen, die sichtbaren zuerst', () => {
    const links = [
        { href: 'https://www.opernhaus.ch/spielplan/spielzeit-ueberblick-2026-27/', text: '', menueText: 'Spielzeit 2026/27', verborgen: true },
        { href: 'https://www.opernhaus.ch/spielplan/kalendarium/tosca/', text: 'Tosca', verborgen: false },
        { href: 'https://andere.example/spielzeit-2026-27/', text: 'Spielzeit 2026/27', verborgen: false },
        { href: 'https://www.opernhaus.ch/premieren/', text: 'Premieren', verborgen: false },
    ];
    assert.deepEqual(uebersichtsSeiten(links, 'https://www.opernhaus.ch/spielplan/kalendarium/'), [
        'https://www.opernhaus.ch/premieren/',
        'https://www.opernhaus.ch/spielplan/spielzeit-ueberblick-2026-27/',
    ]);
});

test('Zeiten kommen mit – nur für Termine, die bleiben, und nur gültige', () => {
    const lauf = { 'semperoper': { stand: '2026-09-22', werke: {
        'tosca': { url: 'https://semperoper.example/tosca', komponistGenannt: true,
            termine: ['2026-09-22', '2026-10-08', '2026-10-11'],
            zeiten: { '2026-09-22': '19:00', '2026-10-08': '19:30-22:15', '2026-10-11': '25:00' } },
    } } };
    const { zeilen } = uebernehmen(lauf, { ...LEER, ergaenzen: [
        { haus: 'semperoper', werk: 'tosca', url: 'https://heft.example/', termine: ['2026-10-11', '2026-10-20'], zeiten: { '2026-10-11': '18:00', '2026-10-08': '11:00' } },
    ] });
    // Der Lauftag fällt weg, "25:00" ist keine Uhrzeit, das Heft füllt die Lücke,
    // überschreibt aber nicht, was die Seite sagt.
    assert.deepEqual(zeilen[0].zeiten, { '2026-10-08': '19:30-22:15', '2026-10-11': '18:00' });
});

import { abendeImHaus } from '../../src/data/spielplanAbfrage.js';

test('die Abende eines Hauses: nur dieses, nur kommende, nach Datum und Uhrzeit', () => {
    const daten = [
        { werk: 'tosca', haus: 'semperoper', url: 'https://s.example/tosca', termine: ['2026-09-01', '2026-10-05', '2026-10-03'], zeiten: { '2026-10-05': '19:00' } },
        { werk: 'aida', haus: 'semperoper', url: 'https://s.example/aida', termine: ['2026-10-05'], zeiten: { '2026-10-05': '18:00' } },
        { werk: 'carmen', haus: 'oper-frankfurt', url: 'https://f.example/', termine: ['2026-10-04'] },
    ];
    const abende = abendeImHaus('semperoper', { heute: '2026-10-01', daten });
    assert.deepEqual(abende.map(a => `${a.datum} ${a.zeit || '–'} ${a.werk}`),
        ['2026-10-03 – tosca', '2026-10-05 18:00 aida', '2026-10-05 19:00 tosca']);
    assert.equal(abende[0].haus.id, 'semperoper');
    assert.deepEqual(abendeImHaus('haus-fuer-mozart', { heute: '2026-10-01', daten }), []);
});

test('Uhrzeiten aus schema.org-Events, wo der Text nur Daten nennt (Zürich)', () => {
    const fenster = { von: '2026-09-25', bis: '2027-09-30' };
    const zuerich = {
        text: 'La clemenza di Tito\nWolfgang Amadeus Mozart\nSo 07 Mär 2027\nMi 10 Mär 2027',
        zusatz: '2027-03-07T 2027-03-10T',
        ereignisse: [
            { start: '2027-03-07T20:00', ende: '2027-03-07T22:35' },
            { start: '2027-03-07T20:00', ende: '2027-03-07T22:35' },   // Zürich nennt jeden Abend zweimal
            { start: '2027-03-10T19:00', ende: '2027-03-10T21:35' },
            { start: '2027-04-01T19:00' },                              // nicht auf der Seite: bleibt draußen
        ],
    };
    const erg = seitenTermine(zuerich, fenster);
    assert.deepEqual(erg.termine, ['2027-03-07', '2027-03-10']);
    assert.deepEqual(erg.zeiten, { '2027-03-07': '20:00-22:35', '2027-03-10': '19:00-21:35' });
    // Eine Uhrzeit im Text geht vor.
    const mitText = { ...zuerich, text: 'Tosca\nSo 07.03.2027, 19:30 Uhr' };
    assert.deepEqual(seitenTermine(mitText, fenster).zeiten, { '2027-03-07': '19:30' });
});

test('schema.org-Events: nur eindeutige Ortszeiten', () => {
    const fenster = { von: '2026-09-25', bis: '2027-09-30' };
    assert.deepEqual(zeitenAusLd([
        { start: '2026-10-04T18:00:00+02:00', ende: '2026-10-04T21:00:00+02:00' },
        { start: '2026-10-05T17:00:00Z' },                       // UTC: müsste umgerechnet werden
        { start: '2026-10-06T00:00' },                           // Mitternacht: Uhrzeit unbekannt
        { start: '2026-10-07T11:00' }, { start: '2026-10-07T19:30' },   // Matinee und Vorstellung
        { start: '2026-10-08T19:30', ende: '2026-10-09T00:15' },  // Ende nach Mitternacht: nur Beginn
        { start: '2026-08-01T19:30' },                           // vor dem Fenster
    ], fenster), { '2026-10-04': '18:00-21:00', '2026-10-08': '19:30' });
    assert.deepEqual(zeitenAusLd(undefined, fenster), {});
});

test('alle Vorstellungen abgesagt: keine Termine, auch nicht aus den Attributen', () => {
    const fenster = { von: '2026-09-25', bis: '2027-09-30' };
    // Krefeld: Blaubart auf 2027/28 verschoben, jeder Termin mit "Entfällt"
    const krefeld = {
        text: 'Vorstellungen\n29\nApr. 2027\nDO\n18:45\nTheater MG – Theaterbar\nEntfällt\n02\nMai 2027\nSO\n18:00\nTheater MG – GB on stage\nEntfällt\n'
            + 'Hinweis: Die Produktion wird aus dispositorischen Gründen auf die Spielzeit 2027/2028 verschoben.',
        zusatz: '2026-09-25 2027-04-29 2027-05-02',
    };
    assert.deepEqual(seitenTermine(krefeld, fenster).termine, []);
    // Nur einer abgesagt: der andere bleibt.
    const einer = { ...krefeld, text: krefeld.text.replace('Theaterbar\nEntfällt', 'Theaterbar') };
    assert.deepEqual(seitenTermine(einer, fenster).termine, ['2027-04-29']);
});

test('Knöpfe zum Nachladen: auch "weitere Spieltage anzeigen" (Deutsche Oper Berlin)', async () => {
    const { NACHLADEN, NACHLADEN_DIREKT } = await import('../werkzeug/spielplaene-lesen.mjs');
    for (const t of ['weitere Spieltage anzeigen', 'Weitere Termine laden', 'Mehr laden', 'Mehr anzeigen', 'mehr Vorstellungen', 'Alle Termine', 'Load more']) {
        assert.ok(NACHLADEN.test(t), t);
    }
    for (const t of ['weitere Spieltage anzeigen', 'Weitere Termine laden', 'Mehr Vorstellungen anzeigen']) assert.ok(NACHLADEN_DIREKT.test(t), t);
    // Ein allgemeines "Mehr anzeigen" klappt oft nur Text auf: nicht direkt auslösen.
    for (const t of ['Mehr anzeigen', 'Mehr laden']) assert.ok(!NACHLADEN_DIREKT.test(t), t);
    for (const t of ['Weitere Informationen', 'mehr erfahren', 'Tickets']) assert.ok(!NACHLADEN.test(t) && !NACHLADEN_DIREKT.test(t), t);
});

test('Ansichten einzelner Termine: nur Links auf dieselbe Produktion (Frankfurt)', async () => {
    const { terminAnsichten } = await import('../werkzeug/spielplaene-lesen.mjs');
    const seiteUrl = 'https://oper-frankfurt.de/de/spielplan/aida_3/';
    const links = [
        { href: 'https://oper-frankfurt.de/de/spielplan/aida_3/?id_datum=4971#date' },
        { href: 'https://oper-frankfurt.de/de/spielplan/aida_3/?id_datum=4972#date' },
        { href: 'https://oper-frankfurt.de/de/spielplan/aida_3/?id_datum=4972#besetzung' },   // derselbe Termin
        { href: 'https://oper-frankfurt.de/de/spielplan/salome_5/?id_datum=5010#date' },     // andere Produktion
        { href: 'https://oper-frankfurt.de/media/image/produktionen/galerie/aida_org_4387.jpg' },
        { href: 'mailto:info@oper-frankfurt.de' },
    ];
    assert.deepEqual(terminAnsichten(links, seiteUrl, 'id_datum='), [
        'https://oper-frankfurt.de/de/spielplan/aida_3/?id_datum=4971',
        'https://oper-frankfurt.de/de/spielplan/aida_3/?id_datum=4972',
    ]);
});

test('Seitenauswahl: die Seite, deren Adresse das Werk nennt, vor Nebenveranstaltungen (Frankfurt)', () => {
    const b = 'https://oper-frankfurt.de/de/spielplan/';
    const kandidaten = new Map([
        [`${b}kinderbetreuung/`, new Set(['haensel-gretel'])],
        [`${b}opera-next-level/`, new Set(['haensel-gretel'])],
        [`${b}haensel-und-gretel_3/`, new Set(['haensel-gretel'])],
        [`${b}haensel-und-gretel_3/?id_datum=4801`, new Set(['haensel-gretel'])],
    ]);
    const auswahl = [...seitenAuswahl(kandidaten).keys()];
    assert.equal(auswahl[0], `${b}haensel-und-gretel_3/`);
    assert.equal(auswahl.length, 2);
});

test('ein Tag ohne Jahr, den die Seite mit einem vergangenen Jahr nennt, ist vorbei (Bonn)', () => {
    const fenster = { von: '2026-09-26', bis: '2027-09-30' };
    const bonn = { text: 'PREMIERE AM 3. OKTOBER IM OPERNHAUS\nText von Polina Sandler.\nDIE MEISTERSINGER VON NÜRNBERG\nPremiere 3. Oktober 2024', zusatz: '' };
    assert.deepEqual(seitenTermine(bonn, fenster).termine, []);
    // Mit Uhrzeit ist es eine Vorstellung dieser Spielzeit.
    const wieder = { text: 'Premiere 3. Oktober 2024\nWiederaufnahme\nSa 3.10. 19:30 Uhr\nSo 11.10. 18:00 Uhr', zusatz: '' };
    assert.deepEqual(seitenTermine(wieder, fenster).termine, ['2026-10-03', '2026-10-11']);
});

test('strukturierte Termine gehen vor: ein Datum ohne Uhrzeit, das dort fehlt, zählt nicht (Zürich)', () => {
    const fenster = { von: '2026-09-26', bis: '2027-09-30' };
    const zuerich = {
        text: 'Von 20. September 2026 bis 23. April 2027\nTamino\n20, 25 Sept. / 06, 18 Okt.\nTamino\n02, 08 Apr.\nSarastro\n20, 25 Sept. / 06 Okt.',
        zusatz: '',
        ereignisse: ['2026-10-06T19:00', '2026-10-18T13:00', '2027-04-02T19:00', '2027-04-08T19:30'].map(start => ({ start })),
    };
    const erg = seitenTermine(zuerich, fenster);
    assert.deepEqual(erg.termine, ['2026-10-06', '2026-10-18', '2027-04-02', '2027-04-08']);
    // Mit Uhrzeit im Text bleibt ein Termin, auch wenn die Daten ihn nicht kennen.
    const mitZeit = { ...zuerich, text: 'So 30.05.2027, 19:00 Uhr\n' + zuerich.text };
    assert.ok(seitenTermine(mitZeit, fenster).termine.includes('2027-05-30'));
});

test('Artikel über ein Stück sind keine Produktionsseiten (Bonn, Schwerin, Bremen)', async () => {
    const { ARTIKEL } = await import('../werkzeug/spielplaene-lesen.mjs');
    for (const u of ['https://www.theater-bonn.de/de/magazin/freddie_de_tommaso', 'https://www.theater-bonn.de/de/meistersinger_magazin/',
        'https://www.theater-bonn.de/de/eugen_onegin/magazin/', 'https://www.theater-bonn.de/de/blind_date/madama_butterfly/',
        'https://www.mecklenburgisches-staatstheater.de/magazin/zwischen-maerchen-posse-und-traktat.html', 'https://theaterbremen.de/de_DE/blog?p=1&tag=3168']) {
        assert.ok(ARTIKEL.test(u), u);
    }
    for (const u of ['https://www.theater-bonn.de/de/programm/nabucco/238124', 'https://www.staatstheater-cottbus.de/de/programm/repertoire/artikel-nabucco.html',
        'https://www.oper-leipzig.de/de/programm/salome/224']) {
        assert.ok(!ARTIKEL.test(u), u);
    }
});

test('beste Seite: eine Produktionsseite mit Terminen vor einer ohne, Einzelvorstellungen zuletzt (Bonn, Wien)', async () => {
    const { besteSeite } = await import('../werkzeug/spielplaene-lesen.mjs');
    const bonn = [
        { url: 'https://www.theater-bonn.de/de/TOSCA', termine: [] },
        { url: 'https://www.theater-bonn.de/de/programm/tosca/237695', termine: ['2027-06-17', '2027-06-20'] },
    ];
    assert.equal(besteSeite(bonn).url, 'https://www.theater-bonn.de/de/programm/tosca/237695');
    const wien = [
        { url: 'https://www.wiener-staatsoper.at/kalender/detail/tosca/', termine: ['2026-10-02'] },
        { url: 'https://www.wiener-staatsoper.at/kalender/detail/tosca/2026-11-20/', termine: ['2026-11-01', '2026-11-20', '2026-12-01'] },
    ];
    assert.equal(besteSeite(wien).url, 'https://www.wiener-staatsoper.at/kalender/detail/tosca/');
    // Auch leer geht die Seite der Produktion der einzelnen Vorstellung vor.
    assert.equal(besteSeite([{ ...wien[0], termine: [] }, wien[1]]).url, wien[0].url);
});

test('Seitenauswahl: das Verzeichnis der Produktionen vor Sonderseiten, Zusatzvorstellungen dazu (Bonn)', () => {
    const b = 'https://www.theater-bonn.de/de/';
    const k = new Map([
        [`${b}barbier-party`, new Set(['barbiere'])],
        [`${b}zusatzvorstellung/der-barbier-von-sevilla`, new Set(['barbiere'])],
        [`${b}programm/der-barbier-von-sevilla/238228`, new Set(['barbiere'])],
        [`${b}programm/der-barbier-von-sevilla/227939`, new Set(['barbiere'])],
        [`${b}programm/aida/234684`, new Set(['aida'])],
        [`${b}programm/tosca/237695`, new Set(['tosca'])],
        [`${b}programm/nabucco/238124`, new Set(['nabucco'])],
        [`${b}programm/la-boheme/234668`, new Set(['la-boheme'])],
        [`${b}TOSCA`, new Set(['tosca'])],
    ]);
    const auswahl = [...seitenAuswahl(k).keys()];
    assert.ok(auswahl.includes(`${b}programm/der-barbier-von-sevilla/238228`), 'Produktionsseite fehlt');
    assert.ok(auswahl.includes(`${b}zusatzvorstellung/der-barbier-von-sevilla`), 'Zusatzvorstellung fehlt');
    assert.ok(!auswahl.includes(`${b}barbier-party`), 'Sonderseite gelesen');
});

test('Hauptverzeichnis: nicht das der Ticketseiten je Vorstellung (Staatsoper Berlin)', async () => {
    const { hauptVerzeichnis } = await import('../werkzeug/spielplaene-lesen.mjs');
    const s = 'https://www.staatsoper-berlin.de/de/';
    const k = new Map();
    for (const [w, n] of [['tosca', 23], ['salome', 96], ['norma', 15538], ['rigoletto', 2774], ['nabucco', 15505]]) {
        k.set(`${s}veranstaltungen/${w}.${n}/`, new Set([w]));
        for (let i = 0; i < 4; i++) k.set(`${s}spielplan/ticket/${w}.1539${n % 10}${i}`, new Set([w]));
    }
    // Ein Werk nur mit Ticketseiten: das Ticketverzeichnis hat mehr Werke.
    for (let i = 0; i < 4; i++) k.set(`${s}spielplan/ticket/carmen.1541${i}`, new Set(['carmen']));
    assert.equal(hauptVerzeichnis(k), 'de/veranstaltungen');
    const auswahl = [...seitenAuswahl(k).keys()];
    assert.ok(auswahl.includes(`${s}veranstaltungen/tosca.23/`), 'Produktionsseite fehlt');
});

test('bekannte Kinderfassungen sind nicht das Werk (Halle, Salzburg)', async () => {
    const { KINDERFASSUNG } = await import('../werkzeug/spielplaene-lesen.mjs');
    assert.ok(KINDERFASSUNG.test('papageno spielt auf der zauberflote'));
    assert.ok(KINDERFASSUNG.test('Die kleine Zauberflöte'));
    assert.ok(!KINDERFASSUNG.test('Die Zauberflöte'));
});

test('eine "Preview" ist eine Nebenveranstaltung (Zürich)', async () => {
    const { NEBENHER } = await import('../werkzeug/spielplaene-lesen.mjs');
    assert.ok(NEBENHER.test('Sa 14 Nov\n\n11.30\n\nBernhard Theater\nPreview «Elektra»\nTICKETS'));
    assert.ok(NEBENHER.test('https://www.opernhaus.ch/spielplan/kalendarium/preview-elektra/'));
    assert.ok(!NEBENHER.test('So 22 Nov\n18.00\nOpernhaus\nElektra\nTICKETS'));
});

test('ausschliessen mit url trifft nur diese Produktion (Volksoper, Killing Carmen)', () => {
    const k = { ...LEER, ausschliessen: [{ haus: 'semperoper', werk: 'tosca', url: 'andere-tosca', grund: 'Bearbeitung' }] };
    assert.equal(uebernehmen(LAUF, k).zeilen.length, 1, 'die echte Tosca bleibt');
    const k2 = { ...LEER, ausschliessen: [{ haus: 'semperoper', werk: 'tosca', url: 'semperoper.example/tosca', grund: 'Bearbeitung' }] };
    assert.equal(uebernehmen(LAUF, k2).zeilen.length, 0);
});
