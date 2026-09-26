// Termine aus Spielplantexten – die Formen, die Opernhäuser tatsächlich benutzen.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { termineAusText } from '../werkzeug/spielplan-termine.mjs';

const F = { von: '2026-09-22', bis: '2027-09-30' };

test('deutsche Schreibweisen', () => {
    assert.deepEqual(termineAusText('Sa 03.10.2026 19:30 · So, 4.10.26 · Fr 16.10.', F),
        ['2026-10-03', '2026-10-04', '2026-10-16']);
    assert.deepEqual(termineAusText('3. Oktober 2026 | 14. Nov. | 1. März', F),
        ['2026-10-03', '2026-11-14', '2027-03-01']);
});

test('ohne Jahr: das nächste Vorkommen im Fenster', () => {
    // Der 10. Mai liegt vor dem 22.09.2026 – also 2027.
    assert.deepEqual(termineAusText('10.05. und 30.09.', F), ['2026-09-30', '2027-05-10']);
});

test('ein Tag, der gerade vorbei ist, springt nicht ins nächste Jahr', () => {
    // Am 22.9. ist "10.09." vorbei – nicht der 10. September 2027. Mainz
    // nennt in der Besetzung alle Abende, auch die schon gespielten.
    assert.deepEqual(termineAusText('10.09. und 30.09.', F), ['2026-09-30']);
    assert.deepEqual(termineAusText('25.09.2026, 20.11.2026\nLeitung: Venzago (13.9., 15.11.)', F), ['2026-09-25', '2026-11-15', '2026-11-20']);
    // Der Tag selbst auch nicht: Bonn zeigte "heute" hinter den Oktoberterminen.
    assert.deepEqual(termineAusText('03.10.2026 · 10.10. · 22.09.', F), ['2026-10-03', '2026-10-10']);
});

test('die Uraufführung vor 150 Jahren ist kein Termin', () => {
    assert.deepEqual(termineAusText('Tosca erlebte am 14. Januar 1900 ihre Uraufführung', F), []);
    assert.deepEqual(termineAusText('premiered October 3, 1900', F), []);
    // … und gibt auch den Daten danach kein Jahr.
    assert.deepEqual(termineAusText('Uraufführung: 16. Februar 1892, Wien · Premiere 3. Oktober', F), ['2026-10-03']);
});

test('eine Spanne nennt keine Vorstellungen', () => {
    // Anfang und Ende einer Serie, oft der Serie nebenan (Krefeld).
    for (const t of ['11. November 2026 – 16. Mai 2027', '19.02.-24.03.2027 / Oper', 'Von 29. September 2026 bis 25. Oktober 2026',
        '14. - 17. Mai 2027', 'Do. 6. August - Sa. 29. August 2027']) {
        assert.deepEqual(termineAusText(t, F), [], t);
    }
    assert.deepEqual(termineAusText('25.09.2026, 07.10.2026', F), ['2026-09-25', '2026-10-07']);
});

test('Matinee, Vorverkauf und Rabatt sind keine Vorstellungen', () => {
    for (const t of ['Einführungsmatinee zu „La traviata“ am 29. November 2026', 'Tickets können ab 2. Dezember 2026 hier erworben werden',
        '16. JUNI\n50 % PREISVORTEIL', 'Extra: Familienführung vor der Vorstellung am 15.11.',
        'Das Vorbestellkontingent ist erschöpft. Der Freiverkauf beginnt am 1.10.26.']) {
        assert.deepEqual(termineAusText(t, F), [], t);
    }
    assert.deepEqual(termineAusText('Aufführung am 3. Oktober 2026', F), ['2026-10-03']);
});

test('Österreich, Schweiz, Englisch, Französisch, Italienisch', () => {
    assert.deepEqual(termineAusText('12. Jänner 2027 · 03/10/2026 · October 5, 2026 · 7 octobre 2026 · 9 novembre · 20 dicembre 2026', F),
        ['2026-10-03', '2026-10-05', '2026-10-07', '2026-11-09', '2026-12-20', '2027-01-12']);
});

test('ISO aus Attributen', () => {
    assert.deepEqual(termineAusText('datetime="2026-11-02T19:30"', F), ['2026-11-02']);
});

test('außerhalb des Fensters und Unsinn fällt weg', () => {
    assert.deepEqual(termineAusText('01.05.2026 · 31.02.2027 · 12.13.2026 · 3. Oktober 2028', F), []);
});

test('Uhrzeiten, Preise und Versionen sind keine Daten', () => {
    assert.deepEqual(termineAusText('19.30 Uhr · 3 Akte · Version 1.2.3 · 12,50 €', F), []);
});

test('Wörter mit Monatsanfang sind keine Monate', () => {
    // "Mai" steckt in "Mainz", "Mar" in "Marnie".
    assert.deepEqual(termineAusText('3 Mainzer Abende · 12 Marnie', F), []);
});

import { termineMitUhrzeit } from '../werkzeug/spielplan-termine.mjs';

test('mit Uhrzeit: nur Vorstellungen, nicht der Rest der Seite', () => {
    const seite = [
        'Heute, 22.09.2026',
        'Vorverkauf ab 01.10.2026',
        'Sa 03.10.2026',
        '19:30 Uhr · Großes Haus',
        'So 11.10. 18.00',
        'Premiere: 14. November 2026, 19 Uhr',
    ].join('\n');
    assert.deepEqual(termineMitUhrzeit(seite, F), ['2026-10-03', '2026-10-11', '2026-11-14']);
});

test('ein Datum ist keine Uhrzeit', () => {
    // "19.10." darf nicht als 19:10 zählen.
    assert.deepEqual(termineMitUhrzeit('Karten ab 19.10.\nMehr Infos', F), []);
});

import { monatsAdressen } from '../werkzeug/spielplaene-lesen.mjs';

test('Monatskalender werden für jeden Monat der Spielzeit eingesetzt', () => {
    const a = monatsAdressen('https://haus.example/spielplan?monat={JJJJ}-{MM}', { von: '2026-11-15', bis: '2027-02-28' });
    assert.deepEqual(a, [
        'https://haus.example/spielplan?monat=2026-11',
        'https://haus.example/spielplan?monat=2026-12',
        'https://haus.example/spielplan?monat=2027-01',
        'https://haus.example/spielplan?monat=2027-02',
    ]);
    assert.deepEqual(monatsAdressen('https://haus.example/spielplan', { von: '2026-11-15', bis: '2027-02-28' }), ['https://haus.example/spielplan']);
});

