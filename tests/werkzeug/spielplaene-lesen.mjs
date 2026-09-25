// Liest die Spielpläne der Häuser im Katalog und schlägt Termine vor.
//
//   node tests/werkzeug/spielplaene-lesen.mjs [ausgabe.json] [haus-id …] [--werke id,id] [--straenge 4]
//
//   haus-id     nur diese Häuser lesen – etwa nach einer Änderung an ihren
//               Quellen. Übernehmen mit `spielplan-uebernehmen.mjs … --dazu`:
//               dann ändern sich nur die Einträge dieser Häuser.
//   --werke     nur nach diesen Werken suchen – für ein Werk, das neu in den
//               Katalog gekommen ist. Das Ergebnis mit
//               `spielplan-uebernehmen.mjs ausgabe.json --dazu` übernehmen:
//               dann ändern sich nur die Einträge dieser Werke.
//   --straenge  so viele Häuser gleichzeitig (Standard 4). Je Haus bleibt es
//               bei einer Seite nach der anderen.
//
// Die Werke kommen aus src/data/operas.js und aus der Datenbank
// (catalog_operas) – was der Admin in der App anlegt, wird mitgesucht.
//
// Gedacht für einen Lauf je Spielzeit, im September, dazu ein kleiner im
// Januar – viele Stadttheater stellen die Termine fürs Frühjahr erst im
// Winter online. Das Ergebnis ist ein VORSCHLAG: jede Zeile wird von Hand
// durchgesehen, bevor sie in src/data/spielplan.js landet. Wie alle
// Werkzeuge hier schlägt es vor und entscheidet nicht.
//
// Vorgehen je Haus:
//   1. Einstiegsseiten aus spielplan-quellen.json laden, wie ein Browser (viele
//      Spielpläne entstehen erst per JavaScript).
//   2. Dazu Übersichtsseiten der Spielzeit, die dort verlinkt sind
//      ("Spielzeit 2026/27", "Premieren", "Repertoire", "Oper" …).
//   3. Jeder Link, dessen Text ein Werk aus dem Katalog nennt, führt auf die
//      Seite der Produktion. Dort stehen die Termine.
//   4. Auf der Produktionsseite: Termine lesen, und nachsehen, ob der
//      Komponist genannt ist und ob es nach Ballett oder Schauspiel aussieht –
//      "Faust" ist in Deutschland meist Goethe, "Macbeth" meist Shakespeare.
//
// Höflich: je Haus eine Seite nach der anderen.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { operas } from '../../src/data/operas.js';
import { operaHouses } from '../../src/data/operaHouses.js';
import { heuteIso } from '../../src/data/spielplanAbfrage.js';
import { werkeAusDatenbank } from './datenbank-werke.mjs';
import { termineAusText, termineMitZeiten, beginnFinden, saisonAusAdresse, zeitenAusKalender, monatAusAdresse, zeitenAusLd } from './spielplan-termine.mjs';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const QUELLEN = JSON.parse(fs.readFileSync(path.join(WURZEL, 'tests/werkzeug/spielplan-quellen.json'), 'utf8'));


// Andere Titel, unter denen dieselben Werke auf Spielplänen stehen.
export const ANDERE_TITEL = {
    'zauberflote': ['Zauberflöte', 'Zauberfloete', 'The Magic Flute', 'La Flûte enchantée'],
    'nozze-di-figaro': ['Die Hochzeit des Figaro', 'Figaros Hochzeit', 'Le nozze di Figaro', 'Les Noces de Figaro'],
    'cosi-fan-tutte': ['Cosi fan tutte'],
    'entfuehrung': ['Entführung aus dem Serail'],
    'clemenza-di-tito': ['La clemenza di Tito', 'Titus'],
    'il-trovatore': ['Der Troubadour'],
    'don-carlos': ['Don Carlo'],
    'forza-del-destino': ['Die Macht des Schicksals'],
    'un-ballo-in-maschera': ['Ein Maskenball'],
    'meistersinger': ['Meistersinger von Nürnberg'],
    'fliegender-hollaender': ['Fliegende Holländer', 'Der Fliegende Holländer'],
    'la-boheme': ['La bohème', 'La Boheme'],
    'fanciulla-del-west': ['Das Mädchen aus dem goldenen Westen', 'La fanciulla del West'],
    'gianni-schicchi': ['Il trittico', 'Das Triptychon'],
    'suor-angelica': ['Il trittico', 'Das Triptychon', 'Schwester Angelica'],
    'il-tabarro': ['Il trittico', 'Das Triptychon', 'Der Mantel'],
    'rosenkavalier': ['Rosenkavalier'],
    'frau-ohne-schatten': ['Frau ohne Schatten'],
    'freischuetz': ['Freischütz'],
    'haensel-gretel': ['Hänsel & Gretel'],
    'giulio-cesare': ['Giulio Cesare', 'Julius Caesar'],
    'barbiere': ['Der Barbier von Sevilla', 'Il barbiere di Siviglia', 'Barbier von Sevilla'],
    'cenerentola': ['Aschenputtel', 'La Cenerentola'],
    'guglielmo-tell': ['Wilhelm Tell', 'Guglielmo Tell'],
    'ring-rheingold': ['Rheingold'],
    'ring-walkuere': ['Walküre'],
    'tristan': ['Tristan & Isolde'],
    'madama-butterfly': ['Madame Butterfly'],
    'i-puritani': ['Die Puritaner'],
    'la-sonnambula': ['Die Nachtwandlerin'],
    // Gounods Faust hieß auf deutschen Bühnen lange "Margarethe".
    'faust': ['Margarethe'],
    'otello': ['Othello'],
    'wildschuetz': ['Wildschütz'],
    'dido-aeneas': ['Dido und Aeneas'],
    'akhnaten': ['Echnaton'],
    // aus der Datenbank; deutsche Häuser spielen sie oft unter deutschem Titel
    'la-gazza-ladra': ['Die diebische Elster', 'Diebische Elster'],
    'elisir': ["L’elisir d’amore", 'Der Liebestrank', "L'elisir d'amore"],
    'jenufa': ['Jenufa', 'Její pastorkyňa'],
    'katja-kabanova': ['Katja Kabanowa', 'Káťa Kabanová'],
    'schlaue-fuechslein': ['Schlaue Füchslein'],
    'blaubart': ['Herzog Blaubarts Burg', 'Bluebeard'],
    'eugen-onegin': ['Eugene Onegin', 'Jewgeni Onegin'],
    'pique-dame': ['Pikowaja dama', 'Queen of Spades'],
    'boris-godunow': ['Boris Godunov'],
    'hoffmanns-erzaehlungen': ["Les Contes d'Hoffmann", 'Les Contes d’Hoffmann', 'Hoffmanns Erzählungen'],
    'samson-dalila': ['Samson und Dalila', 'Samson et Dalila'],
    'verkaufte-braut': ['Verkaufte Braut', 'Prodaná nevěsta'],
    'lady-macbeth': ['Lady Macbeth von Mzensk', 'Lady Macbeth of Mtsensk', 'Lady Macbeth'],
    'pelleas': ['Pelléas et Mélisande', 'Pelleas und Melisande'],
    'tote-stadt': ['Tote Stadt'],
    'lustige-witwe': ['Lustige Witwe'],
    'land-des-laechelns': ['Land des Lächelns'],
    'fledermaus': ['Fledermaus'],
    'csardasfuerstin': ['Csárdásfürstin', 'Csardasfürstin'],
    'orfeo-euridice': ['Orpheus und Eurydike', 'Orphée et Eurydice', 'Orfeo ed Euridice'],
    'iphigenie-tauride': ['Iphigenie auf Tauris', 'Iphigénie en Tauride'],
    'orfeo': ["L'Orfeo", 'L’Orfeo'],
    'poppea': ["L'incoronazione di Poppea", 'L’incoronazione di Poppea', 'Die Krönung der Poppea'],
    'les-troyens': ['Die Trojaner'],
    'perlenfischer': ['Die Perlenfischer', 'Les Pêcheurs de perles'],
    'fuerst-igor': ['Fürst Igor', 'Prince Igor'],
    'cavalleria-rusticana': ['Cavalleria rusticana'],
    'pagliacci': ['Der Bajazzo', 'I Pagliacci'],
    'liebe-drei-orangen': ['Die Liebe zu den drei Orangen', 'L’amour des trois oranges', "L'amour des trois oranges"],
    'mahagonny': ['Mahagonny'],
    'porgy-bess': ['Porgy & Bess'],
    'rake-progress': ["The Rake’s Progress", "The Rake's Progress"],
    'dialogues-carmelites': ['Dialogues des Carmélites', 'Gespräche der Karmelitinnen'],
    'turn-of-screw': ['The Turn of the Screw'],
    'midsummer-nights-dream': ["A Midsummer Night’s Dream", 'Ein Sommernachtstraum'],
    'ring-goetterdaemmerung': ['Götterdämmerung'],
};

