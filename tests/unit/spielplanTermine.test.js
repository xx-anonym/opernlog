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
        '16. JUNI\n50 % PREISVORTEIL', 'Extra: Familienführung vor der Vorstellung am 15.11.']) {
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
});