import { monatsVorlage } from '../werkzeug/spielplaene-lesen.mjs';

const FENSTER = { von: '2026-09-22', bis: '2027-09-30' };

test('Monatsnavigation im Pfad wird zur Vorlage', () => {
    assert.equal(monatsVorlage([
        'https://oper.example/spielplan/kalender/2026-09/',
        'https://oper.example/spielplan/kalender/2026-10/',
        'https://oper.example/spielplan/kalender/2026-11/',
    ], FENSTER), 'https://oper.example/spielplan/kalender/{JJJJ}-{MM}/');
    assert.equal(monatsVorlage(['https://oper.example/de/spielplan/01-10-2026/'], FENSTER),
        'https://oper.example/de/spielplan/01-{MM}-{JJJJ}/');
});

test('… und als Abfragewert', () => {
    assert.equal(monatsVorlage(['https://oper.example/calendar?p=&date_from=2026-10-01&location=alle'], FENSTER),
        'https://oper.example/calendar?p=&date_from={JJJJ}-{MM}-01&location=alle');
});

test('Seiten einzelner Vorstellungen sind keine Monatsnavigation', () => {
    assert.equal(monatsVorlage([
        'https://oper.example/stuecke/semele/2026-09-25-1800-16095',
        'https://oper.example/kalender-eintrag/1356/ical-2026-10-02-1356.ics',
        'https://oper.example/spielplan/tosca/2025-10/',
        'https://oper.example/kalender/detail/die-fledermaus/2026-12-31/',
        'https://oper.example/kalender/detail/die-fledermaus/2027-01-01/',
    ], FENSTER), null);
});

test('ein Jahr auf der Seite gilt für die Daten danach', () => {
    // Salzburg zeigte im September noch den vergangenen Sommer. Ohne Jahr
    // gelesen, wurde aus dem 16. Juli 2026 der 16. Juli 2027.
    assert.deepEqual(termineAusText('Salzburger Festspiele 2026\nCarmen\n16. Juli · 26. Juli', F), []);
    assert.deepEqual(termineMitUhrzeit('Salzburger Festspiele 2026\nCarmen\n16. Juli 19:00\n26. Juli 19:00', F), []);
});

test('eine Spielzeit verteilt die Monate auf zwei Jahre', () => {
    assert.deepEqual(termineAusText('Spielzeit 2026/27 · 12. Okt · 15. Jan · 3. Mai', F),
        ['2026-10-12', '2027-01-15', '2027-05-03']);
});

test('ein volles Datum setzt das Jahr für die folgenden', () => {
    assert.deepEqual(termineAusText('Sa 12.12.2026 · So 13.12. · Di 05.01.2027 · Mi 06.01.', F),
        ['2026-12-12', '2026-12-13', '2027-01-05', '2027-01-06']);
});

test('Jahreszahlen fern der Spielzeit ändern nichts', () => {
    // "Uraufführung 1853" ist kein Kontext.
    assert.deepEqual(termineAusText('Uraufführung 1853 · Fr 16.10.', F), ['2026-10-16']);
});

import { zeilenOrdnen } from '../werkzeug/spielplan-termine.mjs';

test('Kalender mit Tag und Monat in getrennten Zeilen', () => {
    // Detmold
    assert.deepEqual(zeilenOrdnen('Mi\n23\nSeptember\n19:30'), ['Mi', '23. September', '19:30']);
    // Stuttgart, Seite einer Produktion: ein Monatskopf, darunter Wochentag und Tag
    assert.deepEqual(termineMitUhrzeit('Okt 2026\nSo4\n18:00 – 20:30\nOpernhaus\nMi14\n19:00 – 21:30', F), ['2026-10-04', '2026-10-14']);
    // Stuttgart, Monatskalender: Wochentag und Tag in zwei Zeilen
    assert.deepEqual(termineMitUhrzeit('OKT 2026\nFr\n2\n19:30\nSa\n3\n18:00', F), ['2026-10-02', '2026-10-03']);
    // Dortmund: Monatskopf, Tag, Wochentag
    assert.deepEqual(termineMitUhrzeit('November 2026\n07\nSamstag\nOpernhaus 19:30 Uhr\nNovember 2026\n15\nSonntag\nOpernhaus 18:00 Uhr', F), ['2026-11-07', '2026-11-15']);
    // Ohne Monatskopf bleibt eine Zahl eine Zahl.
    assert.deepEqual(termineMitUhrzeit('Fr\n2\n19:30', F), []);
});

test('die Uhrzeit darf ein paar Zeilen tiefer stehen, aber nicht beim nächsten Termin', () => {
    // Krefeld: Datum, Wochentag, Uhrzeit
    assert.deepEqual(termineMitUhrzeit('11 Nov. 2026\nMI\n18:45\nTICKETS', F), ['2026-11-11']);
    // Passau: Datum, Anlass, Ort, Uhrzeit
    assert.deepEqual(termineMitUhrzeit('SAMSTAG, 30. JANUAR 2027\nPremiere\nPassau - Stadttheater\n19:30 Uhr', F), ['2027-01-30']);
    assert.deepEqual(termineMitUhrzeit('Sa 03.10.2026\nGroßes Haus\nSo 04.10.2026\n19:30', F), ['2026-10-04']);
});

