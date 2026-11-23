// Die Platzhalter der Mails aus der Edge Function mail-senden
// (supabase/functions/mail-senden/felder.js): was eingesetzt wird, maskiert
// im HTML, und die Zahlen des Saisonrückblicks.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { einsetzen, maskieren, sterne, datumLang, felderFuer, knopfLink, MIT_ANMELDUNG } from '../../supabase/functions/mail-senden/felder.js';

test('einsetzen: im HTML maskiert, im Klartext nicht, Unbekanntes wird leer', () => {
    const felder = { NAME: '<b>Anna & "Ben"</b>' };
    assert.equal(einsetzen('Hallo %%NAME%%!', felder), 'Hallo <b>Anna & "Ben"</b>!');
    assert.equal(einsetzen('Hallo %%NAME%%!', felder, { html: true }), 'Hallo &lt;b&gt;Anna &amp; &quot;Ben&quot;&lt;/b&gt;!');
    assert.equal(einsetzen('%%HAUS%%|%%NAME%%', { NAME: 'x' }), '|x');
    assert.equal(maskieren("O'Neill"), 'O&#39;Neill');
});

test('Sterne und Datum', () => {
    assert.equal(sterne(4.5), '★★★★½');
    assert.equal(sterne(5), '★★★★★');
    assert.equal(sterne('3'), '★★★');
    assert.equal(sterne(0), '');
    assert.equal(sterne(null), '');
    assert.equal(datumLang('2026-05-16'), '16. Mai 2026');
    assert.equal(datumLang('2026-03-01'), '1. März 2026');
    assert.equal(datumLang(''), '');
});

test('Freundschaftsanfrage und Erinnerung: der Name, mit Ersatz, und der Link', () => {
    const ohneCode = { LINK: 'https://opernlog.de/#/', LINK_TEXT: 'https://opernlog.de/#/' };
    assert.deepEqual(felderFuer('anfrage', { name: 'Ben' }), { NAME: 'Ben', ...ohneCode });
    assert.deepEqual(felderFuer('anfrage', {}), { NAME: 'Jemand', ...ohneCode });
    assert.deepEqual(felderFuer('erinnerung', { name: null }), { NAME: 'Opernfan', ...ohneCode });
    assert.equal(felderFuer('anfrage', { name: 'x'.repeat(80) }).NAME.length, 60);
});

test('Knopf mit Einmal-Code: nur bei Anfrage und Saisonrückblick, Code im #-Teil', () => {
    assert.deepEqual([...MIT_ANMELDUNG].sort(), ['anfrage', 'saison']);
    assert.equal(knopfLink('saison', 'abcDEF123_-xyz'), 'https://opernlog.de/#/mail?code=abcDEF123_-xyz&weiter=%23%2Fseason');
    assert.equal(knopfLink('anfrage', 'abcDEF123_-xyz'), 'https://opernlog.de/#/mail?code=abcDEF123_-xyz&weiter=%23%2F');
    // Ohne (brauchbaren) Code direkt zur Stelle.
    assert.equal(knopfLink('saison'), 'https://opernlog.de/#/season');
    assert.equal(knopfLink('saison', 'kurz'), 'https://opernlog.de/#/season');
    assert.equal(knopfLink('saison', 'a b&c=d"<x>'), 'https://opernlog.de/#/season');

    const anfrage = felderFuer('anfrage', { name: 'Ben' }, { code: 'abcDEF123_-xyz' });
    assert.equal(anfrage.LINK, 'https://opernlog.de/#/mail?code=abcDEF123_-xyz&weiter=%23%2F');
    // Sichtbar unter dem Knopf steht der Code nie.
    assert.equal(anfrage.LINK_TEXT, 'https://opernlog.de/#/');
    // Die Erinnerung meldet nicht an, auch wenn ein Code mitkäme.
    assert.equal(felderFuer('erinnerung', {}, { code: 'abcDEF123_-xyz' }).LINK, 'https://opernlog.de/#/');
    // Im HTML ist das & maskiert, wie es in ein href gehört.
    assert.equal(einsetzen('<a href="%%LINK%%">', anfrage, { html: true }),
        '<a href="https://opernlog.de/#/mail?code=abcDEF123_-xyz&amp;weiter=%23%2F">');
});

test('Saisonrückblick: Zahlen, Einzahl, Titel aus dem Katalog oder aus der Datenbank', () => {
    const f = felderFuer('saison', {
        name: 'Jonas', saison: '2025/26', abende: 14, haeuser: 6, werke: 11, erstmals: 4,
        abend: { werk: 'tosca', haus: 'semperoper', datum: '2026-05-16', sterne: 4.5 },
        haus: { haus: 'staatsoper-berlin', abende: 5 },
    });
    assert.deepEqual(f, {
        NAME: 'Jonas', LINK: 'https://opernlog.de/#/season', LINK_TEXT: 'https://opernlog.de/#/season', SAISON: '2025/26',
        ABENDE: '14', ABENDE_WORT: 'Abende', HAEUSER: '6', HAEUSER_WORT: 'Häuser', WERKE: '11', WERKE_WORT: 'Werke',
        ERSTMALS: 'Davon 4 zum ersten Mal gesehen.',
        ABEND_WERK: 'Tosca', ABEND_ORT: 'Semperoper · 16. Mai 2026', ABEND_STERNE: '★★★★½',
        HAUS: 'Staatsoper Unter den Linden', HAUS_ABENDE: '5 Abende',
    });

    // Ein Abend, ein Haus, ein Werk – und das zum ersten Mal.
    const eins = felderFuer('saison', { abende: 1, haeuser: 1, werke: 1, erstmals: 1, abend: { werk: 'tosca', haus: 'semperoper', datum: '2026-05-16' }, haus: { haus: 'semperoper', abende: 1 } });
    assert.equal(`${eins.ABENDE} ${eins.ABENDE_WORT} · ${eins.HAEUSER} ${eins.HAEUSER_WORT} · ${eins.WERKE} ${eins.WERKE_WORT}`, '1 Abend · 1 Haus · 1 Werk');
    assert.equal(eins.ERSTMALS, 'Zum ersten Mal gesehen.');
    assert.equal(eins.HAUS_ABENDE, '1 Abend');
    // Ohne Bewertung keine Sterne.
    assert.equal(eins.ABEND_STERNE, '');

    // Alles zum ersten Mal; nichts zum ersten Mal: kein Satz.
    assert.equal(felderFuer('saison', { werke: 3, erstmals: 3 }).ERSTMALS, 'Alle zum ersten Mal gesehen.');
    assert.equal(felderFuer('saison', { werke: 3, erstmals: 0 }).ERSTMALS, '');

    // Werke und Häuser aus der Datenbank (vom Admin angelegt): der Titel kommt mit.
    const db = felderFuer('saison', { abend: { werk: 'neu-im-katalog', werk_titel: 'Die Passagierin', haus: 'neues-haus', haus_name: 'Theater Neustadt', datum: '2026-01-02' }, haus: { haus: 'neues-haus', haus_name: 'Theater Neustadt', abende: 2 } });
    assert.equal(db.ABEND_WERK, 'Die Passagierin');
    assert.equal(db.ABEND_ORT, 'Theater Neustadt · 2. Januar 2026');
    assert.equal(db.HAUS, 'Theater Neustadt');
    // Ganz unbekannt: ein Ersatz statt einer Kennung.
    const leer = felderFuer('saison', { abend: { werk: 'gibt-es-nicht' }, haus: {} });
    assert.equal(leer.ABEND_WERK, 'Ein Opernabend');
    assert.equal(leer.HAUS, 'deinem Lieblingshaus');
});
