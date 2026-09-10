// Die Regeln für einen Katalogeintrag.
//
// Sie entscheiden, was der Admin über das Formular in den Katalog schreiben
// darf. Vorher galten dieselben Bedingungen nur für das, was im Repo liegt,
// und wurden erst in der CI geprüft – also lange nachdem jemand sie verletzt
// hätte. Jetzt greifen sie vor dem Speichern, und deshalb müssen sie stimmen.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    pruefeWerk, pruefeHaus, pruefeKomponist, idVorschlag, BILD_BREITE,
} from '../../src/data/katalogRegeln.js';

const BILD = 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/83/P.jpg/500px-P.jpg';

const WERK = {
    id: 'neues-werk', title: 'Neues Werk', composer: 'Wolfgang Amadeus Mozart',
    yearComposed: 1791, language: 'Deutsch', acts: 2, genre: 'Singspiel',
    librettist: 'Jemand', description: 'Eine Oper.', image: BILD,
};
const HAUS = {
    id: 'neues-haus', name: 'Neues Haus', city: 'München', state: 'Bayern',
    lat: 48.14, lon: 11.58, capacity: 1200, founded: 1900,
    description: 'Ein Haus.', color: '#1a3a5c', imageUrl: BILD,
};
const KOMPONIST = {
    id: 'neuer-komponist', name: 'Neuer Komponist', kurz: 'Komponist',
    bio: 'Er war Komponist.', wikipedia: 'https://de.wikipedia.org/wiki/X',
    bild: '', bildLizenz: '', bildUrheber: '',
};
const MOZART = { id: 'wolfgang-amadeus-mozart', name: 'Wolfgang Amadeus Mozart' };
const BESTAND = { werke: [], komponisten: [MOZART] };

/** Die Mängel als ein Text, damit sich bequem darin suchen lässt. */
const text = (maengel) => maengel.join(' | ');

test('ein vollständiges Werk hat keine Mängel', () => {
    assert.deepEqual(pruefeWerk(WERK, BESTAND), []);
});

test('ein vollständiges Haus hat keine Mängel', () => {
    assert.deepEqual(pruefeHaus(HAUS, { haeuser: [] }), []);
});

test('ein vollständiger Komponist hat keine Mängel', () => {
    assert.deepEqual(pruefeKomponist(KOMPONIST, { komponisten: [] }), []);
});

test('eine schon vergebene Id fällt auf', () => {
    const m = pruefeWerk(WERK, { ...BESTAND, werke: [{ id: 'neues-werk' }] });
    assert.match(text(m), /schon vergeben/);
});

test('eine Id mit Großbuchstaben oder Leerzeichen fällt auf', () => {
    // Sie landet im Adress-Fragment; alles, was dort kodiert werden müsste,
    // macht die Adresse unlesbar.
    for (const id of ['Neues Werk', 'neues_werk', 'Neues-Werk', 'neuesäwerk']) {
        assert.match(text(pruefeWerk({ ...WERK, id }, BESTAND)), /taugt nicht für eine Adresse/, id);
    }
});

test('ein Komponist ohne Profil fällt auf', () => {
    // Der Name ist der Schlüssel zur Komponistenseite. Ohne Eintrag verlinkt
    // die Werkseite ins Leere – genau das soll das Formular verhindern.
    const m = pruefeWerk({ ...WERK, composer: 'Unbekannter Meister' }, BESTAND);
    assert.match(text(m), /kein Komponistenprofil/);
});

test('ein krumm geschriebener Komponistenname fällt auf', () => {
    // "Giuseppe  Verdi" mit zwei Leerzeichen wäre in der Statistik ein
    // zweiter Komponist.
    const m = pruefeWerk({ ...WERK, composer: 'Wolfgang Amadeus  Mozart' }, BESTAND);
    assert.match(text(m), /krumm geschrieben/);
});

test('ein Bild von einem fremden Host fällt auf', () => {
    const m = pruefeWerk({ ...WERK, image: 'https://example.com/thumb/a/b/x.jpg/500px-x.jpg' }, BESTAND);
    assert.match(text(m), /nicht upload\.wikimedia\.org/);
});

test('ein Bild ohne https fällt auf', () => {
    const m = pruefeWerk({ ...WERK, image: BILD.replace('https:', 'http:') }, BESTAND);
    assert.match(text(m), /https/);
});

test('ein Originalbild statt eines Vorschaubilds fällt auf', () => {
    const m = pruefeWerk({ ...WERK, image: 'https://upload.wikimedia.org/wikipedia/commons/8/83/P.jpg' }, BESTAND);
    assert.match(text(m), /Original statt/);
});

test(`ein Bild über ${BILD_BREITE}px fällt auf`, () => {
    // Die Opernliste lud einmal 135 MB nach, weil 80 Bilder in Originalgröße
    // im Katalog standen.
    const m = pruefeWerk({ ...WERK, image: BILD.replace('500px', '1280px') }, BESTAND);
    assert.match(text(m), /1280px/);
});

test('ein Bild in einer erlaubten kleineren Breite geht durch', () => {
    assert.deepEqual(pruefeWerk({ ...WERK, image: BILD.replace('500px', '330px') }, BESTAND), []);
});

test('TIFF-Vorschaubilder mit ihrem Präfix gehen durch', () => {
    // Wikimedia stellt TIFF und PDF nur über lossy-page1- bereit; im Katalog
    // stehen mehrere davon.
    const tiff = 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e9/G.tif/lossy-page1-500px-G.tif.jpg';
    assert.deepEqual(pruefeWerk({ ...WERK, image: tiff }, BESTAND), []);
});