test('eine Einführung als eigener Eintrag ist keine Vorstellung', () => {
    assert.deepEqual(termineMitUhrzeit('SONNTAG, 24. JANUAR 2027\nEinführung\nPassau - Foyer\n11:00 Uhr', F), []);
    assert.deepEqual(termineMitUhrzeit('Mo, 19.4., 18.45 Uhr, Grosses Haus\nEinführungssoiree', F), []);
    assert.deepEqual(termineMitUhrzeit('01.04.2027 10:00\nVerkaufsstart V-Club', F), []);
    assert.deepEqual(termineMitUhrzeit('Dernière: Fr, 18.12.2026\n11:00 Uhr\nEINFÜHRUNGS-MATINEE', F), []);
    assert.deepEqual(termineMitUhrzeit('So 02 Mai 2027\n11:00\nMATINEE ZU "ZAR UND ZIMMERMANN"', F), []);
    assert.deepEqual(termineMitUhrzeit('So 02 Mai 2027, 11:00\nMATINEE ZU "ZAR UND ZIMMERMANN"', F), []);
    assert.deepEqual(termineMitUhrzeit('Di 11 Mai 2027\n18:00\nÖFFENTLICHER PROBENBESUCH ZU "ZAR UND ZIMMERMANN"', F), []);
    assert.deepEqual(termineMitUhrzeit('Sonntag, 04.04.2027, 11:00 Uhr\nMatinée', F), []);
    // Krefeld: "Soiree" beendet den Eintrag davor und gehört nicht zur Premiere darunter.
    assert.deepEqual(termineMitUhrzeit('14 Nov. 2026\nSA\n19:30\nTheater MG – Große Bühne\nPremiere', F), ['2026-11-14']);
    assert.ok(termineMitUhrzeit('11 Nov. 2026\nMI\n18:45\nTheater MG – Theaterbar\nSoiree\n14 Nov. 2026\nSA\n19:30\nPremiere', F).includes('2026-11-14'));
    // "Einführung" am Ende des vorigen Eintrags gehört nicht zum nächsten.
    assert.deepEqual(termineMitUhrzeit('Fr 09.10.2026\n19:30 Uhr\nEinführung\nSa 10.10.2026\n19:30 Uhr', F), ['2026-10-09', '2026-10-10']);
    // Eine Einführung vor der Vorstellung macht sie nicht zur Nebensache.
    assert.deepEqual(termineMitUhrzeit('Fr, 16.10.2026, 19:30 Uhr\n19:00 | Stückeinführung', F), ['2026-10-16']);
    assert.deepEqual(termineMitUhrzeit('Di 15.12.2026, 15:00 | martini-Park\nVorverkauf über Besucherservice', F), ['2026-12-15']);
});

test('Gastspiele: mit Ort zählen nur die Termine am eigenen Haus', () => {
    const detmold = 'Mi\n23\nSeptember\n19:30-21:40 • Detmold, Landestheater\nLa bohème\nFr\n9\nOktober\n19:30-21:40 • Wolfsburg, Theater\nLa bohème';
    assert.deepEqual(termineMitUhrzeit(detmold, F, { ort: 'Detmold' }), ['2026-09-23']);
    assert.deepEqual(termineAusText(detmold, F, { ort: 'Detmold' }), ['2026-09-23']);
    assert.deepEqual(termineMitUhrzeit(detmold, F), ['2026-09-23', '2026-10-09']);
});

test('eine Leiste von Terminen zählt auch ohne Uhrzeit', () => {
    // Deutsche Oper Berlin: alle Vorstellungen in einer Zeile, nur die erste mit Uhrzeit
    assert.deepEqual(termineMitUhrzeit('Carmen\nSo 4.10.26 Fr 9.10.26 Fr 16.10.26 Do 4.3.27\nSo 4.10.26, 16:00', F),
        ['2026-10-04', '2026-10-09', '2026-10-16', '2027-03-04']);
    // Frankfurt: Tage unter Monatsköpfen
    assert.deepEqual(termineMitUhrzeit('MAI 2027\nSA\n15.\nDO\n27.\nJUN 2027\nMO\n14.\nSamstag\n15. Mai 2027\nBeginn\n19.00 Uhr', F),
        ['2027-05-15', '2027-05-27', '2027-06-14']);
    // Ein einzelnes Datum ohne Uhrzeit bleibt draußen, ebenso Text mit Daten.
    assert.deepEqual(termineMitUhrzeit('3. Oktober 2026\nMehr erfahren', F), []);
    assert.deepEqual(termineMitUhrzeit('Karten für den 3.10. und 9.10. gibt es an der Kasse', F), []);
});

test('ein ganzes Monatsraster ist keine Leiste', () => {
    const tage = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
    const raster = 'OKT 2026\n' + Array.from({ length: 31 }, (_, i) => `${tage[i % 7]}\n${i + 1}`).join('\n');
    assert.deepEqual(termineMitUhrzeit(raster, F), []);
});

import { produktionsSeite } from '../werkzeug/spielplaene-lesen.mjs';

test('von der Seite einer Vorstellung zur Seite der Produktion', () => {
    // Nürnberg schreibt Datum und Beginn in den Pfad, Wien nur das Datum.
    assert.equal(produktionsSeite('https://oper.example/spielplan-26-27/tosca/19-06-2027/1900'), 'https://oper.example/spielplan-26-27/tosca/');
    assert.equal(produktionsSeite('https://oper.example/kalender/detail/die-fledermaus/2026-12-31/'), 'https://oper.example/kalender/detail/die-fledermaus/');
    assert.equal(produktionsSeite('https://oper.example/spielplan-26-27/tosca/'), null);
});

import { komponistMuster } from '../werkzeug/spielplaene-lesen.mjs';

test('der Komponist wird mit ß und ss erkannt', () => {
    assert.ok(komponistMuster('Strauss').test('Operette von Johann Strauß'));
    assert.ok(komponistMuster('Strauss').test('Johann Strauss (Sohn)'));
    assert.ok(komponistMuster('Strauß').test('Richard Strauss'));
    assert.ok(!komponistMuster('Strauss').test('Straube'));
    assert.ok(komponistMuster('Verdi').test('von Giuseppe Verdi'));
    // Akzente und andere Schreibweisen
    assert.ok(komponistMuster('Tschaikowsky').test('Oper von Pjotr I. Tschaikowski'));
    assert.ok(komponistMuster('Tschaikowsky').test('Oper in drei Akten von Pjotr Tschajkowski'));
    assert.ok(komponistMuster('Dvořák').test('Musik von Antonin Dvorak'));
    assert.ok(komponistMuster('Händel').test('Georg Friedrich Haendel'));
    assert.ok(komponistMuster('Händel').test('George Frideric Handel'));
    assert.ok(komponistMuster('Prokofjew').test('Sergei Prokofiev'));
    assert.ok(!komponistMuster('Tschaikowsky').test('Oper von Giuseppe Verdi'));
});

import { werkeImLink, werkeErgaenzen } from '../werkzeug/spielplaene-lesen.mjs';

