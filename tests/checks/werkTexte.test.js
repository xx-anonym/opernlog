// Werktexte (daten/werke/<id>.json, src/data/werkTexte.js): Handlung, bekannte Stellen,
// Wissenswertes. Jede Datei muss gültig sein und zu einem Werk gehören; die
// Seite für Google zeigt sie, Werke ohne Datei behalten die alte Seite.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { operas } from '../../src/data/operas.js';
import { werkTextFehler, ladeWerkText, WERKTEXT_ORDNER } from '../../src/data/werkTexte.js';
import { werkSeite, werkTexteLesen, TERMINE_VORN } from '../werkzeug/seiten-erzeugen.mjs';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TEXTE = werkTexteLesen(WURZEL);
const TOSCA = operas.find(o => o.id === 'tosca');
const HAUS = { id: 'semperoper', name: 'Semperoper', city: 'Dresden', state: 'Sachsen' };
const termin = (datum) => ({ werk: 'tosca', haus: 'semperoper', datum, zeit: '19:00', url: 'https://example.org/' });

test('jede Datei ist gültig und gehört zu einem Werk im Repo', () => {
    assert.ok(TEXTE.size >= 1);
    const ids = new Set(operas.map(o => o.id));
    for (const [id, t] of TEXTE) {
        assert.ok(ids.has(id), `${WERKTEXT_ORDNER}/${id}.json: kein Werk mit dieser Id`);
        assert.deepEqual(werkTextFehler(t), [], id);
        const werk = operas.find(o => o.id === id);
        // Die Akte im Text passen zum Katalog. Prolog und Epilog zählt der
        // Katalog mal mit (Hoffmanns Erzählungen), mal nicht (Pagliacci).
        const ohneRahmen = t.akte.filter(a => !/^(Prolog|Epilog)$/.test(a.titel)).length;
        if (werk.acts) assert.ok(t.akte.length === werk.acts || ohneRahmen === werk.acts, `${id}: ${t.akte.length} Abschnitte im Text, ${werk.acts} Akte im Katalog`);
    }
});

test('werkTextFehler findet, was nicht stimmt', () => {
    const gut = TEXTE.get('tosca');
    assert.deepEqual(werkTextFehler(gut), []);
    assert.deepEqual(werkTextFehler(null), ['kein Objekt']);
    assert.ok(werkTextFehler({ ...gut, anriss: '' }).includes('anriss fehlt'));
    assert.ok(werkTextFehler({ ...gut, anriss: 'x'.repeat(401) }).some(f => /anriss länger/.test(f)));
    assert.ok(werkTextFehler({ ...gut, wissen: ['<script>'] }).some(f => /< oder >/.test(f)));
    assert.ok(werkTextFehler({ ...gut, akte: [] }).includes('akte fehlen'));
    assert.ok(werkTextFehler({ ...gut, extra: 1 }).includes('unbekanntes Feld extra'));
    assert.ok(werkTextFehler({ ...gut, urauffuehrung: { datum: '14.1.1900', ort: 'Rom' } }).includes('urauffuehrung.datum ist kein Datum'));
});

test('ladeWerkText: gültig geladen, fehlend oder kaputt null, je Werk einmal gefragt', async () => {
    let gefragt = 0;
    const abruf = async (url) => {
        gefragt++;
        if (url.endsWith('/tosca.json')) return new Response(JSON.stringify(TEXTE.get('tosca')));
        if (url.endsWith('/kaputt.json')) return new Response(JSON.stringify({ anriss: 'nur das' }));
        return new Response('nicht da', { status: 404 });
    };
    assert.equal((await ladeWerkText('tosca', { abruf })).dauer, TEXTE.get('tosca').dauer);
    await ladeWerkText('tosca', { abruf });
    assert.equal(gefragt, 1);
    assert.equal(await ladeWerkText('gibtsnicht', { abruf }), null);
    assert.equal(await ladeWerkText('kaputt', { abruf }), null);
    assert.equal(await ladeWerkText('', { abruf }), null);
});

test('ohne Netz wird beim nächsten Öffnen noch einmal gefragt', async () => {
    let n = 0;
    const abruf = async () => { n++; if (n === 1) throw new TypeError('Failed to fetch'); return new Response(JSON.stringify(TEXTE.get('tosca'))); };
    assert.equal(await ladeWerkText('netz-weg', { abruf }), null);
    assert.ok(await ladeWerkText('netz-weg', { abruf }));
});

