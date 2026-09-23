// Termine aus dem Text einer Spielplanseite lesen – ohne Browser, damit es
// sich prüfen lässt (tests/unit/spielplanTermine.test.js).
//
// Spielpläne schreiben Daten auf jede erdenkliche Weise: "Sa 03.10.",
// "3. Oktober 2026", "03 Okt", "October 3, 2026", "3 octobre", ISO in
// datetime-Attributen. Diese Datei erkennt die gängigen Formen und ergänzt
// ein fehlendes Jahr aus der Spielzeit: ein Datum ohne Jahr liegt im
// Zeitfenster, das der Aufrufer vorgibt (heute bis Ende der nächsten
// Sommerfestspiele).

const MONATE = {
    jan: 1, januar: 1, jänner: 1, jän: 1, january: 1, janvier: 1, gennaio: 1,
    feb: 2, februar: 2, feber: 2, february: 2, février: 2, fevrier: 2, febbraio: 2,
    mär: 3, mrz: 3, märz: 3, maerz: 3, mar: 3, march: 3, mars: 3, marzo: 3,
    apr: 4, april: 4, avril: 4, aprile: 4,
    mai: 5, may: 5, maggio: 5,
    jun: 6, juni: 6, june: 6, juin: 6, giugno: 6,
    jul: 7, juli: 7, july: 7, juillet: 7, luglio: 7,
    aug: 8, august: 8, août: 8, aout: 8, agosto: 8,
    sep: 9, sept: 9, september: 9, septembre: 9, settembre: 9,
    okt: 10, oct: 10, oktober: 10, october: 10, octobre: 10, ottobre: 10,
    nov: 11, november: 11, novembre: 11,
    dez: 12, dec: 12, dezember: 12, december: 12, décembre: 12, decembre: 12, dicembre: 12,
};
const MONATSMUSTER = Object.keys(MONATE).sort((a, b) => b.length - a.length).join('|');

const zwei = n => String(n).padStart(2, '0');

function gueltig(j, m, t) {
    const d = new Date(Date.UTC(j, m - 1, t));
    return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t;
}

// Liegt der Tag im Jahr j höchstens 120 Tage vor `von` (oder ist er `von`)?
function vorKurzem(j, m, t, von) {
    if (!gueltig(j, m, t)) return false;
    const abstand = (Date.parse(`${von}T00:00:00Z`) - Date.UTC(j, m - 1, t)) / 864e5;
    return abstand >= 0 && abstand <= 120;
}

/**
 * Liest Termine der Reihe nach und merkt sich dabei, welches Jahr gerade gilt.
 *
 * Ein Datum ohne Jahr ("16. Juli") bekommt das Jahr, das davor zuletzt auf
 * der Seite stand – "Salzburger Festspiele 2026", "Spielzeit 2026/27",
 * "Dezember 2026". Erst wenn nirgends eines steht, wird das nächste
 * Vorkommen im Fenster genommen. Ohne diese Regel wurde aus dem vergangenen
 * Festspielsommer 2026 einer im Jahr 2027.
 *
 * @param {string} text
 * @param {{von: string, bis: string}} fenster  ISO-Daten, einschließlich
 * @param {object|null} kontext  Jahr aus vorangehendem Text: {jahr} oder {saison}
 * @returns {{termine: string[], kontext: object|null}}
 */
