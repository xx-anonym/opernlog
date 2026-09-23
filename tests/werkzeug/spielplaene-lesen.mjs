// Liest die Spielpläne der Häuser im Katalog und schlägt Termine vor.
//
//   node tests/werkzeug/spielplaene-lesen.mjs [ausgabe.json] [haus-id …] [--werke id,id] [--straenge 4]
//
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
import { termineAusText, termineMitZeiten } from './spielplan-termine.mjs';

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
    'suor-angelica': ['Il trittico', 'Das Triptychon'],
    'il-tabarro': ['Il trittico', 'Das Triptychon', 'Der Mantel'],
    'rosenkavalier': ['Rosenkavalier'],
    'frau-ohne-schatten': ['Frau ohne Schatten'],
    'freischuetz': ['Freischütz'],
    'haensel-gretel': ['Hänsel & Gretel'],
    'giulio-cesare': ['Giulio Cesare', 'Julius Caesar'],
    'barbiere': ['Der Barbier von Sevilla', 'Il barbiere di Siviglia', 'Barbier von Sevilla'],
    'cenerentola': ['Aschenputtel', 'La Cenerentola'],
    'guglielmo-tell': ['Wilhelm Tell', 'Guglielmo Tell'],
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

/**
 * Der Nachname des Komponisten als Muster. ß und ss gelten gleich: der
 * Katalog schreibt "Strauss", die Volksoper und Karlsruhe "Strauß" – sonst
 * fiel dort die Fledermaus als "Komponist nicht genannt" heraus.
 */
export function komponistMuster(nachname) {
    const quelle = nachname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ss|ß/g, '(?:ss|ß)');
    return new RegExp(quelle, 'i');
}