test('mit --werke nur die gesuchten, aber gegen den ganzen Katalog geprüft', () => {
    assert.deepEqual(werkeImLink('Tosca', 'https://oper.example/tosca/', new Set(['aida'])), []);
    assert.deepEqual(werkeImLink('Tosca', 'https://oper.example/tosca/', new Set(['tosca'])), ['tosca']);
    // "Lady Macbeth von Mzensk" ist nicht "Macbeth", auch wenn nur Macbeth gesucht wird.
    assert.deepEqual(werkeImLink('Lady Macbeth von Mzensk', 'https://oper.example/lady-macbeth/', new Set(['macbeth'])), []);
});

test('Adressen mit ausgeschriebenen Umlauten und ohne Apostroph treffen', () => {
    // Zürich verlinkt seine Produktionen nur mit "mehr" – es zählt die Adresse.
    assert.deepEqual(werkeImLink('mehr', 'https://www.opernhaus.ch/spielplan/kalendarium/die-walkuere/2026-2027/'), ['ring-walkuere']);
    assert.deepEqual(werkeImLink('mehr', 'https://www.opernhaus.ch/spielplan/kalendarium/lelisir-damore/2026-2027/'), ['elisir']);
    assert.deepEqual(werkeImLink('mehr', 'https://oper.example/die-walkure/'), ['ring-walkuere']);
});

test('Titel treffen auch ohne Akzente und unter ihren deutschen Namen', () => {
    const x = 'https://oper.example/stueck/1/';
    assert.deepEqual(werkeImLink('Andrea Chenier', x), ['andrea-chenier']);
    assert.deepEqual(werkeImLink('Aïda', x), ['aida']);
    assert.deepEqual(werkeImLink('Katja Kabanova', x), ['katja-kabanova']);
    assert.deepEqual(werkeImLink('Les Pecheurs de perles', x), ['perlenfischer']);
    assert.deepEqual(werkeImLink('Madame Butterfly', x), ['madama-butterfly']);
    assert.deepEqual(werkeImLink('Die Puritaner', x), ['i-puritani']);
    assert.deepEqual(werkeImLink('Die Nachtwandlerin', x), ['la-sonnambula']);
    assert.deepEqual(werkeImLink('Margarethe (Faust)', x), ['faust']);
    assert.deepEqual(werkeImLink('Der Ring des Nibelungen: Walküre', x), ['ring-walkuere']);
    assert.deepEqual(werkeImLink('Rheingold', x), ['ring-rheingold']);
    // wie bisher
    assert.deepEqual(werkeImLink('Hänsel und Gretel', x), ['haensel-gretel']);
    assert.deepEqual(werkeImLink('Oper im Steinbruch St. Margarethen', x), []);
});

test('ein Werk aus der Datenbank wird gefunden, sobald es dazukommt', () => {
    assert.deepEqual(werkeImLink('Der Zwerg', 'https://oper.example/zwerg-test/'), []);
    werkeErgaenzen([{ id: 'zwerg-test', title: 'Der Zwerg', composer: 'Alexander Zemlinsky' }]);
    assert.deepEqual(werkeImLink('Der Zwerg', 'https://oper.example/zwerg-test/'), ['zwerg-test']);
});

test('ein Werk aus der Datenbank wird auch unter seinem deutschen Titel gefunden', () => {
    werkeErgaenzen([{ id: 'la-gazza-ladra', title: 'La gazza ladra', composer: 'Gioachino Rossini' }]);
    assert.deepEqual(werkeImLink('Die diebische Elster', 'https://oper.example/stueck/123/'), ['la-gazza-ladra']);
    assert.deepEqual(werkeImLink('mehr', 'https://oper.example/spielplan/die-diebische-elster/'), ['la-gazza-ladra']);
    assert.deepEqual(werkeImLink('La gazza ladra', 'https://oper.example/stueck/123/'), ['la-gazza-ladra']);
});

import { termineMitZeiten, beginnFinden } from '../werkzeug/spielplan-termine.mjs';

const zeiten = t => termineMitZeiten(t, F).zeiten;

test('Beginn und Ende einer Vorstellung', () => {
    assert.deepEqual(zeiten('Samstag, 05.12.2026\n18:00 – 22:30 Uhr\nGroßes Haus'), { '2026-12-05': '18:00-22:30' });
    assert.deepEqual(zeiten('So. 06.06.2027\n18:00 bis ca. 21:15'), { '2027-06-06': '18:00-21:15' });
    assert.deepEqual(zeiten('Sonntag, 13. Dezember 2026, 20 Uhr'), { '2026-12-13': '20:00' });
    assert.deepEqual(zeiten('Fr. 02. Okt 2026 | 19.00 Uhr'), { '2026-10-02': '19:00' });
});

test('die Uhrzeit der Einführung ist nicht der Beginn', () => {
    // Dortmund, Kiel, Halle, Hagen: die Einführung steht dahinter
    assert.deepEqual(zeiten('November 2026\n07\nSamstag\nOpernhaus 19:30 Uhr (eine Pause) Einführung: 18:45 Uhr'), { '2026-11-07': '19:30' });
    assert.deepEqual(zeiten('Fr, 16.10.2026, 19:30 Uhr\n19:00 | Stückeinführung'), { '2026-10-16': '19:30' });
    // Stuttgart: die Einführung steht davor, in eigener Zeile
    assert.deepEqual(zeiten('OKT 2026\nSa\n3\n17:15\nEinführung im Foyer I. Rang\n18:00\nLUCIA DI LAMMERMOOR'), { '2026-10-03': '18:00' });
    // davor in derselben Zeile, als Etikett oder hinter der Uhrzeit
    assert.deepEqual(zeiten('Sa 03.10.2026 | Einführung 18:45 | Beginn 19:30'), { '2026-10-03': '19:30' });
    assert.deepEqual(zeiten('Sa 03.10.2026\n18:45 Einführung\n19:30 Vorstellung'), { '2026-10-03': '19:30' });
});

test('eine Leiste von Terminen hat keine Zeiten, ein einzelner schon', () => {
    // Deutsche Oper Berlin: nur der eine Termin mit eigener Zeile hat eine Zeit
    assert.deepEqual(zeiten('Carmen\nSo 4.10.26 Fr 9.10.26 Fr 16.10.26\nSo 4.10.26, 16:00'), { '2026-10-04': '16:00' });
    // Zwei Daten, eine Uhrzeit: welcher Tag gemeint ist, bleibt offen.
    assert.deepEqual(zeiten('Sa 3.10.2026, So 4.10.2026, 19:30 Uhr'), {});
});

