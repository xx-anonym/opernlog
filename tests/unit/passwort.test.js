// Die Passwortprüfung.
//
// Der wichtigste Test hier ist nicht, dass ein schlechtes Passwort auffliegt,
// sondern dass beim Nachfragen nur fünf Zeichen das Gerät verlassen. Daran
// hängt die ganze Begründung, warum der Abgleich überhaupt stattfinden darf:
// aus fünf Zeichen eines SHA-1 lässt sich kein Passwort rekonstruieren. Ginge
// versehentlich der volle Hash hinaus, wäre der Abgleich ein Datenleck.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    passwortMaengel, sha1Hex, istGeleakt, passwortEinwand,
    MINDESTLAENGE, HOECHSTLAENGE_BYTE,
} from '../../src/passwort.js';

// "password" ist das Beispiel aus der HaveIBeenPwned-Dokumentation.
const HASH_PASSWORD = '5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8';

/** Eine Antwort, wie sie HaveIBeenPwned liefert: Suffix:Anzahl je Zeile. */
function liste(eintraege) {
    return eintraege.map(([suffix, n]) => `${suffix}:${n}`).join('\r\n');
}

test('SHA-1 kommt in Großschreibung und ohne Trenner', async () => {
    assert.equal(await sha1Hex('password'), HASH_PASSWORD);
});

test('zu kurz wird beanstandet, und die Zahl stimmt', () => {
    const m = passwortMaengel('kurz');
    assert.equal(m.length, 1);
    assert.match(m[0], new RegExp(`${MINDESTLAENGE} Zeichen`));
    assert.match(m[0], /du hast 4/);
});

test('genau die Mindestlänge ist in Ordnung', () => {
    assert.deepEqual(passwortMaengel('a'.repeat(MINDESTLAENGE)), []);
});

test('über 72 Byte wird gewarnt, weil bcrypt dort abschneidet', () => {
    assert.deepEqual(passwortMaengel('a'.repeat(HOECHSTLAENGE_BYTE)), []);
    const m = passwortMaengel('a'.repeat(HOECHSTLAENGE_BYTE + 1));
    assert.equal(m.length, 1);
    assert.match(m[0], /72 Byte/);
});

test('Umlaute zählen als zwei Byte, nicht als ein Zeichen', () => {
    // 40 Umlaute sind 80 Byte. Nach Zeichen gezählt wäre das unauffällig.
    const p = 'ä'.repeat(40);
    assert.equal(p.length, 40);
    assert.match(passwortMaengel(p).join(' '), /72 Byte/);
});

test('der eigene Name darf nicht im Passwort stehen', () => {
    const m = passwortMaengel('JonasOpernFan', { benutzername: 'jonas' });
    assert.equal(m.length, 1, 'Länge und Byte-Zahl sind hier in Ordnung');
    assert.match(m[0], /Name oder deine E-Mail/);
});

test('auch der Teil vor dem @ zählt', () => {
    const m = passwortMaengel('schilbergjonas1', { email: 'schilbergjonas@example.com' });
    assert.match(m.join(' '), /Name oder deine E-Mail/);
});

test('ein sehr kurzer Name löst nicht bei jedem Passwort aus', () => {
    // Bei zwei Zeichen träfe die Prüfung fast jedes Passwort. "ab" steht in
    // "Abendvorstellung" – das ist kein Grund, es abzulehnen.
    assert.deepEqual(passwortMaengel('Abendvorstellung', { benutzername: 'ab' }), []);
});

test('leer und null stürzen nicht ab', () => {
    assert.match(passwortMaengel('').join(' '), /Mindestens/);
    assert.match(passwortMaengel(null).join(' '), /Mindestens/);
    assert.match(passwortMaengel(undefined).join(' '), /Mindestens/);
});

test('nach draußen gehen nur fünf Zeichen des Hashes', async () => {
    // Der Kern der ganzen Sache. Siehe den Kopf dieser Datei.
    const argumente = [];
    await istGeleakt('password', async (...args) => {
        argumente.push(args);
        return liste([['1D72CD07550416C216D8AD296BF5C0AE8E0FF', 10]]);
    });

    assert.equal(argumente.length, 1, 'genau eine Anfrage');
    assert.deepEqual(argumente[0], ['5BAA6'],
        'es darf nichts weiter mitgehen als das Präfix – kein Passwort, kein voller Hash');

    // Die restlichen 35 Zeichen bleiben im Gerät und werden dort verglichen.
    assert.equal(HASH_PASSWORD.length - argumente[0][0].length, 35);
});

test('ein Treffer in der Liste gilt als geleakt, mit Anzahl', async () => {
    const r = await istGeleakt('password', async () =>
        liste([['0000000000000000000000000000000000000', 3],
               [HASH_PASSWORD.slice(5), 12345]]));
    assert.deepEqual(r, { geprueft: true, geleakt: true, anzahl: 12345 });
});

test('ein Treffer mit Zähler 0 ist Polsterung, kein Leak', async () => {
    // Add-Padding füllt die Antwort mit erfundenen Zeilen auf, damit die Länge
    // nichts verrät. Die tragen die Anzahl 0. Wer nur auf "Suffix gefunden"
    // prüft, lehnt dann einwandfreie Passwörter ab.
    const r = await istGeleakt('password', async () =>
        liste([[HASH_PASSWORD.slice(5), 0]]));
    assert.deepEqual(r, { geprueft: true, geleakt: false, anzahl: 0 });
});

test('kein Treffer heißt geprüft und sauber', async () => {
    const r = await istGeleakt('password', async () =>
        liste([['1111111111111111111111111111111111111', 9]]));
    assert.deepEqual(r, { geprueft: true, geleakt: false, anzahl: 0 });
});

test('fällt der Dienst aus, gilt das Passwort als ungeprüft und geht durch', async () => {
    // Absicht: niemand soll sich nicht anmelden können, weil ein fremder
    // Dienst gerade nicht antwortet. geprueft:false hält fest, dass die
    // Aussage "nicht geleakt" hier keine ist.
    const r = await istGeleakt('password', async () => { throw new Error('kein Netz'); });
    assert.deepEqual(r, { geprueft: false, geleakt: false, anzahl: 0 });
});

test('passwortEinwand fragt gar nicht erst nach, wenn es schon lokal durchfällt', async () => {
    // Ein offensichtlich zu kurzes Passwort muss nicht auch noch gehasht und
    // hinausgetragen werden.
    let gefragt = false;
    const einwand = await passwortEinwand('kurz', {}, async () => { gefragt = true; return ''; });
    assert.match(einwand, /Mindestens/);
    assert.equal(gefragt, false, 'für ein zu kurzes Passwort wurde trotzdem nachgefragt');
});

test('passwortEinwand nennt die Anzahl der Funde', async () => {
    const einwand = await passwortEinwand('passwordlang', {}, async () =>
        liste([[(await sha1Hex('passwordlang')).slice(5), 1234]]));
    assert.match(einwand, /geleakter Passwörter/);
    assert.match(einwand, /1\.234/, 'die Anzahl in deutscher Schreibweise');
});

test('ein gutes Passwort gibt keinen Einwand', async () => {
    const einwand = await passwortEinwand('Karneval-der-Tiere-1886', {}, async () => '');
    assert.equal(einwand, null);
});