function alsWerk(o) {
    const titel = [...new Set([o.title, ...(ANDERE_TITEL[o.id] || [])].map(norm))];
    const nachname = o.composer.replace(/\s+(II|I|Sohn|der Jüngere)$/i, '').split(' ').pop();
    return {
        id: o.id,
        titel,
        slugs: [...new Set(titel.map(slug).filter(s => s.length >= 4))],
        komponist: komponistMuster(nachname),
        // Nur Titel, die für sich stehen: "Siegfried" soll nicht in
        // "Siegfried Jerusalem" treffen, "Aida" nicht in "Aidan".
        muster: titel.map(t => new RegExp(`(^|[^a-zäöüß0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-zäöüß0-9])`, 'i')),
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
    return WERKE.filter(w => w.muster.some(m => m.test(t)));
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
const NEBENHER = /einführung|matinee|öffentliche probe|probe|opernlab|workshop|führung|gespräch|podcast|nachgespräch|werkstatt|begegnung|einblick|soir[ée]e|kostprobe|stream|lecture/i;

const UEBERSICHT = /spielzeit\s*(20)?2[67]|saison\s*(20)?2[67]|premieren|repertoire|musiktheater|^oper$|^opera$|produktionen|stücke|programm 20?2[67]|season 20?2[67]|alle vorstellungen|festspiele 2027|programm 2027/i;
const HINWEISE = [['ballett', /ballett|ballet|tanzstück|choreograf/i], ['schauspiel', /schauspiel(?!haus)|theaterstück|nach william shakespeare|von johann wolfgang|drama von/i],
    ['konzert', /sinfoniekonzert|konzert(?!ant)|liederabend|gala/i], ['kinder', /für kinder|kinderoper|familien|ab \d+ jahren/i], ['konzertant', /konzertant/i]];

async function ladePlaywright() {
    const weg = pathToFileURL(path.join(WURZEL, 'tests/browser/node_modules/playwright/index.js')).href;
    const m = await import(weg);
    return m.chromium ? m : m.default;
}

async function seite(kontext, url) {
    const p = await kontext.newPage();
    try {
        const antwort = await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await p.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {});
        // Nachgeladene Listen: ans Ende rollen und "Mehr laden" drücken, bis
        // nichts mehr dazukommt – höchstens achtmal.
        for (let i = 0; i < 8; i++) {
            const vorher = await p.evaluate(() => document.body.scrollHeight).catch(() => 0);
            await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
            const knopf = p.locator('button, a[role="button"]').filter({ hasText: /^\s*(mehr (laden|anzeigen|termine|vorstellungen)|weitere (laden|termine|vorstellungen)|alle termine|load more|show more)\s*$/i }).first();
            if (await knopf.isVisible().catch(() => false)) await knopf.click({ timeout: 3000 }).catch(() => {});
            await p.waitForTimeout(900);
            const nachher = await p.evaluate(() => document.body.scrollHeight).catch(() => 0);
            if (nachher <= vorher) break;
        }
        const daten = await p.evaluate(() => {
            const haupt = document.querySelector('main') || document.body;
            const attribute = [...document.querySelectorAll('[datetime],[content],[data-date],[data-datetime],[data-start]')]
                .map(e => e.getAttribute('datetime') || e.getAttribute('data-date') || e.getAttribute('data-datetime') || e.getAttribute('data-start') || e.getAttribute('content'))
                .filter(v => /20\d\d-\d\d-\d\d/.test(v || '')).join(' ');
            const ld = [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => s.textContent).join(' ');
            return {
                titel: document.title,
                h1: [...document.querySelectorAll('h1, h2')].slice(0, 3).map(h => h.innerText).join(' | '),
                text: haupt.innerText,
                ganzerText: document.body.innerText,
                zusatz: attribute + ' ' + (ld.match(/20\d\d-\d\d-\d\dT?/g) || []).join(' '),
                links: [...document.querySelectorAll('a[href]')].map(a => ({ href: a.href, text: (a.innerText || a.getAttribute('aria-label') || a.title || '').trim().slice(0, 200) })),
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
            };
        });
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
 */
function quelle(hausId) {
    const q = QUELLEN[hausId] || [];
    return Array.isArray(q) ? { start: q, ort: null, ortJeTermin: null, stuecke: [] }
        : { start: q.start || [], ort: q.ort || null, ortJeTermin: q.ortJeTermin || null, stuecke: q.stuecke || [] };
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
            // Eine erkannte Monatsnavigation einmal je Haus durchgehen.
            if (!erg.monatsVorlage && !/\{JJJJ\}/.test(q.start.join(' '))) {
                const vorlage = monatsVorlage(d.links.map(l => l.href), fenster);
                if (vorlage) {
                    erg.monatsVorlage = vorlage;
                    monatsseiten.push(...monatsAdressen(vorlage, fenster).filter(u => !gesehen.has(u)));
                }
            }
            const ursprung = new URL(d.endUrl).hostname.replace(/^www\./, '');
            for (const l of d.links) {
                if (uebersichten.length >= 4) break;
                let h = '';
                try { h = new URL(l.href).hostname.replace(/^www\./, ''); } catch { continue; }
                if (h === ursprung && UEBERSICHT.test(l.text) && !gesehen.has(l.href) && !uebersichten.includes(l.href)) uebersichten.push(l.href);
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
        } catch (e) {
            erg.fehler.push(`${u}: ${e.message.split('\n')[0]}`);
        }
    }

    for (const u of q.stuecke) {
        const ids = werkeImLink('', u);
        if (!ids.length) { erg.fehler.push(`${u}: kein Werk aus dem Katalog in der Adresse`); continue; }
        if (!kandidaten.has(u)) kandidaten.set(u, new Set());
        ids.forEach(id => kandidaten.get(u).add(id));
    }

    // Je Werk höchstens zwei Seiten, je Haus höchstens 60. Kalender, die
    // jede Vorstellung einzeln verlinken, erschöpften sonst das Kontingent
    // mit dem ersten Werk. Seiten ohne Nummer im Pfad zuerst – das sind meist
    // die Seiten der Produktion mit allen Terminen.
    const jeWerk = new Map();
    for (const [url, ids] of kandidaten) for (const id of ids) {
        if (!jeWerk.has(id)) jeWerk.set(id, []);
        jeWerk.get(id).push(url);
    }
    const auswahl = new Map();
    for (const [id, alle] of jeWerk) {
        // Übersichts- und Monatsseiten sind keine Seiten einer Produktion:
        // dort stehen die Termine aller Stücke.
        const urls = alle.filter(u => !gesehen.has(u));
        urls.sort((a, b) => rang(a) - rang(b) || a.length - b.length);
        for (const u of urls.slice(0, 2)) {
            if (!auswahl.has(u)) auswahl.set(u, new Set());
            auswahl.get(u).add(id);
        }
    }
    for (const [url, ids] of [...auswahl].slice(0, 60)) {
        try {
            const d = await seite(kontext, url);
            const { termine: mitUhrzeit, zeiten } = termineMitZeiten(d.text, fenster, { ort: q.ortJeTermin });
            // Daten aus Attributen haben keinen Eintrag, in dem ein Ort stehen könnte.
            const termine = mitUhrzeit.length ? mitUhrzeit
                : termineAusText(q.ortJeTermin ? d.text : `${d.text}\n${d.zusatz}`, fenster, { ort: q.ortJeTermin });
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
                const titelOben = (w.muster.some(m => m.test(kopf)) || w.slugs.some(sl => slug(kopf).includes(sl) || pfad.includes(sl)))
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
                    ohneUhrzeit: !mitUhrzeit.length,
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