test('Seite mit Text: Titel und Beschreibung wie gesucht wird (Handlung kurz, Arien, Dauer), alle Abschnitte da, maskiert', () => {
    const html = werkSeite(TOSCA, { termine: [termin('2027-01-01')], haeuser: new Map([[HAUS.id, HAUS]]), stand: '2026-11-01', text: TEXTE.get('tosca') });
    assert.match(html, /<title>Tosca – Handlung kurz zusammengefasst, Arien, Termine \| OpernLog<\/title>/);
    assert.match(html, /<meta name="description" content="Tosca von Giacomo Puccini kurz erklärt: Handlung in 3 Akten, bekannte Stellen wie „Recondita armonia“, Dauer ca\. 2 Std\. ohne Pausen – und aktuelle Termine an 1 Opernhaus\.">/);
    for (const teil of ['class="steckbrief"', 'class="anriss"', '<h2>Die Handlung</h2>', '<h2>Bekannte Stellen</h2>', '<h2>Gut zu wissen</h2>']) assert.ok(html.includes(teil), teil);
    assert.match(html, /<li>ca\. 2 Std\. ohne Pausen<\/li><li>3 Akte<\/li><li>Italienisch<\/li><li>Uraufführung 1900, Rom<\/li>/);
    assert.match(html, /<dt>Uraufführung<\/dt><dd>14\. Januar 1900, Teatro Costanzi, Rom<\/dd>/);
    assert.match(html, /<span class="stelle">„Vissi d’arte“<\/span>/);
    // Reihenfolge: Anriss, Termine, Handlung.
    assert.ok(html.indexOf('class="anriss"') < html.indexOf('data-termine') && html.indexOf('data-termine') < html.indexOf('Die Handlung'));
});

test('Seite ohne Text: wie bisher', () => {
    const aida = operas.find(o => o.id === 'aida');
    const html = werkSeite(aida, { termine: [], haeuser: new Map(), stand: '2026-11-01', text: null });
    assert.match(html, /– Termine und Spielplan \| OpernLog<\/title>/);
    assert.doesNotMatch(html, /Die Handlung|class="steckbrief"/);
});

test(`Termine: die nächsten ${TERMINE_VORN} offen, der Rest eingeklappt`, () => {
    const viele = Array.from({ length: 8 }, (_, i) => termin(`2027-01-0${i + 1}`));
    const html = werkSeite(TOSCA, { termine: viele, haeuser: new Map([[HAUS.id, HAUS]]), stand: '2026-11-01', text: null });
    const [vorn, mehr] = html.split('<details class="mehr">');
    assert.equal((vorn.match(/<li data-datum/g) || []).length, TERMINE_VORN);
    assert.equal((mehr.match(/<li data-datum/g) || []).length, 8 - TERMINE_VORN);
    assert.match(mehr, /Weitere <span data-anzahl>3<\/span> Termine zeigen/);
    const wenige = werkSeite(TOSCA, { termine: viele.slice(0, 3), haeuser: new Map([[HAUS.id, HAUS]]), stand: '2026-11-01', text: null });
    assert.doesNotMatch(wenige, /<details class="mehr">/);
});

test('die erzeugte Tosca-Seite im Repo hat die Texte', () => {
    const html = fs.readFileSync(path.join(WURZEL, 'oper/tosca/index.html'), 'utf8');
    assert.ok(html.includes('<h2>Die Handlung</h2>'));
});

test('Bezeichnungen wie "Intermezzo" stehen ohne Anführungszeichen, Zitate mit', async () => {
    const { stelleZitat } = await import('../../src/data/werkTexte.js');
    assert.equal(stelleZitat('Vissi d’arte'), '„Vissi d’arte“');
    assert.equal(stelleZitat('Intermezzo', false), 'Intermezzo');
    assert.ok(werkTextFehler({ ...TEXTE.get('tosca'), stellen: [{ titel: 'x', wer: 'y', akt: 'z', zitat: 'nein' }] }).some(f => /zitat ist kein Wahrheitswert/.test(f)));
    const cav = TEXTE.get('cavalleria-rusticana');
    const html = werkSeite(operas.find(o => o.id === 'cavalleria-rusticana'), { termine: [], haeuser: new Map(), stand: '2026-11-01', text: cav });
    assert.match(html, /<span class="stelle">Intermezzo<\/span>/);
    assert.match(html, /<span class="stelle">„Voi lo sapete, o mamma“<\/span>/);
});

test('in der Beschreibung steht als Beispiel ein Zitat, keine Bezeichnung wie "Ouvertüre"', () => {
    const braut = TEXTE.get('verkaufte-braut');
    assert.equal(braut.stellen[0].zitat, false);
    const html = werkSeite(operas.find(o => o.id === 'verkaufte-braut'), { termine: [], haeuser: new Map(), stand: '2026-11-01', text: braut });
    const beschreibung = html.match(/<meta name="description" content="([^"]+)"/)[1];
    assert.doesNotMatch(beschreibung, /Ouvertüre/);
    assert.match(beschreibung, /wie „Ten lásky sen“/);
    assert.ok(beschreibung.length <= 300, beschreibung.length);
});