test('Foyer, Probebühne, Treffpunkt und Absacker sind keine Vorstellungen', () => {
    // Hamburg, Ulm, Erfurt, Baden – mit weichem Trennstrich wie in Hamburg
    for (const t of ['10. Dezember 2026, 9:15 – 11:45 · Eingangsfoyer', 'Samstag, 12. Dezember 2026, 9:45 Uhr, Treffpunkt Bühnenpforte – Teil II',
        'Absacker / Fr, 04.12.2026, 22.40 Uhr', 'Mo 02.02.2027 16:30 PROBEN\u00adBESUCHE AM VORMITTAG', 'Di 02.02.2027 16:30 · Probebühne 2']) {
        assert.deepEqual(termineMitUhrzeit(t, F), [], t);
    }
    assert.deepEqual(termineMitUhrzeit('So, 14. März 2027 10:30 Uhr\nDas Land des Lächelns\nEinführungsgespräch', F), []);
    assert.deepEqual(termineMitUhrzeit('Fr, 18. Dezember 2026, 19:30 Uhr, Großes Haus', F), ['2026-12-18']);
});

test('eine Uhrzeit "p.m." ist nachmittags oder abends', () => {
    assert.deepEqual(zeiten('22 July 2027 – 9.15 p.m.\nSeebühne'), { '2027-07-22': '21:15' });
    assert.deepEqual(zeiten('22 July 2027 – 11.00 a.m.'), { '2027-07-22': '11:00' });
});

test('Treffpunkt und Probebühne gelten im ganzen Eintrag, das Foyer der Einführung nicht', () => {
    // Ulm, Kalender unten auf der Stückseite
    assert.deepEqual(termineMitUhrzeit('Dezember 2026\n12\nSamstag,\n09:45 Uhr\nTreffpunkt Bühnenpforte', F), []);
    // Kiel: die Einführung im Foyer gehört zu einer echten Vorstellung
    assert.deepEqual(termineMitUhrzeit('Fr. 02. Okt 2026 | 19.00 Uhr\nEinführung | 18.15 Uhr | 2. Foyer Opernhaus', F), ['2026-10-02']);
});

test('ein volles Datum unter Tag und Wochentag geht dem Monatskopf vor', () => {
    // Semperoper: der Monat steht unter jedem Eintrag; "06" / "Fr" gehört zum 6. November.
    const semper = '11\nSo\n11. Oktober 2026, 19 Uhr\nOktober 2026\n19 Uhr\nTickets\n06\nFr\n6. November 2026, 19 Uhr\nNovember 2026\n19 Uhr';
    assert.deepEqual(termineMitUhrzeit(semper, F), ['2026-10-11', '2026-11-06']);
    // Ohne volles Datum darunter bleibt es beim Monatskopf (Dortmund).
    assert.deepEqual(termineMitUhrzeit('November 2026\n07\nSamstag\nOpernhaus 19:30 Uhr', F), ['2026-11-07']);
});


test('eine Kachel ohne Jahr übernimmt das Jahr, das gleich darunter steht', () => {
    const fenster = { von: '2026-09-24', bis: '2027-09-30' };
    // Leipzig: vergangene Vorstellungen stehen nach dem Nachladen am Ende.
    const text = 'SA.\n05\nJUNI\nDER FLIEGENDE HOLLÄNDER\nOper Sa. 05.06.2027 | 19:00 | Opernhaus\nBESETZUNG\n'
        + 'SA.\n12\nSEPT.\nDER FLIEGENDE HOLLÄNDER\nOper Sa. 12.09.2026 | 19:00 | Opernhaus\nBESETZUNG';
    assert.deepEqual(termineMitZeiten(text, fenster).termine, ['2027-06-05']);
    assert.deepEqual(termineAusText(text, fenster), ['2027-06-05']);
});

test('„1 Nov. 26“ ist der 1. November 2026, nicht der 26. November', () => {
    const fenster = { von: '2026-09-24', bis: '2027-09-30' };
    // Theater Vorpommern: Tag, Monat mit zweistelligem Jahr, Wochentag, Uhrzeit.
    assert.deepEqual(termineAusText('1 Nov. 26 So 18:00 Theater Stralsund', fenster), ['2026-11-01']);
    assert.deepEqual(termineAusText(' 1 Dez. 26 Di 09:00 Kaisersaal', fenster), ['2026-12-01']);
    // Ohne Tag davor bleibt "Nov. 26" der 26. November.
    assert.deepEqual(termineAusText('Premiere: Nov. 26, 2026', fenster), ['2026-11-26']);
});

test('Tag und Monat in getrennten Zeilen, Monat mit zweistelligem Jahr; Abgesagtes zählt nicht', () => {
    const fenster = { von: '2026-09-24', bis: '2027-09-30' };
    // Theater Vorpommern, Spielplan
    const text = '27\nNov. 26\nFr 18:00\nTheater Stralsund\n15\nNov. 26\nSo entfällt 18:00\nKaisersaal Stadthalle Greifswald';
    assert.deepEqual(termineMitZeiten(text, fenster).termine, ['2026-11-27']);
    assert.deepEqual(termineAusText(text, fenster), ['2026-11-27']);
    // vierstelliges Jahr wie bisher
    assert.deepEqual(termineMitZeiten('6\nDezember 2026\n19:30 Uhr', fenster).termine, ['2026-12-06']);
});

test('eine Einführung nach dem Bindestrich ist kein Ende', () => {
    // Stadttheater Gießen
    assert.equal(beginnFinden(['Sa. 10.10.2026', '19:30 Uhr - 19:00 EINFÜHRUNG']), '19:30');
    assert.equal(beginnFinden(['19:30 – 22:30']), '19:30-22:30');
    assert.equal(beginnFinden(['Mi, 02.12.2026 / 19:30–21:45 Uhr']), '19:30-21:45');
});

test('eine Opernwerkstatt ist keine Vorstellung, auch wenn sie erst drei Zeilen tiefer so heißt', () => {
    const fenster = { von: '2026-09-24', bis: '2027-09-30' };
    // Deutsche Oper am Rhein, Reiter "Termine"
    const text = 'Di 04.05.2027\nOpernhaus Düsseldorf – Foyer\n18:00 - 19:00\nOpernwerkstatt Oper\nProbenbesuch & Podiumsgespräch\n'
        + 'Do 27.05.2027\nOpernhaus Düsseldorf\n18:30 - 21:15\nPreise\nKarten';
    assert.deepEqual(termineMitZeiten(text, fenster).termine, ['2027-05-27']);
});

