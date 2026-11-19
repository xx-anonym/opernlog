// Werktexte aus dem Admin-Formular (seit 19.11.2026): der Admin schreibt
// Handlung, bekannte Stellen und Wissenswertes als Text, in der Form, in der
// die Seite sie zeigt. src/data/werkTexte.js macht daraus das Objekt, das
// sonst in daten/werke/<id>.json steht, und gibt Mängel in Formularworten aus.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    akteAusText, stellenAusText, werkTextAusFormular, werkTextFehler, werkTextFehlerLesbar,
    aktePassen, eigenerWerkText,
} from '../../src/data/werkTexte.js';
import { seitenErzeugen } from '../werkzeug/seiten-erzeugen.mjs';

const HANDLUNG = '1. Akt · Kirche Sant’Andrea della Valle\nDer Maler Cavaradossi\nversteckt Angelotti.\n\n2. Akt\nScarpia verhört ihn.';

test('Handlung: ein Abschnitt je Absatz, Ort hinter dem Punkt in der Mitte', () => {
    assert.deepEqual(akteAusText(HANDLUNG), [
        { titel: '1. Akt', ort: 'Kirche Sant’Andrea della Valle', text: 'Der Maler Cavaradossi versteckt Angelotti.' },
        { titel: '2. Akt', text: 'Scarpia verhört ihn.' },
    ]);
    // Mehrere Leerzeilen und Windows-Zeilenenden schaden nicht.
    assert.equal(akteAusText('Prolog\nA\r\n\r\n\r\n1. Akt\nB').length, 2);
    assert.deepEqual(akteAusText('  \n '), []);
});

test('bekannte Stellen: Titel – Wer, Akt: Beschreibung; Anführungszeichen machen das Zitat', () => {
    const { stellen, fehler } = stellenAusText([
        '„Vissi d’arte“ – Tosca, 2. Akt: Toscas Gebet.',
        'Te Deum – Scarpia und Chor, 1. Akt: Der Aktschluss.',
        '"E lucevan le stelle" - Cavaradossi, 3. Akt',
        '„Kein andres“ – Gräfin, Olivier, Flamand, Ein Akt: Das Sonett.',
        'Ohne Strich und Komma',
    ].join('\n'));
    assert.deepEqual(stellen, [
        { titel: 'Vissi d’arte', wer: 'Tosca', akt: '2. Akt', was: 'Toscas Gebet.' },
        { titel: 'Te Deum', zitat: false, wer: 'Scarpia und Chor', akt: '1. Akt', was: 'Der Aktschluss.' },
        { titel: 'E lucevan le stelle', wer: 'Cavaradossi', akt: '3. Akt' },
        // Kommas unter "wer" sind erlaubt – der Akt steht hinter dem letzten.
        { titel: 'Kein andres', wer: 'Gräfin, Olivier, Flamand', akt: 'Ein Akt', was: 'Das Sonett.' },
    ]);
    assert.deepEqual(fehler, [5]);
});

test('alle Felder leer: kein Text; angefangen: vollständig geprüft', () => {
    assert.deepEqual(werkTextAusFormular({}), { text: null, fehler: [] });
    assert.deepEqual(werkTextAusFormular({ dauer: ' ', handlung: '\n' }), { text: null, fehler: [] });

    const { text, fehler } = werkTextAusFormular({
        dauer: 'ca. 2 Std.', uaDatum: '1900-01-14', uaOrt: 'Teatro Costanzi, Rom',
        anriss: 'Rom, 1800.', handlung: HANDLUNG,
        stellen: '„Vissi d’arte“ – Tosca, 2. Akt: Toscas Gebet.', wissen: 'Eins.\n\nZwei.',
    });
    assert.deepEqual(fehler, []);
    assert.deepEqual(werkTextFehler(text), []);
    assert.deepEqual(text.urauffuehrung, { datum: '1900-01-14', ort: 'Teatro Costanzi, Rom' });
    assert.deepEqual(text.wissen, ['Eins.', 'Zwei.']);

    // Ohne Uraufführung fehlt das Feld ganz, statt leer dazustehen.
    assert.equal('urauffuehrung' in werkTextAusFormular({ dauer: 'x' }).text, false);
    // Nur die Dauer: die Prüfung meldet, was noch fehlt.
    const halb = werkTextAusFormular({ dauer: 'ca. 1 Std.' }).text;
    assert.deepEqual(werkTextFehlerLesbar(werkTextFehler(halb)), ['Kurz gesagt fehlt', 'Handlung fehlt']);
});

test('die Mängel stehen in den Worten des Formulars', () => {
    assert.deepEqual(werkTextFehlerLesbar([
        'dauer fehlt', 'anriss länger als 400 Zeichen', 'urauffuehrung.datum ist kein Datum',
        'urauffuehrung.ort fehlt', 'akte[1].text länger als 600 Zeichen', 'stellen[0].wer fehlt', 'wissen[2] enthält < oder >',
    ]), [
        'Dauer fehlt', 'Kurz gesagt ist länger als 400 Zeichen', 'Uraufführung: Datum bitte als JJJJ-MM-TT oder nur das Jahr',
        'Uraufführung: Ort fehlt', 'Handlung, Abschnitt 2: Text ist länger als 600 Zeichen',
        'Bekannte Stellen, Zeile 1: Wer fehlt', 'Gut zu wissen, Zeile 3 enthält < oder >',
    ]);
});

test('Akte: Prolog, Vorspiel und Epilog dürfen dazukommen', () => {
    const t = (...titel) => ({ akte: titel.map(x => ({ titel: x, text: 'x' })) });
    assert.equal(aktePassen(t('1. Akt', '2. Akt'), 2), true);
    assert.equal(aktePassen(t('Prolog', '1. Akt', '2. Akt', 'Epilog'), 2), true);
    assert.equal(aktePassen(t('Vorspiel', '1. Akt'), 2), true);   // der Katalog zählt es mit
    assert.equal(aktePassen(t('1. Akt'), 3), false);
    assert.equal(aktePassen(t('1. Akt'), undefined), true);
});

test('ein Werk aus der Datenbank bringt seinen Text mit – auch auf die Seite für Google', () => {
    const text = werkTextAusFormular({ dauer: 'ca. 1 Std.', anriss: 'Kurz.', handlung: 'Ein Akt\nEs geschieht.' }).text;
    const werk = { id: 'testwerk', title: 'Testwerk', composer: 'Niemand', acts: 1, yearComposed: 2000, werkText: text };
    assert.equal(eigenerWerkText(werk), text);
    assert.equal(eigenerWerkText({ werkText: { dauer: 'kaputt' } }), null);
    assert.equal(eigenerWerkText({}), null);

    const { seiten } = seitenErzeugen({ werke: [werk], haeuser: [], komponisten: [], plan: [], texte: new Map() });
    assert.match(seiten.get('oper/testwerk/index.html'), /Es geschieht\./);
});