export function termineLesen(text, { von, bis }, kontext = null) {
    const jahrVon = Number(von.slice(0, 4));
    const jahrBis = Number(bis.slice(0, 4));
    const s = String(text || '');
    const funde = [];

    const datum = (index, ende, j, m, t) => funde.push({ index, ende, art: 'datum', j, m, t });
    for (const m of s.matchAll(/\b(20\d\d)-(\d\d)-(\d\d)/g)) datum(m.index, m.index + m[0].length, +m[1], +m[2], +m[3]);
    // 03.10.2026, 3.10.26, 03.10. – das Jahr darf keine Uhrzeit sein: in
    // "11.10. 18.00" ist 18 die Stunde.
    for (const m of s.matchAll(/(?<![\d.])(\d{1,2})\.\s?(\d{1,2})\.(?:\s?(20\d\d|\d\d)(?![\d]|[.:]\d))?(?![\d])/g)) {
        datum(m.index, m.index + m[0].length, m[3] ? +m[3] : 0, +m[2], +m[1]);
    }
    for (const m of s.matchAll(/(?<![\d/])(\d{1,2})\/(\d{1,2})\/(20\d\d)(?![\d])/g)) datum(m.index, m.index + m[0].length, +m[3], +m[2], +m[1]);
    // Das Jahr auch vor 2000: "am 14. Januar 1900 uraufgeführt" ist kein
    // 14. Januar ohne Jahr – sonst stünde die Uraufführung im Spielplan.
    const tagMonat = new RegExp(`(?<![\\d])(\\d{1,2})\\.?\\s*(${MONATSMUSTER})\\.?(?:\\s+(1[5-9]\\d\\d|20\\d\\d))?(?![a-zäöüéû])`, 'gi');
    for (const m of s.matchAll(tagMonat)) datum(m.index, m.index + m[0].length, m[3] ? +m[3] : 0, MONATE[m[2].toLowerCase()], +m[1]);
    const monatTag = new RegExp(`(?<![a-zäöüéû])(${MONATSMUSTER})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(1[5-9]\\d\\d|20\\d\\d))?(?![\\d])`, 'gi');
    for (const m of s.matchAll(monatTag)) datum(m.index, m.index + m[0].length, m[3] ? +m[3] : 0, MONATE[m[1].toLowerCase()], +m[2]);

    const inDatum = i => funde.some(f => f.art === 'datum' && i >= f.index && i < f.ende);
    // "2026/27", "2026/2027", "2026–27": eine Spielzeit
    for (const m of s.matchAll(/(?<![\d./-])(20\d\d)\s*[/–-]\s*(20)?(\d\d)(?![\d./-])/g)) {
        if (!inDatum(m.index)) funde.push({ index: m.index, ende: m.index + m[0].length, art: 'saison', saison: +m[1] });
    }
    // ein Jahr für sich
    for (const m of s.matchAll(/(?<![\d./-])(20\d\d)(?![\d./:-])/g)) {
        const j = +m[1];
        if (j < jahrVon - 1 || j > jahrBis + 1 || inDatum(m.index)) continue;
        if (funde.some(f => f.art === 'saison' && m.index >= f.index && m.index < f.ende)) continue;
        funde.push({ index: m.index, ende: m.index + m[0].length, art: 'jahr', jahr: j });
    }

    funde.sort((a, b) => a.index - b.index || (a.art === 'datum' ? 1 : -1));

    // Eine Spanne ("19.02.–24.03.2027", "von 29. September bis 25. Oktober",
    // "14. – 17. Mai") nennt nur Anfang und Ende einer Serie – oft die einer
    // anderen Produktion, die daneben beworben wird (Krefeld). Die einzelnen
    // Vorstellungen stehen auf der Seite ohnehin für sich.
    const daten = funde.filter(f => f.art === 'datum');
    daten.forEach((a, i) => {
        const b = daten[i + 1];
        if (b && b.index >= a.ende && /^\s*(?:[-–—]|bis)\s*(?:[a-zäöü]{2,10}\.?,?\s*)?$/i.test(s.slice(a.ende, b.index))) a.spanne = b.spanne = true;
        if (/(?<![\d.])\d{1,2}\.\s*[-–—]\s*$/.test(s.slice(Math.max(0, a.index - 8), a.index))) a.spanne = true;
    });
    const gefunden = new Set();
    const gesehen = new Set();
    for (const f of funde) {
        if (f.art === 'saison') { kontext = { saison: f.saison }; continue; }
        if (f.art === 'jahr') { kontext = { jahr: f.jahr }; continue; }
        const schluessel = `${f.index}:${f.j}:${f.m}:${f.t}`;
        if (gesehen.has(schluessel) || !(f.m >= 1 && f.m <= 12 && f.t >= 1 && f.t <= 31)) continue;
        gesehen.add(schluessel);
        let jahre;
        // Ein Tag ohne Jahr, der in diesem Jahr erst kurz zurückliegt, ist
        // vorbei: "13.9." am 22.9. ist nicht der 13.9. des nächsten Jahres.
        // Gilt nur, wo das Jahr geraten wird – eine genannte Spielzeit zählt.
        const kurzVorbei = !f.j && vorKurzem(jahrVon, f.m, f.t, von);
        if (f.j) jahre = [f.j < 100 ? 2000 + f.j : f.j];
        else if (kontext?.saison) jahre = [f.m >= 8 ? kontext.saison : kontext.saison + 1];
        // Nach einem vollen Datum geht die Liste chronologisch weiter: ein
        // kleinerer Monat gehört ins nächste Jahr ("3. Oktober 2026 · 1. März").
        // Eine alleinstehende Jahreszahl ("Festspiele 2026") kennt keinen
        // Monat und springt deshalb nie.
        else if (kontext?.jahr) {
            const springt = kontext.monat && f.m < kontext.monat;
            jahre = springt && kurzVorbei ? [] : [springt ? kontext.jahr + 1 : kontext.jahr];
        } else jahre = kurzVorbei ? [] : Array.from({ length: jahrBis - jahrVon + 1 }, (_, i) => jahrVon + i);
        for (const jj of jahre) {
            if (!gueltig(jj, f.m, f.t)) continue;
            const iso = `${jj}-${zwei(f.m)}-${zwei(f.t)}`;
            if (iso >= von && iso <= bis) { if (!f.spanne) gefunden.add(iso); break; }
        }
        // Ein Jahr weit außerhalb (die Uraufführung 1900) gibt keinen Kontext.
        const jahr = f.j < 100 ? 2000 + f.j : f.j;
        if (f.j && jahr >= jahrVon - 1 && jahr <= jahrBis + 1) kontext = { jahr, monat: f.m };
        else if (!f.j && jahre.length && kontext?.jahr && kontext.monat) kontext = { jahr: jahre[0], monat: f.m };
    }
    return { termine: [...gefunden].sort(), kontext };
}