import { saisonAusAdresse } from '../werkzeug/spielplan-termine.mjs';

test('eine Spielzeit in der Adresse gilt für Tage ohne Jahr', () => {
    assert.equal(saisonAusAdresse('https://staatstheater.de/programm/musiktheater/spielzeit-2627/fidelio'), 2026);
    assert.equal(saisonAusAdresse('https://stadttheater-giessen.de/de/veranstaltungen/stuecke/la-traviata-2026-2027/'), 2026);
    assert.equal(saisonAusAdresse('https://www.gtg.ch/saison-26-27/?filter=opera'), 2026);
    assert.equal(saisonAusAdresse('https://staatstheater.de/programm/musiktheater/spielzeit-25/26/wozzeck'), 2025);
    // keine Spielzeit: Nummern und einzelne Jahre
    assert.equal(saisonAusAdresse('https://oper.example/produktion/tosca-835/72499'), null);
    assert.equal(saisonAusAdresse('https://oper.example/stuecke/tosca/2027-07-03-1900-16332'), null);
    const fenster = { von: '2026-09-25', bis: '2027-09-30' };
    // Oldenburg Ende September: der 12. Juni ist der nächste, nicht der vergangene
    const text = 'TERMINE\nSA 12.6. 19:30 UHR\nKARTEN\nDO 17.6. 19:30 UHR\nKARTEN';
    assert.deepEqual(termineMitZeiten(text, fenster, { saison: 2026 }).termine, ['2027-06-12', '2027-06-17']);
    assert.deepEqual(termineMitZeiten(text, fenster).termine, []);
});

test('Füllzeilen zählen nicht bis zur Uhrzeit', () => {
    const fenster = { von: '2026-09-25', bis: '2027-09-30' };
    // Oper Köln, eine ausverkaufte Vorstellung ohne Ticketzeile
    const text = 'SUNDAY, 13 DECEMBER 2026\nSO\n/\n13\nDIE ZAUBERFLÖTE\nWolfgang Amadeus Mozart\n19:00 bis\n22:00 Uhr\nOpernhaus\nAUSVERKAUFT';
    const erg = termineMitZeiten(text, fenster);
    assert.deepEqual(erg.termine, ['2026-12-13']);
    assert.equal(erg.zeiten['2026-12-13'], '19:00');
});

test('Daten aus einer Chronik sind keine Termine', () => {
    const fenster = { von: '2026-09-25', bis: '2027-09-30' };
    // Hamburgische Staatsoper, Lucia di Lammermoor
    const text = '1835\n26. September, Uraufführung am Teatro San Carlo in Neapel\n2021\n19. Oktober, Premiere dieser Inszenierung an der Hamburgischen Staatsoper\n19:30 Uhr';
    assert.deepEqual(termineMitZeiten(text, fenster).termine, []);
    assert.deepEqual(termineAusText(text, fenster), []);
});

import { zeitenAusKalender, monatAusAdresse } from '../werkzeug/spielplan-termine.mjs';

const findeWerk = z => /carmen/i.test(z) ? ['carmen'] : /falstaff/i.test(z) ? ['falstaff'] : [];

test('Uhrzeiten aus einem Kalender: Tageskopf, Uhrzeit, Titel (Deutsche Oper Berlin)', () => {
    const fenster = { von: '2026-09-25', bis: '2027-09-30' };
    const text = 'So\n4.10.\nOper\nGroßes Haus\n16:00\nCarmen\nOper von Georges Bizet\nTickets\n22:30\nGlam Night: nach Carmen\n'
        + 'Fr\n9.10.\nOper\nGroßes Haus\n19:30\nCarmen\nOper von Georges Bizet';
    const z = zeitenAusKalender(text, fenster, findeWerk);
    // Die Glam Night um 22:30 überschreibt den Abend nicht.
    assert.deepEqual(z.get('carmen'), { '2026-10-04': '16:00', '2026-10-09': '19:30' });
});

test('Uhrzeiten aus einer Monatsseite mit Tagen ohne Monat, Einführung übersprungen (Mainz)', () => {
    const fenster = { von: '2026-09-25', bis: '2027-09-30' };
    assert.equal(monatAusAdresse('https://www.staatstheater-mainz.com/uebersicht/oktober', fenster), 'Oktober 2026');
    assert.equal(monatAusAdresse('https://www.staatstheater-mainz.com/uebersicht/januar', fenster), 'Januar 2027');
    assert.equal(monatAusAdresse('https://oper.example/spielplan/tosca', fenster), null);
    const text = '11 So\n14:15 Einführung\n15:00-17:30 → Oper\nWiederaufnahme\nFALSTAFF\nGiuseppe Verdi (1893)\nKarten kaufen';
    const z = zeitenAusKalender(text, fenster, findeWerk, { monatskopf: 'Oktober 2026' });
    assert.deepEqual(z.get('falstaff'), { '2026-10-11': '15:00-17:30' });
    // ohne den Monat der Seite kein Tag, also keine Uhrzeit
    assert.equal(zeitenAusKalender(text, fenster, findeWerk).get('falstaff'), undefined);
});

test('Uhrzeiten aus einem Kalender: andere Einträge des Tages davor zählen nicht', () => {
    const fenster = { von: '2026-09-25', bis: '2027-09-30' };
    // Deutsche Oper Berlin, 6. März: zwei Führungen vor Carmen – vorher
    // bekam Carmen 13:00.
    const text = 'Sa\n6.3.\nFührung\nGroßes Haus\n13:00\nFührung\nTickets\nFührung\nGroßes Haus\n14:30\nFamilien-Führung\nTickets\n'
        + 'Oper\nGroßes Haus\n19:30\nCarmen\nOper von Georges Bizet\nTickets\nUnlimited\nOper\nTischlerei\n20:00\nMusic of Changes';
    assert.deepEqual(zeitenAusKalender(text, fenster, findeWerk).get('carmen'), { '2027-03-06': '19:30' });
});