test('vertauschte Koordinaten fallen auf', () => {
    // 11.58 / 48.14 statt 48.14 / 11.58 – die allgemeine Bereichsprüfung
    // ließe das durch, die Länderumrisse nicht.
    const m = pruefeHaus({ ...HAUS, lat: 11.58, lon: 48.14 }, { haeuser: [] });
    assert.match(text(m), /liegt nicht in Deutschland/);
});

test('ein Haus im falschen Land fällt auf', () => {
    // Wiener Koordinaten, aber Bayern im Feld.
    const m = pruefeHaus({ ...HAUS, state: 'Schweiz', lat: 48.20, lon: 16.37 }, { haeuser: [] });
    assert.match(text(m), /liegt nicht in Schweiz/);
});

test('zwei Häuser auf demselben Punkt fallen auf', () => {
    const m = pruefeHaus(HAUS, { haeuser: [{ id: 'alt', name: 'Altes Haus', lat: 48.14, lon: 11.58 }] });
    assert.match(text(m), /Altes Haus/);
});

test('eine Farbe, die keine ist, fällt auf', () => {
    for (const color of ['blau', '#fff', 'rgb(0,0,0)', '']) {
        assert.match(text(pruefeHaus({ ...HAUS, color }, { haeuser: [] })), /#rrggbb/, color);
    }
});

test('eine Biografie ohne Satzende fällt auf', () => {
    // Der Text wird bei 320 Zeichen geschnitten; ein Abbruch mitten im Satz
    // sähe nach einem Fehler aus.
    const m = pruefeKomponist({ ...KOMPONIST, bio: 'Er war Komponist und' }, { komponisten: [] });
    assert.match(text(m), /Satzzeichen/);
});

test('ein Komponist ohne Wikipedia-Artikel fällt auf', () => {
    // Die Biografie stammt von dort und steht unter CC BY-SA; ohne
    // Quellenangabe dürfte sie nicht in der App stehen.
    const m = pruefeKomponist({ ...KOMPONIST, wikipedia: '' }, { komponisten: [] });
    assert.match(text(m), /CC BY-SA/);
});

test('ein Artikel aus einer anderen Wikipedia fällt auf', () => {
    const m = pruefeKomponist({ ...KOMPONIST, wikipedia: 'https://en.wikipedia.org/wiki/X' }, { komponisten: [] });
    assert.match(text(m), /Artikel fehlt/);
});

test('eine CC-BY-Lizenz ohne Urheber fällt auf, Public domain nicht', () => {
    // Die Namensnennung hängt an der Lizenz, nicht am Bild: "BY" ist der
    // ganze Inhalt des Kürzels. Fünf Porträts im Katalog sind Public domain
    // und führen keinen Urheber – bei Fotografien des 19. Jahrhunderts ist er
    // schlicht unbekannt.
    const mitBild = { ...KOMPONIST, bild: BILD, bildUrheber: '' };
    assert.match(text(pruefeKomponist({ ...mitBild, bildLizenz: 'CC BY-SA 4.0' }, {})), /verlangt Namensnennung/);
    assert.deepEqual(pruefeKomponist({ ...mitBild, bildLizenz: 'Public domain' }, {}), []);
    assert.deepEqual(pruefeKomponist({ ...mitBild, bildLizenz: 'CC0' }, {}), []);
});

test('ein Komponist ganz ohne Porträt ist erlaubt', () => {
    // Die Seite zeigt dann das Monogramm.
    assert.deepEqual(pruefeKomponist({ ...KOMPONIST, bild: '' }, { komponisten: [] }), []);
});

test('ein Name, den es schon gibt, fällt auf', () => {
    const m = pruefeKomponist(KOMPONIST, { komponisten: [{ id: 'anders', name: 'Neuer Komponist' }] });
    assert.match(text(m), /steht schon/);
});

test('fehlende Pflichtfelder werden einzeln benannt', () => {
    // Alle auf einmal, nicht eins nach dem anderen: sonst müsste der Admin
    // zehnmal absenden, um zehn Lücken zu finden.
    const m = pruefeWerk({}, BESTAND);
    for (const wort of [/Id fehlt/, /Titel fehlt/, /Komponist fehlt/, /Sprache fehlt/,
                        /Gattung fehlt/, /Librettist fehlt/, /Beschreibung fehlt/,
                        /Entstehungsjahr fehlt/, /Akte fehlt/, /Bild fehlt/]) {
        assert.match(text(m), wort);
    }
});

test('der Id-Vorschlag macht aus einem Titel eine brauchbare Adresse', () => {
    assert.equal(idVorschlag('Die Zauberflöte'), 'die-zauberfloete');
    assert.equal(idVorschlag('Der Freischütz'), 'der-freischuetz');
    assert.equal(idVorschlag('Così fan tutte'), 'cosi-fan-tutte');
    assert.equal(idVorschlag('Der Kaiser von Atlantis'), 'der-kaiser-von-atlantis');
    // Umlaute als ue/oe/ae, nicht weggeworfen: "Groetterdaemmerung" liest
    // sich, "Gtterdmmerung" nicht.
    assert.equal(idVorschlag('Götterdämmerung'), 'goetterdaemmerung');
    assert.equal(idVorschlag('  Führende Leerzeichen  '), 'fuehrende-leerzeichen');
    assert.equal(idVorschlag(''), '');
});

test('der Id-Vorschlag ist selbst id-tauglich', () => {
    for (const titel of ['Die Zauberflöte', 'L\'elisir d\'amore', 'Cavalleria rusticana / Pagliacci',
                         'Ariadne auf Naxos (1916)', 'Mahagonny – Songspiel']) {
        const id = idVorschlag(titel);
        assert.match(id, /^[a-z0-9-]+$/, `"${titel}" ergibt "${id}"`);
    }
});