const WOCHENTAG = 'montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|mo|di|mi|do|fr|sa|so|mon|tue|wed|thu|fri|sat|sun|lun|mar|mer|jeu|ven|sam|dim';
const MONATSNAME = ['', 'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const NUR_TAG = /^(\d{1,2})\.?$/;
const NUR_MONAT = new RegExp(`^(${MONATSMUSTER})\\.?(\\s+20\\d\\d)?$`, 'i');
const NUR_WOCHENTAG = new RegExp(`^(${WOCHENTAG})\\.?,?$`, 'i');
const WOCHENTAG_TAG = new RegExp(`^(${WOCHENTAG})\\.?,?\\s*(\\d{1,2})\\.?$`, 'i');
const VOLLES_DATUM = new RegExp(`(?<![\\d.])\\d{1,2}\\.\\s*(?:\\d{1,2}\\.|(?:${MONATSMUSTER})(?![a-zäöüéû]))`, 'i');
const MONATSKOPF = new RegExp(`^(${MONATSMUSTER})\\.?\\s*(20\\d\\d)$`, 'i');

/**
 * Zerlegt den Text in Zeilen und setzt Kalenderdaten zusammen, die über
 * mehrere Zeilen verteilt sind:
 *   "23" / "September"               (Detmold)
 *   "Okt 2026" … "So4" / "Mi14"       (Stuttgart, Seite einer Produktion)
 *   "OKT 2026" … "Fr" / "2"           (Stuttgart, Monatskalender)
 *   "November 2026" / "07" / "Samstag" (Dortmund)
 * Ein Tag steht nur dann für ein Datum, wenn ein Monat direkt folgt oder
 * ein Wochentag davor steht und ein Monatskopf gilt – sonst sind Zahlen
 * allein alles Mögliche.
 */
export function zeilenOrdnen(text) {
    return ordnen(text).zeilen;
}

// Wie zeilenOrdnen(), dazu die Zeilen, die aus Monatskopf, Wochentag und Tag
// zusammengesetzt sind. Solche Leisten nennen die Vorstellungen einer
// Produktion auch ohne Uhrzeit (Frankfurt). Mehr als 20 unter einem Kopf
// sind aber ein ganzes Monatsraster und zählen nicht.
function ordnen(text) {
    // Weiche Trennstriche weg: "PROBEN\u00adBESUCHE" soll "Probenbesuche" heißen.
    const roh = String(text || '').replace(/\u00ad/g, '').split(/\n+/).map(z => z.trim()).filter(Boolean);
    const aus = [];
    const kalender = new Set();
    let kopf = null;
    let unterKopf = [];
    const kopfEnde = () => { if (unterKopf.length <= 20) unterKopf.forEach(i => kalender.add(i)); unterKopf = []; };
    const ausKopf = zeile => { unterKopf.push(aus.length); aus.push(zeile); };
    for (let i = 0; i < roh.length; i++) {
        const z = roh[i];
        const n = roh[i + 1] || '';
        let m;
        if ((m = z.match(MONATSKOPF))) { kopfEnde(); kopf = `${MONATSNAME[MONATE[m[1].toLowerCase()]]} ${m[2]}`; aus.push(z); continue; }
        if (NUR_TAG.test(z) && NUR_MONAT.test(n)) { aus.push(`${z.match(NUR_TAG)[1]}. ${n}`); i++; continue; }
        if (NUR_MONAT.test(z) && NUR_TAG.test(n)) { aus.push(`${n.match(NUR_TAG)[1]}. ${z}`); i++; continue; }
        // Steht das volle Datum gleich darunter, gilt das – der Monatskopf
        // kann dort schon der vorige sein. Semperoper: "Oktober 2026" …
        // "06" / "Fr" / "6. November 2026, 19 Uhr" wurde sonst der 6. Oktober.
        if (kopf && NUR_TAG.test(z) && NUR_WOCHENTAG.test(n) && !VOLLES_DATUM.test(roh[i + 2] || '')) { ausKopf(`${z.match(NUR_TAG)[1]}. ${kopf}`); continue; }
        if (kopf && (m = z.match(WOCHENTAG_TAG)) && !VOLLES_DATUM.test(n)) { ausKopf(`${m[1]} ${m[2]}. ${kopf}`); continue; }
        if (kopf && NUR_WOCHENTAG.test(z) && NUR_TAG.test(n) && !VOLLES_DATUM.test(roh[i + 2] || '')) { ausKopf(`${z} ${n.match(NUR_TAG)[1]}. ${kopf}`); i++; continue; }
        aus.push(z);
    }
    kopfEnde();
    return { zeilen: aus, kalender };
}

// Eine Zeile nur aus Daten und Wochentagen: "So 4.10.26 Fr 9.10.26 Fr 16.10.26"
// (Deutsche Oper Berlin) – die Leiste der Vorstellungen einer Produktion.
const OHNE_DATEN = new RegExp(`\\b(${MONATSMUSTER}|${WOCHENTAG})\\b|[\\d\\s.,·|/–—-]`, 'gi');
const nurDaten = z => z.replace(OHNE_DATEN, '').length === 0;

// Zeilen mit einem Datum, das kein Opernabend ist: Matinee, Vorverkauf,
// Führung, Rabattaktion, die Uraufführung vor 150 Jahren.
// Foyer, Probebühne und Treffpunkt als Ort: Führung, Workshop, Probenbesuch
// (Hamburg: "10. Dezember 2026, 9:15 – 11:45 · Eingangsfoyer").
const NEBEN_ZEILE = /foyer|probebühne|treffpunkt|absacker|probenbesuch|einführungsgespräch|click in|matin[ée]e|vorverkauf|freiverkauf|vorbestell|kartenverkauf|(tickets?|karten)\b.{0,40}\bab\b|uraufgeführt|preisvorteil|rabatt|literaturkino|(?<!ein)(?<!auf)führung|probe\b|soir[ée]e|gespräch/i;

// Eine Zeile, die nur sagt, was für ein Anlass es ist: "Einführung",
// "Einführungssoiree" (St. Gallen), "EINFÜHRUNGS-MATINEE" (Klagenfurt),
// "Verkaufsstart V-Club" (Volksoper), "MATINEE ZU …" (Essen). Nicht "Vorverkauf über …": das steht in
// Augsburg unter jeder Vorstellung.
const ORT_NEBENHER = /treffpunkt|probebühne|probenbesuch|click in|absacker/i;
const NUR_NEBENHER = /^(\S*einführung\S*|\S*matin[ée]e\S*|\S*soir[ée]e\S*|führung|öffentliche probe|generalprobe|\S*gespräch|workshop|verkaufsstart.*)$|^(matin[ée]e|öffentliche[rs]? probe|probenbesuch)/i;

const EINDEUTIG_NEBENHER = /^(einführungsgespräch|\S*matin[ée]e\S*|\S*soir[ée]e\S*|führung|öffentliche[rs]? probe.*|probenbesuch.*|generalprobe|workshop|verkaufsstart.*)$|^(matin[ée]e|öffentliche[rs]? probe|probenbesuch)/i;

// Die Zeilen eines Eintrags: ab dem Datum bis vor das nächste Datum.
function eintrag(zeilen, i, fenster, kontext, hoechstens) {
    const teile = [zeilen[i]];
    for (let j = i + 1; j < zeilen.length && teile.length <= hoechstens; j++) {
        if (termineLesen(zeilen[j], fenster, kontext).termine.length) break;
        teile.push(zeilen[j]);
    }
    return teile;
}

function ortPasst(zeilen, i, fenster, kontext, ort) {
    return !ort || new RegExp(ort, 'i').test(eintrag(zeilen, i, fenster, kontext, 8).join(' '));
}

/**
 * Alle Termine im Text, Zeile für Zeile, ohne Nebenveranstaltungen.
 *
 * @param {string} text
 * @param {{von: string, bis: string}} fenster  ISO-Daten, einschließlich
 * @param {{ort?: string}} [optionen]  ort: nur Termine, in deren Eintrag
 *   dieser Ort steht (Häuser mit vielen Gastspielen, etwa Detmold)
 * @returns {string[]} sortierte ISO-Daten ohne Doppelte
 */
export function termineAusText(text, fenster, { ort } = {}) {
    const zeilen = zeilenOrdnen(text);
    const gefunden = new Set();
    let kontext = null;
    zeilen.forEach((z, i) => {
        const vorher = kontext;
        const erg = termineLesen(z, fenster, kontext);
        kontext = erg.kontext;
        if (!erg.termine.length || NEBEN_ZEILE.test(`${z} ${zeilen[i + 1] || ''}`)) return;
        if (!ortPasst(zeilen, i, fenster, vorher, ort)) return;
        erg.termine.forEach(d => gefunden.add(d));
    });
    return [...gefunden].sort();
}

const UHRZEIT = /(?<![\d.])([01]?\d|2[0-3])[:.][0-5]\d(?![\d.])(?:\s*uhr)?|\b\d{1,2}\s*uhr\b|\b\d{1,2}[:h]\d{2}\b/i;

/**
 * Nur Termine, neben denen eine Uhrzeit steht. Vorstellungen stehen so gut
 * wie immer mit Beginn da; Daten ohne Uhrzeit sind dagegen oft etwas
 * anderes: "Vorverkauf ab", "heute", der Kalender am Seitenrand.
 *
 * Die Uhrzeit steht in derselben Zeile oder in einer der drei folgenden
 * ("11 Nov. 2026" / "MI" / "18:45", "30. Januar 2027" / "Premiere" /
 * "Passau - Stadttheater" / "19:30 Uhr") – aber nie hinter dem nächsten
 * Datum, dort beginnt der nächste Eintrag. Steht in einer der zwei Zeilen
 * darunter nur "Einführung", "Matinee" oder "Verkaufsstart", ist der Eintrag
 * keine Vorstellung.
 *
 * Ohne Uhrzeit zählen nur Leisten: mehrere Daten in einer Zeile und sonst
 * nichts, oder Tage unter einem Monatskopf (siehe ordnen()).
 *
 * @param {{ort?: string}} [optionen]  wie bei termineAusText()
 */
export function termineMitUhrzeit(text, fenster, optionen = {}) {
    return termineMitZeiten(text, fenster, optionen).termine;
}

// Ein Datum wie "19.10." ist keine Uhrzeit 19:10.
const DATUM_KURZ = /(?<![\d.])\d{1,2}\.\s?\d{1,2}\.(?:\s?(20\d\d|\d\d)(?![\d]|[.:]\d))?/g;
const ZEIT_ALLE = /(?<![\d.:])([01]?\d|2[0-3])(?:[:.h]([0-5]\d)(?![\d.])(?:\s*uhr)?|\s*uhr\b)/gi;
const EINFUEHRUNG = /einführung|einlass/i;

/**
 * Beginn (und, wo angegeben, Ende) einer Vorstellung aus den Zeilen ihres
 * Eintrags: die erste Uhrzeit, die nicht die der Einführung ist.
 *   "19:30 – 22:30"                      → "19:30-22:30"
 *   "Opernhaus 19:30 Uhr … Einführung: 18:45 Uhr" → "19:30"
 *   "17:15" / "Einführung im Foyer" / "18:00" → "18:00"  (Stuttgart)
 * @returns {string|null} "HH:MM" oder "HH:MM-HH:MM"
 */
export function beginnFinden(teile) {
    for (let i = 0; i < teile.length; i++) {
        const zeile = teile[i].replace(DATUM_KURZ, m => ' '.repeat(m.length));
        for (const m of zeile.matchAll(ZEIT_ALLE)) {
            const davor = zeile.slice(Math.max(0, m.index - 20), m.index);
            const danach = zeile.slice(m.index + m[0].length);
            const allein = !zeile.replace(m[0], '').trim();
            if (/(einführung|einlass)\W{0,3}$/i.test(davor) || /^\W{0,4}\S*(einführung|einlass)/i.test(danach)
                || (allein && EINFUEHRUNG.test((teile[i + 1] || '').split(/\s+/)[0] || ''))) continue;
            // "9.15 p.m." (Bregenz, englische Seite)
            const nachmittag = /^\s*p\.?\s?m\b/i.test(danach) && Number(m[1]) < 12;
            const hh = String(Number(m[1]) + (nachmittag ? 12 : 0)).padStart(2, '0');
            const beginn = `${hh}:${m[2] || '00'}`;
            const ende = danach.match(/^\s*(?:uhr)?\s*(?:[-–—]|bis(?:\s+ca\.)?)\s*([01]?\d|2[0-3])[:.]([0-5]\d)/i);
            return ende ? `${beginn}-${ende[1].padStart(2, '0')}:${ende[2]}` : beginn;
        }
    }
    return null;
}

/**
 * Wie termineMitUhrzeit(), dazu je Termin die Zeit, wo sie eindeutig ist –
 * nur bei einem Datum je Zeile. Eine Leiste ("So 4.10.26 Fr 9.10.26") hat
 * keine Zeiten.
 * @returns {{termine: string[], zeiten: Object<string, string>}}
 */
export function termineMitZeiten(text, fenster, { ort } = {}) {
    const { zeilen, kalender } = ordnen(text);
    const gefunden = new Set();
    const zeiten = {};
    // Das Jahr aus den Zeilen davor gilt weiter – siehe termineLesen().
    let kontext = null;
    zeilen.forEach((z, i) => {
        const vorher = kontext;
        const erg = termineLesen(z, fenster, kontext);
        kontext = erg.kontext;
        const daten = erg.termine;
        if (!daten.length || NEBEN_ZEILE.test(z)) return;
        const teile = eintrag(zeilen, i, fenster, vorher, 3);
        // Der Anlass steht direkt darunter ("Einführung") oder eine Zeile tiefer
        // ("MATINEE ZU …" in Essen); dort zählt "Einführung" nicht, bei manchen
        // Häusern ist das nur ein Hinweis am Ende eines Eintrags. Ein Anlass
        // über dem Datum ist nicht zu deuten: in Ulm gehört er zum Datum
        // darunter, in Krefeld zum Eintrag davor – das bleibt der Durchsicht.
        if (NUR_NEBENHER.test(teile[1] || '') || EINDEUTIG_NEBENHER.test(teile[2] || '')) return;
        // Orte, an denen keine Vorstellung stattfindet, gelten im ganzen
        // Eintrag (Ulm: Datum, Wochentag, Uhrzeit, dann "Treffpunkt
        // Bühnenpforte"). "Foyer" nicht – dort steht oft nur die Einführung.
        if (teile.some(t => ORT_NEBENHER.test(t))) return;
        const umgebung = teile.join(' ');
        // Die Uhrzeit darf nicht Teil des Datums selbst sein ("19.10." ist kein 19:10).
        const ohneDaten = umgebung.replace(DATUM_KURZ, ' ');
        const leiste = kalender.has(i) || (daten.length >= 2 && nurDaten(z));
        if ((leiste || UHRZEIT.test(ohneDaten)) && ortPasst(zeilen, i, fenster, vorher, ort)) {
            daten.forEach(d => gefunden.add(d));
            if (daten.length === 1 && !(daten[0] in zeiten)) {
                const zeit = beginnFinden(teile);
                if (zeit) zeiten[daten[0]] = zeit;
            }
        }
    });
    return { termine: [...gefunden].sort(), zeiten };
}