test('eine Viertelstunde im Foyer ist die Einführung, nicht die Vorstellung', () => {
    // Deutsche Oper am Rhein, La traviata
    const text = 'So 27.09.2026\nOpernhaus Düsseldorf – Foyer\n18:00 - 18:15\nOper\nSo 27.09.2026\nOpernhaus Düsseldorf\n18:30 - 21:00\nOper\nKarten';
    assert.deepEqual(termineMitZeiten(text, F).zeiten, { '2026-09-27': '18:30-21:00' });
    assert.equal(beginnFinden(['19:30 – 22:30']), '19:30-22:30');
});

test('"Werkstatt: Der fliegende Holländer" am Vormittag ist nicht die Vorstellung am Abend', () => {
    const fenster = { von: '2026-09-25', bis: '2027-09-30' };
    const findeHollaender = z => /holländer/i.test(z) ? ['fliegender-hollaender'] : [];
    const text = 'Sa\n17.10.\nUnlimited\nOper\nFoyer\n11:00\nWerkstatt: Der fliegende Holländer\nTickets\n'
        + 'Unlimited\nFoyer\n14:30\nRoundtable: Der fliegende Holländer\nErlösung für Wagner, Erlösung für Deutschland?\nTickets\n'
        + 'Oper\nGroßes Haus\n19:30\nDer fliegende Holländer\nRomantische Oper von Richard Wagner\nTickets';
    assert.deepEqual(zeitenAusKalender(text, fenster, findeHollaender).get('fliegender-hollaender'), { '2026-10-17': '19:30' });
    // Ein Titel mit Uhrzeit davor bleibt ein Titel.
    assert.deepEqual(zeitenAusKalender('Sa\n17.10.\n19:30 Der fliegende Holländer', fenster, findeHollaender).get('fliegender-hollaender'), { '2026-10-17': '19:30' });
});

test('französisch: "MAR. 15 DÉC." ist Dienstag, der 15. Dezember (Genf)', () => {
    const genf = 'Les Noces de Figaro\nTARIFS:\nDès CHF 20.-\nDIM. 13 DÉC. – 17:00\nMAR. 15 DÉC. – 19:00\nDIM. 20 DÉC. – 15:00\nMAR. 29 DÉC. – 19:00';
    const { termine, zeiten } = termineMitZeiten(genf, F);
    assert.deepEqual(termine, ['2026-12-13', '2026-12-15', '2026-12-20', '2026-12-29']);
    assert.deepEqual(zeiten, { '2026-12-13': '17:00', '2026-12-15': '19:00', '2026-12-20': '15:00', '2026-12-29': '19:00' });
    assert.deepEqual(termineAusText('VEN. 8 JANV. · SAM. 12 FÉVR. · SAM. 3 AVR. · JEU. 1 JUIL. 2027', F), ['2027-01-08', '2027-02-12', '2027-04-03', '2027-07-01']);
    // Englisch bleibt: "Mar 15, 2027" ist der 15. März.
    assert.deepEqual(termineAusText('Mar 15, 2027', F), ['2027-03-15']);
});

test('Aufzählung vor dem Monat: jeder Tag zählt, mit der Uhrzeit der Zeile (Bregenz, Genf)', () => {
    const bregenz = 'La traviata 2027\nDates\nThu 22, Fr 23, Sat 24. Sun 25., Tue 27, Wed 28, Thu 29, Fr 30 and Sat 31 July – 9.15 p.m.\n'
        + 'Sun 1, Thu 3 and Wed 4 August – 9.00 p.m.';
    const { termine, zeiten } = termineMitZeiten(bregenz, F);
    assert.deepEqual(termine, ['2027-07-22', '2027-07-23', '2027-07-24', '2027-07-25', '2027-07-27', '2027-07-28', '2027-07-29', '2027-07-30', '2027-07-31',
        '2027-08-01', '2027-08-03', '2027-08-04']);
    assert.equal(zeiten['2027-07-23'], '21:15');
    assert.equal(zeiten['2027-08-03'], '21:00');
    assert.deepEqual(termineAusText('15, 17, 18, 22, 26, 28, 29 et 31 décembre 2026 à 19h', F),
        ['2026-12-15', '2026-12-17', '2026-12-18', '2026-12-22', '2026-12-26', '2026-12-28', '2026-12-29', '2026-12-31']);
    assert.deepEqual(termineAusText('am 3., 10. und 17. Mai 2027', F), ['2027-05-03', '2027-05-10', '2027-05-17']);
    // Nicht aufsteigend: keine Aufzählung.
    assert.deepEqual(termineAusText('am 20. und 18. Mai 2027', F), ['2027-05-18']);
    // Zwei Daten mit zwei Uhrzeiten: keine gemeinsame Uhrzeit.
    assert.deepEqual(termineMitZeiten('Premiere 2027\nSa 3 und So 4 April – 18:00 und 19:30', F).zeiten, {});
});

test('Kalender über den Jahreswechsel: "1.1." nach "Dezember 2026" ist 2027 (Deutsche Oper Berlin)', () => {
    const fenster = { von: '2026-09-26', bis: '2027-09-30' };
    const finde = z => /traviata/i.test(z) ? ['la-traviata'] : /hänsel/i.test(z) ? ['haensel-gretel'] : [];
    const text = 'Dezember 2026\nDo\n31.12.\nOper\n18:00\nLa traviata\nTickets\nFr\n1.1.\nJazz\n19:30\nSwingin 27\n'
        + 'Sa\n2.1.\nOper\n19:30\nLa traviata\nSo\n3.1.\nOper\n16:00\nHänsel und Gretel';
    const z = zeitenAusKalender(text, fenster, finde);
    assert.deepEqual(z.get('la-traviata'), { '2026-12-31': '18:00', '2027-01-02': '19:30' });
    assert.deepEqual(z.get('haensel-gretel'), { '2027-01-03': '16:00' });
    // Ein Tag, der sich nicht einordnen lässt (vorbei), übernimmt nicht das Datum davor.
    const vorbei = zeitenAusKalender('Do\n31.12.2026\n18:00\nLa traviata\nSa\n15.8.\n16:00\nHänsel und Gretel', fenster, finde);
    assert.equal(vorbei.get('haensel-gretel'), undefined);
});

