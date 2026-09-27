// Kalenderdateien für einen Termin aus dem Spielplan.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { kalenderEintrag, kalenderDateiname, kalenderHerunterladen } from '../../src/kalender.js';

const TOSCA = { id: 'tosca', title: 'Tosca', composer: 'Giacomo Puccini' };
const SEMPER = { id: 'semperoper', name: 'Semperoper', city: 'Dresden', state: 'Sachsen', lat: 51.0543, lon: 13.7351 };
const WIEN = { id: 'wiener-staatsoper', name: 'Wiener Staatsoper', city: 'Wien', state: 'Österreich', lat: 48.2, lon: 16.37 };
const JETZT = new Date(Date.UTC(2026, 8, 23, 12, 0, 0));
const URL = 'https://www.semperoper.de/spielplan/tosca';

// Gefaltete Zeilen zurück zu einer, wie ein Kalender sie liest.
const zeilen = ics => ics.replace(/\r\n /g, '').split('\r\n');
const wert = (ics, name) => zeilen(ics).find(z => z.startsWith(name))?.slice(name.length);

test('mit Beginn und Ende: Ortszeit samt Zeitzone, Ort, Link', () => {
    const ics = kalenderEintrag({ werk: TOSCA, haus: SEMPER, datum: '2026-12-05', zeit: '19:00-22:30', url: URL, jetzt: JETZT });
    assert.equal(wert(ics, 'DTSTART;TZID=Europe/Berlin:'), '20261205T190000');
    assert.equal(wert(ics, 'DTEND;TZID=Europe/Berlin:'), '20261205T223000');
    assert.ok(zeilen(ics).includes('TZID:Europe/Berlin'), 'die Zeitzone ist beschrieben');
    assert.equal(wert(ics, 'SUMMARY:'), 'Tosca – Semperoper');
    assert.equal(wert(ics, 'LOCATION:'), 'Semperoper\\, Dresden\\, Deutschland');
    assert.equal(wert(ics, 'GEO:'), '51.0543;13.7351');
    // Apple Kalender zeigt Karte und Route nur mit diesem Feld.
    // Apple übernimmt ihn nur, wenn X-TITLE dem Text in LOCATION entspricht –
    // in Anführungszeichen, sonst liest es die Kommas als Liste –, und ohne
    // Straße gehört kein X-ADDRESS hinein. So zeigte Apple Kalender die Karte.
    assert.equal(wert(ics, 'X-APPLE-STRUCTURED-LOCATION;'),
        'VALUE=URI;X-APPLE-RADIUS=70;X-APPLE-REFERENCEFRAME=1;X-TITLE="Semperoper, Dresden, Deutschland":geo:51.0543,13.7351');
    assert.equal(wert(ics, 'LOCATION:').replace(/\\,/g, ','), 'Semperoper, Dresden, Deutschland');
    assert.equal(wert(ics, 'URL:'), URL);
    assert.equal(wert(ics, 'UID:'), 'tosca-semperoper-2026-12-05@opernlog.vercel.app');
    assert.equal(wert(ics, 'DTSTAMP:'), '20260923T120000Z');
    assert.match(wert(ics, 'DESCRIPTION:'), /Giacomo Puccini: Tosca\\nTermine und Karten: https/);
    assert.doesNotMatch(ics, /geschätzt/);
});

test('ohne Ende drei Stunden, und die Beschreibung sagt es', () => {
    const ics = kalenderEintrag({ werk: TOSCA, haus: SEMPER, datum: '2026-12-05', zeit: '19:30', url: URL, jetzt: JETZT });
    assert.equal(wert(ics, 'DTEND;TZID=Europe/Berlin:'), '20261205T223000');
    assert.match(wert(ics, 'DESCRIPTION:'), /Das Ende ist geschätzt \(3 Stunden\)/);
});

test('über Mitternacht geht es in den nächsten Tag', () => {
    const lang = kalenderEintrag({ werk: TOSCA, haus: SEMPER, datum: '2026-12-31', zeit: '22:30-01:15', jetzt: JETZT });
    assert.equal(wert(lang, 'DTEND;TZID=Europe/Berlin:'), '20270101T011500');
    const spaet = kalenderEintrag({ werk: TOSCA, haus: SEMPER, datum: '2026-12-05', zeit: '22:30', jetzt: JETZT });
    assert.equal(wert(spaet, 'DTEND;TZID=Europe/Berlin:'), '20261206T013000');
});

test('ohne Uhrzeit ganztägig, mit Hinweis', () => {
    const ics = kalenderEintrag({ werk: TOSCA, haus: SEMPER, datum: '2026-12-05', url: URL, jetzt: JETZT });
    assert.equal(wert(ics, 'DTSTART;VALUE=DATE:'), '20261205');
    assert.equal(wert(ics, 'DTEND;VALUE=DATE:'), '20261206');
    assert.ok(!ics.includes('VTIMEZONE'), 'ohne Uhrzeit keine Zeitzone');
    assert.match(wert(ics, 'DESCRIPTION:'), /Die Uhrzeit steht auf der Seite des Hauses/);
});