// Diese Titel sind auch Schauspiele, Ballette oder Namen. Dort braucht es den
// Komponisten auf der Seite, sonst wird der Treffer als unsicher markiert.
const MEHRDEUTIG = new Set(['faust', 'macbeth', 'otello', 'elektra', 'salome', 'carmen', 'siegfried', 'undine',
    'martha', 'oberon', 'daphne', 'intermezzo', 'capriccio', 'manon', 'lulu', 'norma', 'alcina', 'werther',
    'midsummer-nights-dream', 'haensel-gretel', 'orfeo', 'guglielmo-tell', 'cenerentola', 'marnie', 'rusalka',
    'arabella', 'falstaff', 'idomeneo', 'parsifal', 'lohengrin', 'tosca', 'aida', 'nabucco']);

// Weiche Trennstriche und Zeichen ohne Breite fallen weg: die Wiener
// Staatsoper schreibt "Fleder\u00admaus", damit das Wort umbrechen kann.
const norm = s => String(s || '').toLowerCase().normalize('NFC').replace(/[\u00ad\u200b-\u200d\u2060]/g, '').replace(/[’‘`]/g, "'").replace(/\s+/g, ' ').trim();

// Kinderfassungen sind nicht das Werk – wer "Die Zauberflöte" sehen will,
// meint nicht die Stunde für Grundschüler.
const KINDERFASSUNG = /für kinder|kinderfassung|kinderoper|kinderkonzert|familienkonzert|für kids|gekürzte fassung|kurzfassung/i;
const slug = s => norm(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Wie Häuser dieselben Komponisten sonst schreiben (Schlüssel ohne Akzente).
// Ohne sie fiel etwa Pique Dame an der Deutschen Oper Berlin heraus, die
// "Tschaikowski" schreibt.
const KOMPONIST_SCHREIBWEISEN = {
    tschaikowsky: ['tschaikowski', 'tschajkowski', 'tschaikowskij', 'tschajkowskij', 'tchaikovsky', 'tschaikovsky', 'tchaikowsky'],
    mussorgsky: ['mussorgski', 'mussorgskij', 'moussorgsky', 'musorgski'],
    prokofjew: ['prokofiev', 'prokofieff', 'prokofjev', 'prokofjeff'],
    strawinsky: ['stravinsky', 'strawinski'],
    schostakowitsch: ['shostakovich', 'schostakowitch'],
    handel: ['haendel'],
};

/**
 * Der Nachname des Komponisten als Muster. ß und ss gelten gleich: der
 * Katalog schreibt "Strauss", die Volksoper und Karlsruhe "Strauß" – sonst
 * fiel dort die Fledermaus als "Komponist nicht genannt" heraus. Akzente
 * zählen nicht ("Dvorak", "Janacek", "Lehar"), und bekannte andere
 * Schreibweisen gelten mit.
 * @returns {{test: (text: string) => boolean}}
 */
export function komponistMuster(nachname) {
    const basis = ohneAkzente(nachname);
    const formen = [basis, ...(KOMPONIST_SCHREIBWEISEN[basis] || [])];
    const re = new RegExp(formen.map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ss|ß/g, '(?:ss|ß)')).join('|'), 'i');
    return { test: text => re.test(ohneAkzente(text)) };
}

// Adressen schreiben Umlaute oft aus und lassen Apostrophe weg: Zürich hat
// "die-walkuere" und "lelisir-damore". Beides zählt.
const adressFormen = t => [slug(t), slug(t.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')), slug(t.replace(/'/g, ''))];

// Titel im Text ohne Akzente vergleichen: Häuser schreiben "Andrea Chenier",
// "Aïda", "Katja Kabanova", "Les Pecheurs de perles". Umlaute zählen dabei
// wie ihr Grundbuchstabe – "Hänsel" trifft "Hänsel" wie bisher.
const ohneAkzente = s => norm(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const trifft = (w, text) => { const t = ohneAkzente(text); return w.muster.some(m => m.test(t)); };

function alsWerk(o) {
    const titel = [...new Set([o.title, ...(ANDERE_TITEL[o.id] || [])].map(norm))];
    const nachname = o.composer.replace(/\s+(II|I|Sohn|der Jüngere)$/i, '').split(' ').pop();
    return {
        id: o.id,
        titel,
        slugs: [...new Set(titel.flatMap(adressFormen).filter(s => s.length >= 4))],
        komponist: komponistMuster(nachname),
        // Nur Titel, die für sich stehen: "Siegfried" soll nicht in
        // "Siegfried Jerusalem" treffen, "Aida" nicht in "Aidan".
        muster: titel.map(t => new RegExp(`(^|[^a-z0-9ß])${ohneAkzente(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9ß])`, 'i')),
    };
}

// Die Werke aus operas.js; main() nimmt die aus der Datenbank dazu.
const WERKE = [];

/** Nimmt Werke ({id, title, composer}) in die Suche auf, die dort noch fehlen. */
export function werkeErgaenzen(liste) {
    for (const o of liste) if (o?.id && o.title && o.composer && !WERKE.some(w => w.id === o.id)) WERKE.push(alsWerk(o));
}
werkeErgaenzen(operas);

function werkeImText(text) {
    const t = norm(text);
    return WERKE.filter(w => trifft(w, t));
}

function seitenPfad(href) {
    try { return slug(entschluesselt(new URL(href).pathname)); } catch { return ''; }
}

// Mit --werke: nur diese. Gesucht wird trotzdem im ganzen Katalog, sonst
// hielte man die Seite von "Lady Macbeth von Mzensk" für "Macbeth".
let SUCHE = null;

export function werkeImLink(text, href, suche = SUCHE) {
    const treffer = new Set(werkeImText(text).map(w => w.id));
    const pfad = seitenPfad(href);
    for (const w of WERKE) if (w.slugs.some(s => pfad.includes(s))) treffer.add(w.id);
    const ids = ohneEnthaltene([...treffer]);
    return suche ? ids.filter(id => suche.has(id)) : ids;
}

// "Lady Macbeth von Mzensk" enthält "Macbeth", "Götterdämmerung" nicht, aber
// "Don Carlo" steckt in "Don Carlos". Trifft ein längerer Titel, fällt der
// darin enthaltene kürzere weg.
function ohneEnthaltene(ids) {
    const titelVon = id => WERKE.find(w => w.id === id).titel;
    return ids.filter(id => !ids.some(anderes => anderes !== id
        && titelVon(id).every(t => titelVon(anderes).some(l => l.length > t.length && l.includes(t)))));
}

// Eine Vorstellung im Pfad: ".../2026-10-03/" oder ".../03-10-2026/1930" (Nürnberg).
const VORSTELLUNG_IM_PFAD = /\/(\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4}(\/\d{3,4})?)\/?$/;

export function produktionsSeite(url) {
    try {
        const u = new URL(url);
        let geaendert = false;
        if (VORSTELLUNG_IM_PFAD.test(u.pathname)) { u.pathname = u.pathname.replace(VORSTELLUNG_IM_PFAD, '/'); geaendert = true; }
        if (/event|date|datum|termin|id_/i.test(u.search)) { u.search = ''; geaendert = true; }
        return geaendert ? u.href : null;
    } catch { return null; }
}

// Wie sehr eine Adresse nach einer einzelnen Vorstellung aussieht: 0 für die
// Seite einer Produktion, 2 für ein Datum in Pfad oder Abfrage.
function rang(url) {
    if (VORSTELLUNG_IM_PFAD.test(url.split(/[?#]/)[0]) || /[?&](event|date|datum|termin|id_)/i.test(url)) return 2;
    if (/\/\d{3,}\/?$/.test(url)) return 1;
    return 0;
}

// Nebenveranstaltungen zu einem Werk sind keine Vorstellungen.
// "Hör’n Sie mal!" ist in Hannover eine Einführung zum Hören.
const NEBENHER = /einführung|matinee|öffentliche probe|probe|opernlab|workshop|führung|gespräch|podcast|nachgespräch|werkstatt|begegnung|einblick|soir[ée]e|kostprobe|stream|lecture|hör.?n sie mal/i;

// Knöpfe, die weitere Termine nachladen. Die Deutsche Oper Berlin zeigt im
// Monatskalender erst die halbe Liste; der Rest kommt mit "weitere
// Spieltage anzeigen" – ohne den Klick fehlten dort die Uhrzeiten der
// zweiten Monatshälfte.
export const NACHLADEN = /^\s*(mehr (laden|anzeigen)|(mehr|weitere) (termine|vorstellungen|spieltage)( laden| anzeigen)?|weitere laden|alle termine|load more|show more)\s*$/i;
// Knöpfe, die das Werkzeug direkt auslöst, auch wenn Playwright sie für
// verdeckt hält: nur solche, die ausdrücklich Termine nachladen – ein
// allgemeines "Mehr anzeigen" klappt oft nur einen Text auf.
export const NACHLADEN_DIREKT = /^\s*(mehr|weitere) (termine|vorstellungen|spieltage)( laden| anzeigen)?\s*$/i;

const UEBERSICHT = /spielzeit\s*(20)?2[67]|saison\s*(20)?2[67]|premieren|repertoire|musiktheater|^oper$|^opera$|produktionen|stücke|programm 20?2[67]|season 20?2[67]|alle vorstellungen|festspiele 2027|programm 2027/i;
const HINWEISE = [['ballett', /ballett|ballet|tanzstück|choreograf/i], ['schauspiel', /schauspiel(?!haus)|theaterstück|nach william shakespeare|von johann wolfgang|drama von/i],
    ['konzert', /sinfoniekonzert|konzert(?!ant)|liederabend|gala/i], ['kinder', /für kinder|kinderoper|familien|ab \d+ jahren/i], ['konzertant', /konzertant/i]];

// Im zugeklappten Menü zählt nur, was ganz eine Übersicht benennt: Graz hat
// dort "Musiktheaterclub 1", Hamburg "Premieren-Abo (PrA)".
const UEBERSICHT_MENUE = /^((spielzeit|saison|season|programm)\s*(20)?2[67]\S*|premieren|repertoire|musiktheater|oper|opera|(alle )?produktionen|(unsere )?stücke|alle vorstellungen)$/i;

/**
 * Links einer Seite auf Übersichten der Spielzeit, auf demselben Server.
 * Sichtbare zuerst: das zugeklappte Menü steht oben im Dokument, und seine
 * Links verdrängten sonst die aus dem Inhalt – es sind höchstens vier.
 */
export function uebersichtsSeiten(links, seitenUrl) {
    const server = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return null; } };
    const ursprung = server(seitenUrl);
    // Nennt die Adresse schon ein Werk, ist es dessen Seite, keine Übersicht:
    // Burg Gars verlinkt unter "Oper" direkt die Bohème – als Übersicht
    // gelesen, fiel sie als Produktionsseite weg.
    const passend = links.filter(l => server(l.href) === ursprung && !werkeImLink('', l.href, null).length
        && (l.verborgen ? UEBERSICHT_MENUE.test(l.text || l.menueText || '') : UEBERSICHT.test(l.text)));
    return [...new Set([...passend.filter(l => !l.verborgen), ...passend.filter(l => l.verborgen)].map(l => l.href))];
}

/**
 * Die Termine einer Produktionsseite. Termine mit Uhrzeit im Text gehen vor;
 * nur ohne sie zählen auch Daten aus Attributen (d.zusatz). Ausnahme: nennt
 * der Text nur einen Termin, und das in einem Satz ("Mit Audiodeskription am
 * 11.12.2026, 17.00 Uhr"), während die Attribute ihn und weitere tragen, dann
 * ist die Terminliste in den Attributen – Gelsenkirchen verlor so bei Tosca
 * zehn von elf Vorstellungen.
 *
 * Fehlt im Text die Uhrzeit, kommt sie aus schema.org-Events der Seite
 * (d.ereignisse), soweit eindeutig.
 *
 * @param {{text: string, zusatz: string, ereignisse?: {start: string, ende?: string}[]}} d  gelesene Seite
 * @param {{ortJeTermin?: string}} q  Quelle des Hauses
 * @returns {{termine: string[], zeiten: Object<string, string>, ohneUhrzeit: boolean}}
 */
export function seitenTermine(d, fenster, q = {}) {
    const erg = termineDerSeite(d, fenster, q);
    // Die Uhrzeit aus den strukturierten Daten, wo der Text keine nennt –
    // nur für Termine, die die Seite ohnehin hat.
    const ausLd = zeitenAusLd(d.ereignisse, fenster);
    for (const t of erg.termine) if (!erg.zeiten[t] && ausLd[t]) erg.zeiten[t] = ausLd[t];
    return erg;
}

function termineDerSeite(d, fenster, q) {
    // Die Quelle sagt, wo die Terminliste steht: nur die zählt. Erfurt hebt
    // im Text Premiere, Matinee und "Rang frei!" hervor; die Vorstellungen
    // stehen nur im Reiter "Termine".
    if (d.eintraege?.length) {
        const termine = new Set();
        const zeiten = {};
        for (const { datum, text } of d.eintraege) {
            const tag = /^20\d\d-\d\d-\d\d/.exec(datum)?.[0];
            if (!tag || tag < fenster.von || tag > fenster.bis) continue;
            termine.add(tag);
            const zeit = beginnFinden([text]);
            if (zeit && !zeiten[tag]) zeiten[tag] = zeit;
        }
        return { termine: [...termine].sort(), zeiten, ohneUhrzeit: !Object.keys(zeiten).length };
    }
    const ort = q.ortJeTermin || undefined;
    // Nur die laufende oder eine spätere Spielzeit: Oldenburg führt die
    // Wiederaufnahme des Barbiers unter ".../spielzeit-25/26/...".
    const ausAdresse = saisonAusAdresse(d.endUrl);
    const laufend = Number(fenster.von.slice(0, 4)) - (Number(fenster.von.slice(5, 7)) >= 8 ? 0 : 1);
    const saison = ausAdresse && ausAdresse >= laufend ? ausAdresse : undefined;
    const { termine: mitUhrzeit, zeiten, abgesagt } = termineMitZeiten(d.text, fenster, { ort, saison });
    // Nennt der Text Vorstellungen, aber alle abgesagt, gibt es keine – in
    // den Attributen stehen dieselben Daten noch einmal (Krefeld verschob
    // Blaubart in die nächste Spielzeit und ließ jeden Termin mit "Entfällt"
    // stehen).
    if (!mitUhrzeit.length && abgesagt.length) return { termine: [], zeiten: {}, ohneUhrzeit: true };
    const ohneAbgesagte = termine => termine.filter(t => !abgesagt.includes(t));
    // Daten aus Attributen haben keinen Eintrag, in dem ein Ort stehen könnte.
    if (ort) return mitUhrzeit.length ? { termine: mitUhrzeit, zeiten, ohneUhrzeit: false }
        : { termine: ohneAbgesagte(termineAusText(d.text, fenster, { ort, saison })), zeiten: {}, ohneUhrzeit: true };
    if (mitUhrzeit.length === 1) {
        const [einer] = mitUhrzeit;
        const ausAttributen = termineAusText(d.zusatz || '', fenster);
        const imSatz = d.text.split('\n').some(z => /\bam\s+\d/i.test(z) && termineAusText(z, fenster).includes(einer));
        if (imSatz && ausAttributen.length > 1 && ausAttributen.includes(einer)) {
            return { termine: ohneAbgesagte(termineAusText(`${d.text}\n${d.zusatz}`, fenster, { saison })), zeiten: {}, ohneUhrzeit: true };
        }
    }
    if (mitUhrzeit.length) return { termine: mitUhrzeit, zeiten, ohneUhrzeit: false };
    return { termine: termineAusText(`${d.text}\n${d.zusatz}`, fenster, { saison }), zeiten, ohneUhrzeit: true };
}

/**
 * Die Ansichten der einzelnen Termine einer Produktionsseite. Die Oper
 * Frankfurt nennt auf der Seite alle Daten, den Beginn aber nur für den
 * gewählten; jeder Termin hat einen eigenen Link ("?id_datum=4972#date").
 * Nur Links auf dieselbe Seite, jeder einmal.
 *
 * @param {{href: string}[]} links
 * @param {string} seitenUrl
 * @param {string} muster  Stück der Adresse, etwa "id_datum="
 * @returns {string[]}
 */
export function terminAnsichten(links, seitenUrl, muster) {
    const pfad = u => { try { const x = new URL(u); return x.origin + x.pathname; } catch { return null; } };
    const hier = pfad(seitenUrl);
    return [...new Set(links.map(l => l.href.split('#')[0])
        .filter(h => h.includes(muster) && pfad(h) === hier && h !== seitenUrl.split('#')[0]))];
}

/**
 * Welche Kandidaten gelesen werden: je Werk höchstens zwei Seiten, je Haus
 * höchstens `grenze`. Kalender, die jede Vorstellung einzeln verlinken,
 * erschöpften sonst das Kontingent mit dem ersten Werk. Seiten ohne Nummer im
 * Pfad zuerst – das sind meist die Seiten der Produktion mit allen Terminen –,
 * unter ihnen die, deren Adresse das Werk nennt.
 * Erst bekommt jedes Werk seine beste Seite, dann die zweite: in Wien und
 * München reichte die Grenze sonst nur für 30 Werke, und der Rest fiel weg.
 * Wien hat über 50 Werke im Repertoire, oft mit zwei Seiten ("don-carlo"
 * ohne Termine, "don-carlos" mit) – daher 100.
 *
 * @param {Map<string, Set<string>>} kandidaten  Adresse -> Werke
 * @param {Set<string>} gesehen  schon gelesene Übersichtsseiten
 * @returns {Map<string, Set<string>>} Adresse -> Werke, in Lesereihenfolge
 */
export function seitenAuswahl(kandidaten, gesehen = new Set(), grenze = 100) {
    const jeWerk = new Map();
    for (const [url, ids] of kandidaten) for (const id of ids) {
        if (gesehen.has(url)) continue;
        if (!jeWerk.has(id)) jeWerk.set(id, []);
        jeWerk.get(id).push(url);
    }
    // Nennt die Adresse das Werk, ist es eher die Produktion als eine
    // Nebenveranstaltung dazu: in Frankfurt verdrängten "kinderbetreuung/"
    // und "opera-next-level/" die Seite von Hänsel und Gretel.
    const nennt = (url, id) => (WERKE.find(w => w.id === id)?.slugs || []).some(sl => seitenPfad(url).includes(sl)) ? 0 : 1;
    for (const [id, urls] of jeWerk) urls.sort((a, b) => rang(a) - rang(b) || nennt(a, id) - nennt(b, id) || a.length - b.length);
    const auswahl = new Map();
    for (const stufe of [0, 1]) for (const [id, urls] of jeWerk) {
        const u = urls[stufe];
        if (!u || (!auswahl.has(u) && auswahl.size >= grenze)) continue;
        if (!auswahl.has(u)) auswahl.set(u, new Set());
        auswahl.get(u).add(id);
    }
    return auswahl;
}

async function ladePlaywright() {
    const weg = pathToFileURL(path.join(WURZEL, 'tests/browser/node_modules/playwright/index.js')).href;
    const m = await import(weg);
    return m.chromium ? m : m.default;
}

export async function seite(kontext, url, { terminSelektor, hauptteil } = {}) {
    const p = await kontext.newPage();
    try {
        const antwort = await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await p.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
        // Eine Cookieleiste ablehnen, wie ein sparsamer Besucher: manche
        // Seiten beleben ihre Knöpfe erst nach der Entscheidung (Erfurt:
        // "Weitere Termine laden").
        const abgelehnt = await p.evaluate(() => {
            const k = [...document.querySelectorAll('button, a[role="button"]')].find(b => b.offsetParent !== null
                && /^\s*(alle ablehnen|ablehnen|nur notwendige( cookies)?|reject all)\s*$/i.test(b.textContent || ''));
            if (!k) return false;
            k.click();
            return true;
        }).catch(() => false);
        if (abgelehnt) await p.waitForTimeout(500);
        // Zugeklappte Abschnitte "Termine" öffnen: zugeklappter Text fehlt in
        // innerText, und Oper Burg Gars führt die Vorstellungen nur dort.
        const aufgeklappt = await p.evaluate(() => {
            const titel = /^\s*(alle\s+)?(spiel)?termine(\s*(und|&)\s*(karten|tickets))?\s*$|^\s*(vorstellungen|dates|performances)\s*$/i;
            let n = 0;
            for (const d of document.querySelectorAll('details:not([open])')) {
                if (titel.test(d.querySelector('summary')?.textContent || '')) { d.open = true; n++; }
            }
            for (const k of document.querySelectorAll('button, [role="button"], [role="tab"], [aria-controls], .toggler')) {
                if (k.getAttribute('aria-expanded') === 'true' || !titel.test(k.textContent || '')) continue;
                k.click();
                n++;
            }
            return n;
        }).catch(() => 0);
        if (aufgeklappt) await p.waitForTimeout(600);
        // Nachgeladene Listen: ans Ende rollen und "Mehr laden" drücken, bis
        // nichts mehr dazukommt – höchstens achtmal.
        for (let i = 0; i < 8; i++) {
            const vorher = await p.evaluate(() => document.body.scrollHeight).catch(() => 0);
            await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
            const knopf = p.locator('button, a[role="button"]').filter({ hasText: NACHLADEN }).first();
            if (await knopf.isVisible().catch(() => false)) await knopf.click({ timeout: 3000 }).catch(() => {});
            await p.waitForTimeout(900);
            const nachher = await p.evaluate(() => document.body.scrollHeight).catch(() => 0);
            if (nachher <= vorher) break;
        }
        // Knöpfe, die Playwright für unsichtbar hält, weil der Browser den
        // Bereich außerhalb des Bildes nicht zeichnet oder eine Leiste darüber
        // liegt (Erfurt: "Weitere Termine laden" unter der Cookieleiste):
        // direkt auslösen. Nur Knöpfe in angezeigten Bereichen – der Reiter
        // mit den Begleitterminen bleibt zu.
        for (let i = 0; i < 8; i++) {
            const geklickt = await p.evaluate(({ quelle, flags }) => {
                const muster = new RegExp(quelle, flags);
                const k = [...document.querySelectorAll('button')].find(b => b.offsetParent !== null && !b.disabled
                    && muster.test(b.textContent || ''));
                if (!k) return false;
                k.click();
                return true;
            }, { quelle: NACHLADEN_DIREKT.source, flags: NACHLADEN_DIREKT.flags }).catch(() => false);
            if (!geklickt) break;
            await p.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
            await p.waitForTimeout(600);
        }
        const daten = await p.evaluate(({ terminSelektor, hauptteil }) => {
            // hauptteil (spielplan-quellen.json): wo der Inhalt steht, wenn
            // <main> etwas anderes ist – bei Burg Gars der Kontaktkasten.
            const haupt = (hauptteil && document.querySelector(hauptteil)) || document.querySelector('main') || document.body;
            const attribute = [...document.querySelectorAll('[datetime],[content],[data-date],[data-datetime],[data-start]')]
                .map(e => e.getAttribute('datetime') || e.getAttribute('data-date') || e.getAttribute('data-datetime') || e.getAttribute('data-start') || e.getAttribute('content'))
                .filter(v => /20\d\d-\d\d-\d\d/.test(v || '')).join(' ');
            const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent).join(' ');
            // Vorstellungen als schema.org Event, mit Uhrzeit (Zürich)
            const ereignisse = [];
            const sammleLd = (o) => {
                if (!o || typeof o !== 'object') return;
                if (Array.isArray(o)) { o.forEach(sammleLd); return; }
                if (/Event$/.test([].concat(o['@type'] || []).join(' ')) && typeof o.startDate === 'string') {
                    ereignisse.push({ start: o.startDate, ende: typeof o.endDate === 'string' ? o.endDate : '' });
                }
                Object.values(o).forEach(sammleLd);
            };
            for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
                try { sammleLd(JSON.parse(s.textContent)); } catch { /* kaputtes JSON: dann eben nicht */ }
            }
            return {
                titel: document.title,
                h1: [...document.querySelectorAll('h1, h2')].slice(0, 3).map(h => h.innerText).join(' | '),
                text: haupt.innerText,
                ganzerText: document.body.innerText,
                zusatz: attribute + ' ' + (ld.match(/20\d\d-\d\d-\d\dT?/g) || []).join(' '),
                ereignisse,
                // Links im zugeklappten Menü haben keinen sichtbaren Text. Für
                // Übersichtsseiten zählt ihr Text trotzdem (menueText): in
                // Zürich führt nur das Menü zur Spielzeit. Für Werke nicht –
                // in Graz nennt ein unsichtbarer "Nachklang"-Link die Bohème.
                links: [...document.querySelectorAll('a[href]')].map(a => {
                    const sichtbar = (a.innerText || '').trim();
                    const link = { href: a.href, text: (sichtbar || a.getAttribute('aria-label') || a.title || '').trim().slice(0, 200), verborgen: !sichtbar };
                    if (!sichtbar) link.menueText = (a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 200);
                    return link;
                }),
                // Kalender listen Vorstellungen als Einträge: Datum, Uhrzeit,
                // Titel, Link. Zu jedem Link der kleinste umgebende Eintrag,
                // in dem ein Datum steht – so gehört das Datum sicher zu
                // diesem Titel und nicht zum Nachbarn.
                bloecke: [...document.querySelectorAll('a[href]')].map(a => {
                    let el = a;
                    for (let i = 0; i < 6 && el; i++, el = el.parentElement) {
                        const t = el.innerText || '';
                        if (t.length > 600) return null;
                        if (/\d{1,2}\.\s?\d{1,2}\.|\d{1,2}\.?\s+[A-Za-zäÄöÖüÜé]{3,}|20\d\d-\d\d-\d\d/.test(t)) {
                            return { href: a.href, text: (a.innerText || '').trim().slice(0, 200), block: t };
                        }
                    }
                    return null;
                }).filter(Boolean),
                // Mit terminSelektor (spielplan-quellen.json): die Einträge der
                // Terminliste, je mit dem Text ihres Eintrags für die Uhrzeit.
                eintraege: terminSelektor ? [...document.querySelectorAll(terminSelektor)].map(e => ({
                    datum: e.getAttribute('datetime') || e.getAttribute('data-date') || '',
                    text: (e.closest('li, tr, article, [class*="item"]') || e.parentElement)?.textContent.replace(/\s+/g, ' ').trim().slice(0, 300) || '',
                })) : null,
            };
        }, { terminSelektor: terminSelektor || null, hauptteil: hauptteil || null });
        return { status: antwort?.status() ?? 0, endUrl: p.url(), ...daten };
    } finally {
        await p.close();
    }
}

/**
 * Monatskalender: steht {JJJJ} und {MM} in einer Einstiegsadresse, wird sie
 * für jeden Monat von jetzt bis zum Ende des Fensters eingesetzt. So kommt
 * man bei Häusern, deren Spielplan nur einen Monat zeigt, an die ganze
 * Spielzeit.
 */
export function monatsAdressen(vorlage, fenster) {
    if (!/\{JJJJ\}|\{MM\}/.test(vorlage)) return [vorlage];
    const adressen = [];
    let [j, m] = fenster.von.split('-').map(Number);
    const [bj, bm] = fenster.bis.split('-').map(Number);
    while (j < bj || (j === bj && m <= bm)) {
        adressen.push(vorlage.replaceAll('{JJJJ}', String(j)).replaceAll('{MM}', String(m).padStart(2, '0')));
        m += 1;
        if (m > 12) { m = 1; j += 1; }
    }
    return adressen;
}

/**
 * Findet in den Links einer Spielplanseite die Monatsnavigation und macht
 * daraus eine Vorlage für monatsAdressen(). Erkannt werden Adressen, in denen
 * ein Monat oder ein Tag am Ende des Pfads oder als Wert einer Abfrage steht:
 *
 *   /spielplan/kalender/2026-10/        → /spielplan/kalender/{JJJJ}-{MM}/
 *   /de/spielplan/01-10-2026/           → /de/spielplan/01-{MM}-{JJJJ}/
 *   /calendar?date_from=2026-10-01&x=1  → /calendar?date_from={JJJJ}-{MM}-01&x=1
 *
 * Nicht erkannt werden Seiten einzelner Vorstellungen – dort geht es nach
 * dem Datum weiter ("/stuecke/semele/2026-09-25-1800-16095").
 *
 * @returns {string|null} die häufigste Vorlage, oder null
 */
export function monatsVorlage(hrefs, fenster) {
    const zaehler = new Map();
    const ab = fenster.von.slice(0, 7);
    for (const href of hrefs) {
        let u;
        try { u = new URL(href); } catch { continue; }
        const kandidaten = [];
        // Im Pfad, als letzter Abschnitt
        const pfad = u.pathname.match(/^(.*\/)(?:(20\d\d)-(\d\d)(?:-(\d\d))?|(\d\d)-(\d\d)-(20\d\d))\/?$/);
        // Davor muss ein Kalender stehen, kein Stück: "/kalender/detail/
        // die-fledermaus/2026-12-31/" ist die Seite einer Vorstellung.
        if (pfad && /\/(kalender|spielplan|calendar|programm|termine|schedule|monat|agenda|saison|spielzeit)\/$/i.test(pfad[1])) {
            const [, vor, j1, m1, t1, t2, m2, j2] = pfad;
            const j = j1 || j2, m = m1 || m2;
            const neu = j1 ? `${vor}{JJJJ}-{MM}${t1 ? '-01' : ''}${u.pathname.endsWith('/') ? '/' : ''}` : `${vor}01-{MM}-{JJJJ}${u.pathname.endsWith('/') ? '/' : ''}`;
            kandidaten.push({ monat: `${j}-${m}`, vorlage: `${u.origin}${neu}${u.search}` });
        }
        // Als Wert einer Abfrage
        for (const [k, v] of u.searchParams) {
            const d = v.match(/^(20\d\d)-(\d\d)(?:-(\d\d))?$/);
            if (!d) continue;
            const q = new URLSearchParams(u.search);
            q.set(k, d[3] ? '{JJJJ}-{MM}-01' : '{JJJJ}-{MM}');
            kandidaten.push({ monat: `${d[1]}-${d[2]}`, vorlage: `${u.origin}${u.pathname}?${q.toString().replace(/%7B/g, '{').replace(/%7D/g, '}')}` });
        }
        for (const { monat, vorlage } of kandidaten) {
            if (monat < ab) continue;
            if (!zaehler.has(vorlage)) zaehler.set(vorlage, new Set());
            zaehler.get(vorlage).add(monat);
        }
    }
    const beste = [...zaehler].sort((a, b) => b[1].size - a[1].size)[0];
    return beste ? beste[0] : null;
}

/**
 * Eine Quelle ist entweder eine Liste von Einstiegsadressen oder
 * {start: [...], ort: "Haus für Mozart"}. Mit ort zählen nur Stücke, auf deren
 * Seite diese Spielstätte steht – für Festspiele mit mehreren Bühnen und
 * einem gemeinsamen Programm (Salzburg, Bregenz, Erl, Theater an der Wien).
 * Mit ortJeTermin zählt jeder einzelne Termin nur, wenn der Ort in seinem
 * Eintrag steht – für Häuser, die viel auf Gastspiel gehen (Detmold).
 * Unter stuecke stehen Seiten einzelner Produktionen, die das Haus nirgends
 * verlinkt, wo das Werkzeug hinkommt (Pfalztheater); welche es gibt, sagt
 * das Spielzeitheft.
 * Mit kalenderZeiten kommen die Uhrzeiten aus den Kalenderseiten unter start
 * (siehe zeitenAusKalender) – nur für Häuser, deren Kalender dafür geprüft ist.
 * terminLinks ist ein Stück der Adresse, an dem die Links einer Produktionsseite
 * auf ihre einzelnen Termine zu erkennen sind (siehe terminAnsichten).
 */
function quelle(hausId) {
    const q = QUELLEN[hausId] || [];
    return Array.isArray(q) ? { start: q, ort: null, ortJeTermin: null, stuecke: [], terminSelektor: null, hauptteil: null, kalenderZeiten: false, terminLinks: null }
        : { start: q.start || [], ort: q.ort || null, ortJeTermin: q.ortJeTermin || null, stuecke: q.stuecke || [],
            terminSelektor: q.terminSelektor || null, hauptteil: q.hauptteil || null, kalenderZeiten: q.kalenderZeiten === true,
            terminLinks: q.terminLinks || null };
}

// Adressen mit kaputtem Prozentzeichen ("50%-Rabatt") ließen decodeURIComponent
// werfen – und damit die ganze Seite ausfallen.
const entschluesselt = s => { try { return decodeURIComponent(s); } catch { return s; } };

const enthaeltOrt = (text, ort) => !ort || norm(text).includes(norm(ort));

async function lesen(kontext, hausId, fenster) {
    const q = quelle(hausId);
    const erg = { haus: hausId, start: q.start.flatMap(u => monatsAdressen(u, fenster)), ort: q.ort, besucht: [], fehler: [], treffer: [] };
    const gesehen = new Set();
    const kandidaten = new Map(); // url -> Set(operaId)
    const uebersichten = [];

    const ausListen = new Map(); // operaId -> Set(Datum)
    const listenZeiten = new Map(); // operaId -> {Datum: Zeit}
    const sammleBloecke = (daten) => {
        for (const b of daten.bloecke || []) {
            if (NEBENHER.test(b.block) || !enthaeltOrt(b.block, q.ort)) continue;
            const ids = werkeImLink(b.text, b.href);
            if (!ids.length) continue;
            const { termine: mit, zeiten } = termineMitZeiten(b.block, fenster, { ort: q.ortJeTermin });
            // Mehr als drei Termine in einem Eintrag: das ist kein Eintrag,
            // sondern ein Behälter mit mehreren – lieber nichts nehmen.
            if (!mit.length || mit.length > 3) continue;
            for (const id of ids) {
                if (!ausListen.has(id)) ausListen.set(id, new Set());
                mit.forEach(t => ausListen.get(id).add(t));
                listenZeiten.set(id, { ...zeiten, ...(listenZeiten.get(id) || {}) });
            }
        }
    };
    // Uhrzeiten aus Kalenderseiten: die Seiten der Produktionen nennen oft nur
    // Daten (Mainz, Deutsche Oper Berlin), der Kalender die Uhrzeit dazu. Nur
    // wo eingeschaltet: im Kalender des Musiktheaters im Revier erkennt das
    // Werkzeug die Tage ("So.27.09.") nicht, und ein altes Datum bliebe an
    // allen folgenden Titeln hängen.
    const sammleZeiten = (daten, adresse) => {
        if (!q.kalenderZeiten) return;
        const kopf = monatAusAdresse(adresse, fenster);
        for (const [id, z] of zeitenAusKalender(daten.text, fenster, t => werkeImLink(t, ''), { monatskopf: kopf })) {
            listenZeiten.set(id, { ...z, ...(listenZeiten.get(id) || {}) });
        }
    };
    const sammle = (daten) => {
        sammleBloecke(daten);
        for (const l of daten.links) {
            if (!/^https?:/.test(l.href) || /\.(ics|pdf|jpg|png|mp3|mp4)(\?|$)/i.test(l.href)) continue;
            if (NEBENHER.test(l.text) || NEBENHER.test(entschluesselt(l.href))) continue;
            const ids = werkeImLink(l.text, l.href);
            if (!ids.length) continue;
            const url = l.href.split('#')[0];
            // Zu einer Seite für eine einzelne Vorstellung (Datum im Pfad
            // oder in der Abfrage) auch die Seite der Produktion vormerken –
            // dort stehen alle Termine.
            for (const u of [url, produktionsSeite(url)].filter(Boolean)) {
                if (!kandidaten.has(u)) kandidaten.set(u, new Set());
                ids.forEach(id => kandidaten.get(u).add(id));
            }
        }
    };

    const monatsseiten = [];
    for (const start of erg.start) {
        try {
            const d = await seite(kontext, start);
            gesehen.add(start);
            erg.besucht.push({ url: start, status: d.status, endUrl: d.endUrl, links: d.links.length });
            sammle(d);
            sammleZeiten(d, start);
            // Eine erkannte Monatsnavigation einmal je Haus durchgehen.
            if (!erg.monatsVorlage && !/\{JJJJ\}/.test(q.start.join(' '))) {
                const vorlage = monatsVorlage(d.links.map(l => l.href), fenster);
                if (vorlage) {
                    erg.monatsVorlage = vorlage;
                    monatsseiten.push(...monatsAdressen(vorlage, fenster).filter(u => !gesehen.has(u)));
                }
            }
            for (const u of uebersichtsSeiten(d.links, d.endUrl)) {
                if (uebersichten.length >= 4) break;
                if (!gesehen.has(u) && !uebersichten.includes(u)) uebersichten.push(u);
            }
        } catch (e) {
            erg.fehler.push(`${start}: ${e.message.split('\n')[0]}`);
        }
    }
    for (const u of monatsseiten) {
        try {
            const d = await seite(kontext, u);
            gesehen.add(u);
            erg.besucht.push({ url: u, status: d.status, links: d.links.length });
            sammle(d);
            sammleZeiten(d, u);
        } catch (e) {
            erg.fehler.push(`${u}: ${e.message.split('\n')[0]}`);
        }
    }
    for (const u of uebersichten) {
        try {
            const d = await seite(kontext, u);
            gesehen.add(u);
            erg.besucht.push({ url: u, status: d.status, links: d.links.length });
            sammle(d);
            sammleZeiten(d, u);
        } catch (e) {
            erg.fehler.push(`${u}: ${e.message.split('\n')[0]}`);
        }
    }

    // Ein Eintrag {url, werk}: die Seite eines Werks, das weder Adresse noch
    // Titel nennen (St. Margarethen: "Termine" mit allen Vorstellungen des
    // Sommers). Sie zählt nur, solange der Werktitel auf ihr steht – im
    // nächsten Jahr spielt der Steinbruch ein anderes Stück.
    const zugeordnet = new Map(); // url -> werk
    for (const u of q.stuecke) {
        const url = typeof u === 'string' ? u : u.url;
        const ids = typeof u === 'string' ? werkeImLink('', u) : [u.werk].filter(id => WERKE.some(w => w.id === id));
        if (!ids.length) { erg.fehler.push(`${url}: kein Werk aus dem Katalog in der Adresse`); continue; }
        if (typeof u !== 'string') zugeordnet.set(url, u.werk);
        if (!kandidaten.has(url)) kandidaten.set(url, new Set());
        ids.forEach(id => kandidaten.get(url).add(id));
    }

    // Übersichts- und Monatsseiten sind keine Seiten einer Produktion:
    // dort stehen die Termine aller Stücke.
    const auswahl = seitenAuswahl(kandidaten, gesehen);
    for (const [url, ids] of auswahl) {
        try {
            const d = await seite(kontext, url, { terminSelektor: q.terminSelektor, hauptteil: q.hauptteil });
            const { termine, zeiten, ohneUhrzeit } = seitenTermine(d, fenster, q);
            // Der Beginn steht nur in der Ansicht des einzelnen Termins (Frankfurt).
            if (q.terminLinks) {
                for (const u of terminAnsichten(d.links, d.endUrl, q.terminLinks).slice(0, 40)) {
                    if (termine.every(t => zeiten[t])) break;
                    try {
                        const e = await seite(kontext, u, { terminSelektor: q.terminSelektor, hauptteil: q.hauptteil });
                        for (const [t, z] of Object.entries(seitenTermine(e, fenster, q).zeiten)) {
                            if (termine.includes(t) && !zeiten[t]) zeiten[t] = z;
                        }
                    } catch (e) {
                        erg.fehler.push(`${u}: ${e.message.split('\n')[0]}`);
                    }
                }
            }
            const ganz = d.ganzerText;
            for (const id of ids) {
                const w = WERKE.find(x => x.id === id);
                // Die Seite einer Produktion trägt deren Titel oben oder in
                // der Adresse. Steht er dort nicht, ist es eine Sammelseite –
                // deren Termine gehören zu anderen Stücken (Klagenfurt: Aida
                // bekam alle Termine des Hauses). Die Adresse zählt mit, weil
                // manche Häuser oben nur "Programm" oder "Produktion" schreiben
                // (Schwerin, Braunschweig).
                const kopf = norm(`${d.titel} ${d.h1}`);
                const pfad = seitenPfad(d.endUrl);
                const titelOben = ((trifft(w, kopf) || w.slugs.some(sl => slug(kopf).includes(sl) || pfad.includes(sl)))
                    || (zugeordnet.get(url) === id && trifft(w, d.text)))
                    && !KINDERFASSUNG.test(kopf) && !KINDERFASSUNG.test(pfad.replace(/-/g, ' '));
                erg.treffer.push({
                    titelOben,
                    // Im Hauptteil, nicht im Kopf der Seite: dort steht bei einem
                    // gemeinsamen Auftritt oft jede Bühne.
                    ortGenannt: enthaeltOrt(d.text, q.ort),
                    werk: id,
                    url: d.endUrl,
                    seitenTitel: d.titel.slice(0, 120),
                    komponistGenannt: w.komponist.test(ganz),
                    mehrdeutig: MEHRDEUTIG.has(id),
                    hinweise: HINWEISE.filter(([, m]) => m.test(d.text.slice(0, 4000))).map(([n]) => n),
                    termine,
                    zeiten,
                    ohneUhrzeit,
                });
            }
        } catch (e) {
            erg.fehler.push(`${url}: ${e.message.split('\n')[0]}`);
        }
    }
    // Je Werk die eine Produktionsseite mit den meisten Terminen – nicht die
    // Summe aller Seiten. Die Wiener Staatsoper etwa hat zu jeder Vorstellung
    // eine eigene Seite, auf der ganz andere Daten stehen ("Vorverkauf ab").
    // Dazu die Termine aus den Kalenderlisten, die dort direkt am Titel stehen.
    erg.werke = {};
    const alleIds = new Set([...erg.treffer.map(t => t.werk), ...ausListen.keys()]);
    for (const id of alleIds) {
        const seiten = erg.treffer.filter(t => t.werk === id && t.titelOben && t.ortGenannt)
            .sort((a, b) => rang(a.url) - rang(b.url) || b.termine.length - a.termine.length);
        const beste = seiten[0];
        const liste = [...(ausListen.get(id) || [])];
        erg.werke[id] = {
            url: beste?.url || erg.treffer.find(t => t.werk === id)?.url || null,
            komponistGenannt: erg.treffer.some(t => t.werk === id && t.komponistGenannt),
            ausSeite: beste?.termine || [],
            ohneUhrzeit: beste ? beste.ohneUhrzeit : false,
            ausListe: liste.sort(),
            termine: [...new Set([...(beste?.termine || []), ...liste])].sort(),
            // Beginn (und Ende) je Termin, soweit eindeutig gelesen
            zeiten: { ...(listenZeiten.get(id) || {}), ...(beste?.zeiten || {}) },
        };
    }
    return erg;
}

async function main() {
    const args = process.argv.slice(2);
    const option = name => { const i = args.indexOf(name); if (i < 0) return null; const [, wert] = args.splice(i, 2); return wert; };
    const werkeOption = option('--werke');
    const straenge = Math.max(1, Number(option('--straenge')) || 4);
    const [ausgabe = 'spielplan-vorschlag.json', ...nur] = args;

    let ausDatenbank = [];
    try {
        ausDatenbank = await werkeAusDatenbank();
        werkeErgaenzen(ausDatenbank);
    } catch (e) {
        console.warn(`Werke aus der Datenbank nicht geladen (${e.message}) – nur die aus operas.js.`);
    }
    if (werkeOption) {
        SUCHE = new Set(werkeOption.split(',').map(w => w.trim()).filter(Boolean));
        const unbekannt = [...SUCHE].filter(id => !WERKE.some(w => w.id === id));
        if (unbekannt.length) { console.error(`Nicht im Katalog: ${unbekannt.join(', ')}`); process.exit(1); }
    }

    // Ortszeit, nicht UTC: kurz nach Mitternacht wäre es sonst noch gestern.
    const heute = heuteIso();
    const jahr = Number(heute.slice(0, 4));
    // Bis Ende September im Jahr nach dem Saisonstart – die Sommerfestspiele gehören dazu.
    const fenster = { von: heute, bis: `${Number(heute.slice(5, 7)) >= 8 ? jahr + 1 : jahr}-09-30` };
    const haeuser = operaHouses.map(h => h.id).filter(id => !nur.length || nur.includes(id));

    const bisher = fs.existsSync(ausgabe) ? JSON.parse(fs.readFileSync(ausgabe, 'utf8')) : {};
    // Für die Übernahme: welche Werke aus der Datenbank kamen, und wonach gesucht wurde.
    bisher._werke = ausDatenbank.map(({ id, title, composer }) => ({ id, title, composer }));
    if (SUCHE) bisher._suche = [...SUCHE];
    // Nur einzelne Häuser gelesen: die Übernahme mit --dazu ersetzt nur deren Einträge.
    if (nur.length) bisher._haeuser = [...new Set([...(bisher._haeuser || []), ...nur])];
    const pw = await ladePlaywright();
    const browser = await pw.chromium.launch();
    const kontext = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15 OpernLog-Spielplanlauf',
        locale: 'de-DE',
        viewport: { width: 1280, height: 1600 },
    });
    // Mehrere Häuser gleichzeitig, je Haus eine Seite nach der anderen.
    const warteschlange = [...haeuser];
    const strang = async () => {
        while (warteschlange.length) {
            const id = warteschlange.shift();
            const t0 = Date.now();
            const erg = await lesen(kontext, id, fenster);
            bisher[id] = { ...erg, fenster, stand: heute };
            fs.writeFileSync(ausgabe, JSON.stringify(bisher, null, 1));
            const werke = Object.values(erg.werke);
            console.log(`${id.padEnd(36)} ${String(werke.length).padStart(3)} Werke, ${String(werke.filter(w => w.termine.length).length).padStart(3)} mit Terminen, ${erg.fehler.length} Fehler, ${Math.round((Date.now() - t0) / 1000)}s`);
        }
    };
    await Promise.all(Array.from({ length: Math.min(straenge, haeuser.length) }, strang));
    await browser.close();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(e => { console.error(e); process.exit(1); });
}
