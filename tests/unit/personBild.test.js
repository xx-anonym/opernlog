// Das Bild zur Personenseite aus Wikipedia (src/data/personBild.js): nur,
// wenn der Artikel zu dem passt, was die Person an den eigenen Abenden war.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { passendeBeschreibung, wikipediaAbfrage, bildAdresse, bildAusAntwort } from '../../src/data/personBild.js';

test('die Kurzbeschreibung muss zur Funktion an den Abenden passen', () => {
    // Echte Kurzbeschreibungen, abgerufen am 22.11.2026.
    assert.equal(passendeBeschreibung('russischer Dirigent', ['Dirigat']), true);
    assert.equal(passendeBeschreibung('australische Dirigentin, Opernintendantin und Hochschullehrerin', ['Dirigat']), true);
    assert.equal(passendeBeschreibung('russisch-österreichische Opernsängerin', ['Tosca']), true);
    assert.equal(passendeBeschreibung('französischer Opernsänger der Stimmlage Bariton', ['Scarpia']), true);
    assert.equal(passendeBeschreibung('Australian theatre and opera director (born 1967)', ['Regie']), true);
    // Der Namensvetter.
    assert.equal(passendeBeschreibung('deutscher Fußballspieler', ['Dirigat']), false);
    assert.equal(passendeBeschreibung('German footballer (born 1989)', ['Dirigat']), false);
    // Ein Dirigent, der an diesem Abend nur in der Besetzung stand, zählt
    // nicht als Sänger – aber wer beides war, passt mit einem.
    assert.equal(passendeBeschreibung('deutscher Dirigent', ['Rigoletto']), false);
    assert.equal(passendeBeschreibung('deutscher Dirigent', ['Rigoletto', 'Dirigat']), true);
    // Eine Zeile ohne Rolle ist Bühne.
    assert.equal(passendeBeschreibung('deutsche Sopranistin', ['']), true);
    assert.equal(passendeBeschreibung('deutsche Sopranistin', []), true);
    // "Alt" als Stimmfach, nicht in "Altstadt" oder "Walter".
    assert.equal(passendeBeschreibung('deutsche Altistin', ['']), true);
    assert.equal(passendeBeschreibung('Stadtteil in der Altstadt', ['']), false);
    // Ohne Beschreibung lieber keins.
    assert.equal(passendeBeschreibung('', ['Dirigat']), false);
    assert.equal(passendeBeschreibung(undefined, ['Dirigat']), false);
});

test('die Abfrage: freies Hauptbild, Kurzbeschreibung, Weiterleitungen, Begriffsklärung', () => {
    const url = new URL(wikipediaAbfrage('  Anna   Netrebko ', 'en'));
    assert.equal(url.host, 'en.wikipedia.org');
    assert.equal(url.searchParams.get('titles'), 'Anna Netrebko');
    assert.equal(url.searchParams.get('pilicense'), 'free');
    assert.equal(url.searchParams.get('redirects'), '1');
    assert.equal(url.searchParams.get('origin'), '*');
    assert.match(url.searchParams.get('prop'), /pageimages/);
    assert.match(url.searchParams.get('prop'), /description/);
});

test('Bildadressen in der Form, die der Service Worker cacht', () => {
    assert.equal(
        bildAdresse('https://thumb.wikimedia.org/wikipedia/commons/thumb/0/07/Name.jpg/330px-Name.jpg?utm_source=de.wikipedia.org&utm_campaign=api'),
        'https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/Name.jpg/330px-Name.jpg');
    assert.equal(bildAdresse('https://upload.wikimedia.org/wikipedia/commons/a/ab/X.jpg'), 'https://upload.wikimedia.org/wikipedia/commons/a/ab/X.jpg');
    // Nur Commons: lokale Dateien einer Wikipedia (en: auch unfreie) nicht.
    assert.equal(bildAdresse('https://upload.wikimedia.org/wikipedia/en/a/ab/Poster.jpg'), null);
    assert.equal(bildAdresse('https://example.org/x.jpg'), null);
    assert.equal(bildAdresse(undefined), null);
});

test('aus der Antwort das Bild, wenn es passt', () => {
    const seite = (felder) => ({ query: { pages: [{ pageid: 1, ns: 0, title: 'Christian Thielemann',
        description: 'deutscher Dirigent', pageimage: 'Thielemann_2047-Michelides.jpg',
        thumbnail: { source: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Thielemann_2047-Michelides.jpg/400px-Thielemann_2047-Michelides.jpg', width: 400, height: 600 },
        ...felder }] } });
    assert.deepEqual(bildAusAntwort(seite({}), ['Dirigat']), {
        titel: 'Christian Thielemann',
        beschreibung: 'deutscher Dirigent',
        bild: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Thielemann_2047-Michelides.jpg/400px-Thielemann_2047-Michelides.jpg',
        seite: 'https://de.wikipedia.org/wiki/Christian_Thielemann',
    });
    assert.equal(bildAusAntwort(seite({ title: 'Bar Kosky' }), ['Dirigat'], 'en').seite, 'https://en.wikipedia.org/wiki/Bar_Kosky');
    // Kein freies Bild: der Artikel trotzdem, für die Kurzbeschreibung (seit 24.11.2026).
    assert.deepEqual(bildAusAntwort(seite({ thumbnail: undefined }), ['Dirigat']), {
        titel: 'Christian Thielemann', beschreibung: 'deutscher Dirigent', bild: null,
        seite: 'https://de.wikipedia.org/wiki/Christian_Thielemann',
    });
    // Kein Artikel, Begriffsklärung, falsche Person: nichts.
    assert.equal(bildAusAntwort({ query: { pages: [{ title: 'Niemand', missing: true }] } }, ['Dirigat']), null);
    assert.equal(bildAusAntwort(seite({ pageprops: { disambiguation: '' } }), ['Dirigat']), null);
    assert.equal(bildAusAntwort(seite({ description: 'deutscher Fußballspieler' }), ['Dirigat']), null);
    assert.equal(bildAusAntwort(null, ['Dirigat']), null);
    assert.equal(bildAusAntwort({}, ['Dirigat']), null);
});