test('"im November 2026 bekannt gegeben" nach "22. Juli 2027" setzt das Jahr nicht zurück (Bregenz)', () => {
    const bregenz = '21. Juli — 22. August 2027\n22. Juli 2027 – 21.15 Uhr\nDie Besetzung wird im November 2026 bekannt gegeben.\nTermine\n'
        + 'Do 22., Fr 23. und Sa 24. Juli – 21.15 Uhr\nSo 1. und Di 3. August – 21.00 Uhr';
    const { termine, zeiten } = termineMitZeiten(bregenz, F);
    assert.deepEqual(termine, ['2027-07-22', '2027-07-23', '2027-07-24', '2027-08-01', '2027-08-03']);
    assert.equal(zeiten['2027-08-03'], '21:00');
    // Ein Monatskopf gibt Jahr und Monat: "1.1." danach ist im neuen Jahr.
    assert.deepEqual(termineAusText('Dezember 2026\n31.12.\n1.1.', F), ['2026-12-31', '2027-01-01']);
});

test('TT/MM/JJ mit zweistelligem Jahr (Lübeck)', () => {
    const luebeck = 'Premiere 02/10/26 · Großes Haus\nTermine\nFr 02/10/26 · 19.30 Uhr\nGroßes Haus\nEinführung 19.00 Uhr · Mittelrangfoyer\n'
        + 'So 04/10/26 · 18.00 Uhr\nGroßes Haus\nEinführung 17.30 Uhr · Mittelrangfoyer';
    assert.deepEqual(termineMitZeiten(luebeck, F), { termine: ['2026-10-02', '2026-10-04'], zeiten: { '2026-10-02': '19:30', '2026-10-04': '18:00' }, abgesagt: [] });
    // Spielzeit und Bruch bleiben, was sie sind.
    assert.deepEqual(termineAusText('Spielzeit 2026/27 · 1/2 Stunde · 3/4-Takt', F), []);
});

test('"Verkaufsstart:" mit Datum darunter ist keine Vorstellung und trennt den Eintrag nicht (Volksoper)', () => {
    const volksoper = 'Weitere Termine und Besetzung\nDo\n12\nNovember 2026\nVerkaufsstart:\n01.10.2026 10:00\nkeine Pause\n19:00 - 20:45\nPreise D\n'
        + 'Mo\n16\nNovember 2026\nVerkaufsstart:\n01.10.2026 10:00\nkeine Pause\n19:00 - 20:45';
    assert.deepEqual(termineMitZeiten(volksoper, F), {
        termine: ['2026-11-12', '2026-11-16'], zeiten: { '2026-11-12': '19:00-20:45', '2026-11-16': '19:00-20:45' }, abgesagt: [],
    });
});

test('nach "Von 20. September 2026 bis 23. April 2027" geht es vom Anfang aus weiter (Zürich)', () => {
    const fenster = { von: '2026-09-26', bis: '2027-09-30' };
    assert.deepEqual(termineAusText('Von 20. September 2026 bis 23. April 2027\n20, 25 Sept. / 06, 18, 30 Okt. / 02, 23 Apr.', fenster),
        ['2026-10-06', '2026-10-18', '2026-10-30', '2027-04-02', '2027-04-23']);
    // Ohne Jahr am Anfang gibt das Ende das Jahr.
    assert.deepEqual(termineAusText('19.02.–24.03.2027\n5. April', fenster), ['2027-04-05']);
});

test('französischer Monatskopf mit ausgeschriebenem Wochentag (Lausanne)', () => {
    const fenster = { von: '2026-09-26', bis: '2027-09-30' };
    const lausanne = 'CHOISISSEZ VOS PLACES\nAVR 2027\nDIMANCHE\n25\n17:00\nVENDREDI\n30\n20:00\nMAI 2027\nDIMANCHE\n02\n15:00';
    assert.deepEqual(termineMitZeiten(lausanne, fenster), {
        termine: ['2027-04-25', '2027-04-30', '2027-05-02'], zeiten: { '2027-04-25': '17:00', '2027-04-30': '20:00', '2027-05-02': '15:00' }, abgesagt: [],
    });
});

test('eine Kostprobe ist keine Vorstellung (Bremerhaven)', () => {
    const fenster = { von: '2026-09-26', bis: '2027-09-30' };
    const t = '09.02.2027 um 18:30 Uhr\nKostprobe (Eintritt frei)\n13.02.2027 um 19:30 Uhr\nVorverkauf ab: 03.11.2026, 12:00 Uhr';
    assert.deepEqual(termineMitZeiten(t, fenster).termine, ['2027-02-13']);
});

test('Liste mit und ohne Uhrzeit: auch die Termine ohne zählen (Wiener Staatsoper)', () => {
    const fenster = { von: '2026-09-26', bis: '2027-09-30' };
    const wien = '6 Termine\nSonntag\n11. Oktober\n2026\n19:00\nMittwoch\n14. Oktober\n2026\n19:00\n'
        + 'Freitag\n30. April\n2027\nDienstag\n04. Mai\n2027\nÜber das Werk';
    const { termine, zeiten } = termineMitZeiten(wien, fenster);
    assert.deepEqual(termine, ['2026-10-11', '2026-10-14', '2027-04-30', '2027-05-04']);
    assert.deepEqual(zeiten, { '2026-10-11': '19:00', '2026-10-14': '19:00' });
    // Ohne einen Eintrag mit Uhrzeit bleibt es wie bisher: dann entscheiden Attribute und Text ohne Zeiten.
    assert.deepEqual(termineMitZeiten('Freitag\n30. April\n2027\nDienstag\n04. Mai\n2027', fenster).termine, []);
});

test('Jahr in eigener Zeile: der Anlass darunter zählt weiter (Bonn, Einführungsmatinee)', () => {
    const fenster = { von: '2026-09-26', bis: '2027-09-30' };
    const bonn = 'TERMINE UND KARTEN\nSO\n22. NOV\n2026\nEINFÜHRUNGSMATINEE Oper Oper Foyerbühne 11:00\nLA BOHÈME\n'
        + 'SO\n06. DEZ\n2026\nPREMIERE Oper Opernhaus Bühne 18:00\nLA BOHÈME\nSA\n16. JAN\n2027\nOper Opernhaus Bühne 18:00\nLA BOHÈME';
    assert.deepEqual(termineMitZeiten(bonn, fenster), {
        termine: ['2026-12-06', '2027-01-16'], zeiten: { '2026-12-06': '18:00', '2027-01-16': '18:00' }, abgesagt: [],
    });
});