test('ein Haus in Österreich bekommt die Wiener Zeitzone', () => {
    const ics = kalenderEintrag({ werk: TOSCA, haus: WIEN, datum: '2026-12-05', zeit: '19:00', jetzt: JETZT });
    assert.equal(wert(ics, 'DTSTART;TZID=Europe/Vienna:'), '20261205T190000');
    assert.match(wert(ics, 'X-APPLE-STRUCTURED-LOCATION;'), /X-TITLE="Wiener Staatsoper, Wien, Österreich":geo:/);
});

test('Sonderzeichen werden maskiert, lange Zeilen gefaltet, Zeilen enden mit CRLF', () => {
    const werk = { id: 'x', title: 'Ein Titel; mit, Zeichen', composer: 'Komponistin mit einem sehr, sehr langen Namen und noch mehr Text dahinter' };
    const ics = kalenderEintrag({ werk, haus: SEMPER, datum: '2026-12-05', zeit: '19:00', url: URL, jetzt: JETZT });
    assert.equal(wert(ics, 'SUMMARY:'), String.raw`Ein Titel\; mit\, Zeichen – Semperoper`);
    for (const z of ics.split('\r\n')) assert.ok(new TextEncoder().encode(z).length <= 75, `zu lang: ${z}`);
    assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
    assert.ok(!/[^\r]\n/.test(ics), 'nur CRLF');
});

test('Dateiname aus Werk, Haus und Tag', () => {
    assert.equal(kalenderDateiname(TOSCA, SEMPER, '2026-12-05'), 'tosca-semperoper-2026-12-05.ics');
});

// Wohin die Datei auf iPhone und iPad geht. Die Umgebung ist nachgebaut:
// was geöffnet wird und wohin die Seite springen soll.
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
function apfel({ navigator, standalone = false } = {}) {
    const u = {
        navigator: navigator || { userAgent: IPHONE, ...(standalone ? { standalone: true } : {}) },
        location: { href: 'https://opernlog.vercel.app/index.html#/opera/tosca' },
        geoeffnet: [],
        open(adresse, ziel) { u.geoeffnet.push([adresse, ziel]); },
        matchMedia: () => ({ matches: false }),
    };
    return u;
}
const DATEI = 'https://opernlog.vercel.app/kalender/tosca-semperoper-2026-12-05.ics';

test('iPhone im Safari-Tab: die Datei vom Server in einem eigenen Fenster', () => {
    const u = apfel();
    kalenderHerunterladen('egal', 'tosca-semperoper-2026-12-05.ics', u);
    assert.deepEqual(u.geoeffnet, [[DATEI, '_blank']]);
    assert.equal(u.location.href, 'https://opernlog.vercel.app/index.html#/opera/tosca', 'die App bleibt, wo sie war');
});

test('iPhone, installierte App: die Datei geht an das echte Safari', () => {
    // Das Fenster, das iOS aus der App heraus öffnet, blieb leer – mit
    // blob: wie mit der Datei vom Server.
    const u = apfel({ standalone: true });
    kalenderHerunterladen('egal', 'tosca-semperoper-2026-12-05.ics', u);
    assert.deepEqual(u.geoeffnet, []);
    assert.equal(u.location.href, `x-safari-${DATEI}`);
});

test('installiert erkannt auch am Anzeigemodus, und das iPad zählt mit', () => {
    const u = apfel({ navigator: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', platform: 'MacIntel', maxTouchPoints: 5 } });
    u.matchMedia = anfrage => ({ matches: anfrage === '(display-mode: standalone)' });
    kalenderHerunterladen('egal', 'tosca-semperoper-2026-12-05.ics', u);
    assert.deepEqual(u.geoeffnet, []);
    assert.equal(u.location.href, `x-safari-${DATEI}`);
});

test('Anführungszeichen im Hausnamen brechen den Parameter nicht auf; ohne Koordinaten kein Kartenort', () => {
    const haus = { ...SEMPER, name: 'Theater "Am Markt"; Saal 2' };
    const ics = kalenderEintrag({ werk: TOSCA, haus, datum: '2026-12-05', zeit: '19:00', jetzt: JETZT });
    assert.match(wert(ics, 'X-APPLE-STRUCTURED-LOCATION;'), /X-TITLE="Theater 'Am Markt'; Saal 2, Dresden, Deutschland":geo:/);
    const ohne = kalenderEintrag({ werk: TOSCA, haus: { id: 'x', name: 'Ohne Ort', city: 'Irgendwo' }, datum: '2026-12-05', jetzt: JETZT });
    assert.equal(wert(ohne, 'X-APPLE-STRUCTURED-LOCATION;'), undefined);
    assert.equal(wert(ohne, 'GEO:'), undefined);
});
