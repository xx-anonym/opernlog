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
    jan: 1, januar: 1, jänner: 1, jän: 1, january: 1, janvier: 1, janv: 1, gennaio: 1,
    feb: 2, februar: 2, feber: 2, february: 2, février: 2, fevrier: 2, févr: 2, fevr: 2, fév: 2, febbraio: 2,
    mär: 3, mrz: 3, märz: 3, maerz: 3, mar: 3, march: 3, mars: 3, marzo: 3,
    apr: 4, april: 4, avril: 4, avr: 4, aprile: 4,
    mai: 5, may: 5, maggio: 5,
    jun: 6, juni: 6, june: 6, juin: 6, giugno: 6,
    jul: 7, juli: 7, july: 7, juillet: 7, juil: 7, luglio: 7,
    aug: 8, august: 8, août: 8, aout: 8, agosto: 8,
    sep: 9, sept: 9, september: 9, septembre: 9, settembre: 9,
    okt: 10, oct: 10, oktober: 10, october: 10, octobre: 10, ottobre: 10,
    nov: 11, november: 11, novembre: 11,
    dez: 12, dec: 12, déc: 12, dezember: 12, december: 12, décembre: 12, decembre: 12, dicembre: 12,
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
 * @param {{nurMitJahr?: boolean}} [o]  nur Daten, die ihr Jahr selbst nennen
 * @returns {{termine: string[], kontext: object|null}}
 */
export function termineLesen(text, { von, bis }, kontext = null, { nurMitJahr = false } = {}) {
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
    // 02/10/2026 und 02/10/26 (Lübeck: "Fr 02/10/26 · 19.30 Uhr")
    for (const m of s.matchAll(/(?<![\d/])(\d{1,2})\/(\d{1,2})\/(20\d\d|\d\d)(?![\d/])/g)) datum(m.index, m.index + m[0].length, +m[3], +m[2], +m[1]);
    // Das Jahr auch vor 2000: "am 14. Januar 1900 uraufgeführt" ist kein
    // 14. Januar ohne Jahr – sonst stünde die Uraufführung im Spielplan.
    const tagMonat = new RegExp(`(?<![\\d])(\\d{1,2})\\.?\\s*(${MONATSMUSTER})\\.?(?:\\s+(1[5-9]\\d\\d|20\\d\\d))?(?![a-zäöüéû])`, 'gi');
    for (const m of s.matchAll(tagMonat)) datum(m.index, m.index + m[0].length, m[3] ? +m[3] : 0, MONATE[m[2].toLowerCase()], +m[1]);
    // Eine Aufzählung vor dem Monat: "Thu 22, Fr 23, Sat 24. Sun 25., …
    // and Sat 31 July" (Bregenz), "15, 17, 18 et 31 décembre 2026" (Genf).
    // Jeder Tag davor gehört in denselben Monat – aber nur, wenn die Tage
    // aufsteigen; sonst ist es keine Aufzählung.
    const kette = new RegExp(`(?<![\\d.:])(?:(?:(?:${WOCHENTAG})\\.?,?\\s*)?\\d{1,2}\\.?\\s*(?:,|\\.|and|und|et|&)\\s*)+(?:(?:${WOCHENTAG})\\.?,?\\s*)?$`, 'i');
    for (const m of s.matchAll(tagMonat)) {
        const k = s.slice(Math.max(0, m.index - 300), m.index).match(kette);
        if (!k) continue;
        const start = m.index - k[0].length;
        const tage = [...k[0].matchAll(/(?<!\d)(\d{1,2})(?!\d)/g)].map(x => ({ t: +x[1], i: start + x.index }));
        if (!tage.length || tage.some((x, i) => x.t >= (tage[i + 1]?.t ?? +m[1]))) continue;
        for (const x of tage) datum(x.i, x.i + String(x.t).length, m[3] ? +m[3] : 0, MONATE[m[2].toLowerCase()], x.t);
    }
    const monatTag = new RegExp(`(?<![a-zäöüéû])(${MONATSMUSTER})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(1[5-9]\\d\\d|20\\d\\d))?(?![\\d])`, 'gi');
    // "Nov. 26" nach einem Tag ist das Jahr, nicht der 26. November:
    // Greifswald schreibt "1 / Nov. 26". Ein Monat, der schon zu einem
    // Datum davor gehört, beginnt kein neues.
    const tagDavor = i => funde.some(f => f.art === 'datum' && i > f.index && i < f.ende);
    // Folgt auf den Tag ein Monat, war das Wort davor ein Wochentag: Genf
    // schreibt "MAR. 15 DÉC." – mardi, nicht der 15. März.
    const monatDanach = new RegExp(`^\\.?\\s*(${MONATSMUSTER})(?![a-zäöüéû])`, 'i');
    for (const m of s.matchAll(monatTag)) {
        if (tagDavor(m.index) || (!m[3] && monatDanach.test(s.slice(m.index + m[0].length)))) continue;
        datum(m.index, m.index + m[0].length, m[3] ? +m[3] : 0, MONATE[m[1].toLowerCase()], +m[2]);
    }

    const inDatum = i => funde.some(f => f.art === 'datum' && i >= f.index && i < f.ende);
    // "2026/27", "2026/2027", "2026–27": eine Spielzeit
    for (const m of s.matchAll(/(?<![\d./-])(20\d\d)\s*[/–-]\s*(20)?(\d\d)(?![\d./-])/g)) {
        if (!inDatum(m.index)) funde.push({ index: m.index, ende: m.index + m[0].length, art: 'saison', saison: +m[1] });
    }
    // ein Jahr für sich
    const monatVorJahr = new RegExp(`(?<![a-zäöüéû])(${MONATSMUSTER})\\.?\\s*$`, 'i');
    for (const m of s.matchAll(/(?<![\d./-])(20\d\d)(?![\d./:-])/g)) {
        const j = +m[1];
        if (j < jahrVon - 1 || j > jahrBis + 1 || inDatum(m.index)) continue;
        if (funde.some(f => f.art === 'saison' && m.index >= f.index && m.index < f.ende)) continue;
        // "November 2026": ein Monat ohne Tag
        const monat = s.slice(Math.max(0, m.index - 14), m.index).match(monatVorJahr);
        funde.push({ index: m.index, ende: m.index + m[0].length, art: 'jahr', jahr: j, monat: monat ? MONATE[monat[1].toLowerCase()] : undefined });
    }

    funde.sort((a, b) => a.index - b.index || (a.art === 'datum' ? 1 : -1));

    // Eine Spanne ("19.02.–24.03.2027", "von 29. September bis 25. Oktober",
    // "14. – 17. Mai") nennt nur Anfang und Ende einer Serie – oft die einer
    // anderen Produktion, die daneben beworben wird (Krefeld). Die einzelnen
    // Vorstellungen stehen auf der Seite ohnehin für sich.
    const daten = funde.filter(f => f.art === 'datum');
    daten.forEach((a, i) => {
        const b = daten[i + 1];
        if (b && b.index >= a.ende && /^\s*(?:[-–—]|bis)\s*(?:[a-zäöü]{2,10}\.?,?\s*)?$/i.test(s.slice(a.ende, b.index))) {
            a.spanne = b.spanne = true;
            // Nennt der Anfang sein Jahr, geht es danach von dort aus weiter:
            // Zürich schreibt "Von 20. September 2026 bis 23. April 2027",
            // darunter "20, 25 Sept. / 06, 18 … Okt." – nicht im Jahr 2027.
            if (a.j) b.ohneKontext = true;
        }
        if (/(?<![\d.])\d{1,2}\.\s*[-–—]\s*$/.test(s.slice(Math.max(0, a.index - 8), a.index))) a.spanne = true;
    });
    const gefunden = new Set();
    const gesehen = new Set();
    for (const f of funde) {
        if (f.art === 'saison') { kontext = { saison: f.saison }; continue; }
        if (f.art === 'jahr') {
            // Ein Monat vor dem, der gerade gilt, ist ein Hinweis, kein neuer
            // Abschnitt: Bregenz schreibt nach "22. Juli 2027" "Die Besetzung
            // wird im November 2026 bekannt gegeben" – danach fielen die
            // Julitermine ins Jahr 2026. Als Kopf ("Dezember 2026") gibt er
            // Jahr und Monat, damit "1.1." danach ins neue Jahr fällt.
            const frueher = f.monat && kontext?.jahr && kontext.monat && f.jahr * 12 + f.monat < kontext.jahr * 12 + kontext.monat;
            if (!frueher) kontext = f.monat ? { jahr: f.jahr, monat: f.monat } : { jahr: f.jahr };
            continue;
        }
        const schluessel = `${f.index}:${f.j}:${f.m}:${f.t}`;
        if (gesehen.has(schluessel) || !(f.m >= 1 && f.m <= 12 && f.t >= 1 && f.t <= 31) || (nurMitJahr && !f.j)) continue;
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
        if (f.ohneKontext) continue;
        if (f.j && jahr >= jahrVon - 1 && jahr <= jahrBis + 1) kontext = { jahr, monat: f.m };
        else if (!f.j && jahre.length && kontext?.jahr && kontext.monat) kontext = { jahr: jahre[0], monat: f.m };
    }
    return { termine: [...gefunden].sort(), kontext };
}

const WOCHENTAG = 'montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|mo|di|mi|do|fr|sa|so|mon|tue|wed|thu|fri|sat|sun|lun|mar|mer|jeu|ven|sam|dim';
const MONATSNAME = ['', 'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const NUR_TAG = /^(\d{1,2})\.?$/;
// Auch mit zweistelligem Jahr: Greifswald schreibt "15" / "Nov. 26".
const NUR_MONAT = new RegExp(`^(${MONATSMUSTER})\\.?(?:\\s+(?:20)?(\\d\\d))?$`, 'i');
const tagUndMonat = (tag, monat) => { const m = monat.match(NUR_MONAT); return `${tag}. ${m[1]}${m[2] ? ` 20${m[2]}` : ''}`; };
const NUR_WOCHENTAG = new RegExp(`^(${WOCHENTAG})\\.?,?$`, 'i');
const WOCHENTAG_TAG = new RegExp(`^(${WOCHENTAG})\\.?,?\\s*(\\d{1,2})\\.?$`, 'i');
const VOLLES_DATUM = new RegExp(`(?<![\\d.])\\d{1,2}\\.\\s*(?:\\d{1,2}\\.|(?:${MONATSMUSTER})(?![a-zäöüéû]))`, 'i');
const MONATSKOPF = new RegExp(`^(${MONATSMUSTER})\\.?\\s*(20\\d\\d)$`, 'i');
// "8 Fr" – Tag vor Wochentag in einer Zeile (Mainz, unter dem Monat der Seite)
const TAG_WOCHENTAG = new RegExp(`^(\\d{1,2})\\.?\\s+(${WOCHENTAG})\\.?,?$`, 'i');

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
        if (NUR_TAG.test(z) && NUR_MONAT.test(n)) { aus.push(tagUndMonat(z.match(NUR_TAG)[1], n)); i++; continue; }
        if (NUR_MONAT.test(z) && NUR_TAG.test(n)) { aus.push(tagUndMonat(n.match(NUR_TAG)[1], z)); i++; continue; }
        // Steht das volle Datum gleich darunter, gilt das – der Monatskopf
        // kann dort schon der vorige sein. Semperoper: "Oktober 2026" …
        // "06" / "Fr" / "6. November 2026, 19 Uhr" wurde sonst der 6. Oktober.
        if (kopf && NUR_TAG.test(z) && NUR_WOCHENTAG.test(n) && !VOLLES_DATUM.test(roh[i + 2] || '')) { ausKopf(`${z.match(NUR_TAG)[1]}. ${kopf}`); continue; }
        if (kopf && (m = z.match(WOCHENTAG_TAG)) && !VOLLES_DATUM.test(n)) { ausKopf(`${m[1]} ${m[2]}. ${kopf}`); continue; }
        if (kopf && (m = z.match(TAG_WOCHENTAG)) && !VOLLES_DATUM.test(n)) { ausKopf(`${m[2]} ${m[1]}. ${kopf}`); continue; }
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
// "Uraufführung am …" und "Premiere dieser Inszenierung" stehen in Chroniken
// (Hamburg), ihr Jahr in einer eigenen Zeile davor – zu alt, um zu zählen.
const NEBEN_ZEILE = /foyer|probebühne|treffpunkt|absacker|probenbesuch|einführungsgespräch|click in|matin[ée]e|vorverkauf|freiverkauf|vorbestell|kartenverkauf|(tickets?|karten)\b.{0,40}\bab\b|uraufgeführt|uraufführung am|premiere dieser inszenierung|preisvorteil|rabatt|literaturkino|(?<!ein)(?<!auf)führung|probe\b|soir[ée]e|gespräch/i;

// Eine Zeile, die nur sagt, was für ein Anlass es ist: "Einführung",
// "Einführungssoiree" (St. Gallen), "EINFÜHRUNGS-MATINEE" (Klagenfurt),
// "Verkaufsstart V-Club" (Volksoper), "MATINEE ZU …" (Essen). Nicht "Vorverkauf über …": das steht in
// Augsburg unter jeder Vorstellung.
// Deutsche Oper am Rhein: "Opernwerkstatt Oper" drei Zeilen unter dem Datum.
const ORT_NEBENHER = /treffpunkt|probebühne|probenbesuch|click in|absacker|opernwerkstatt/i;
// Abgesagt: Greifswald lässt den Termin stehen und schreibt "So entfällt 18:00".
const ABGESAGT = /\b(entfällt|abgesagt|fällt aus)\b/i;
const NUR_NEBENHER = /^(\S*einführung\S*|\S*matin[ée]e\S*|\S*soir[ée]e\S*|führung|öffentliche probe|generalprobe|\S*gespräch|workshop|verkaufsstart.*)$|^(kostprobe|matin[ée]e|öffentliche[rs]? probe|probenbesuch)/i;

const EINDEUTIG_NEBENHER = /^(einführungsgespräch|\S*matin[ée]e\S*|\S*soir[ée]e\S*|führung|öffentliche[rs]? probe.*|probenbesuch.*|generalprobe|workshop|verkaufsstart.*)$|^(kostprobe|matin[ée]e|öffentliche[rs]? probe|probenbesuch)/i;

// "Verkaufsstart:" über einem Datum: das ist der Beginn des Vorverkaufs,
// keine Vorstellung (Volksoper Wien: "Do / 12. November 2026 /
// Verkaufsstart: / 01.10.2026 10:00 / 19:00 - 20:45").
const VERKAUF_DAVOR = /^(verkaufsstart|vorverkaufs?(start|beginn)?|vorverkauf ab|kartenverkauf|buchbar ab)\s*:?\s*$/i;

// Die Zeilen eines Eintrags: ab dem Datum bis vor das nächste Datum. Ein
// Verkaufsstart darin zählt nicht – weder als Anlass noch als Datum.
// Zeilen ohne eigenen Inhalt: nur ein Wochentag, eine Tageszahl oder ein
// Trennzeichen. Köln schreibt unter jedes Datum "SO" / "/" / "13"; zählten
// sie mit, lag die Uhrzeit außer Reichweite.
const FUELLZEILE = new RegExp(`^([/|·–—-]|\\d{1,2}\\.?|(${WOCHENTAG})\\.?)$`, 'i');

function eintrag(zeilen, i, fenster, kontext, hoechstens) {
    const teile = [zeilen[i]];
    let gezaehlt = 0;
    for (let j = i + 1; j < zeilen.length && gezaehlt < hoechstens; j++) {
        if (VERKAUF_DAVOR.test(zeilen[j])) { j++; continue; }
        if (termineLesen(zeilen[j], fenster, kontext).termine.length) break;
        teile.push(zeilen[j]);
        if (!FUELLZEILE.test(zeilen[j])) gezaehlt++;
    }
    return teile;
}

/**
 * Steht dasselbe Datum im Eintrag gleich darunter mit einem anderen Jahr,
 * war das geratene Jahr falsch. Leipzig zeigt jede Vorstellung als Kachel
 * ohne Jahr ("SA. / 12 / SEPT.") und darunter mit Jahr ("Sa. 12.09.2026");
 * vergangene Vorstellungen hängt es ans Ende der Liste, und die Kachel erbte
 * das Jahr des Eintrags davor – ein Holländer im September 2027.
 */
function jahrWiderspricht(iso, teile) {
    const [j, m, t] = iso.split('-').map(Number);
    const rest = teile.slice(1).join('\n');
    const muster = [
        new RegExp(`(?<![\\d.])0?${t}\\.\\s?0?${m}\\.\\s?(20\\d\\d)(?!\\d)`, 'g'),
        new RegExp(`(20\\d\\d)-${zwei(m)}-${zwei(t)}`, 'g'),
    ];
    return muster.some(re => [...rest.matchAll(re)].some(x => Number(x[1]) !== j));
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
/**
 * Die Spielzeit, die eine Adresse nennt: ".../spielzeit-2627/fidelio",
 * ".../la-traviata-2026-2027/", "saison-26-27". Tage ohne Jahr gehören dann
 * in diese Spielzeit – August bis Dezember ins erste Jahr, der Rest ins
 * zweite. Ohne sie galt "SA 12.6." in Oldenburg Ende September als vorbei.
 * @returns {number|null} das erste Jahr der Spielzeit
 */
export function saisonAusAdresse(url) {
    const pfad = String(url || '').split(/[?#]/)[0];
    const lang = pfad.match(/(?<!\d)(20\d\d)[-_/](20\d\d)(?!\d)/);
    if (lang && +lang[2] === +lang[1] + 1) return +lang[1];
    const kurz = pfad.match(/(?:spielzeit|saison|season)[-_/]?(?:20)?(\d\d)[-_/]?(?:20)?(\d\d)(?!\d)/i);
    if (kurz && +kurz[2] === +kurz[1] + 1) return 2000 + +kurz[1];
    return null;
}

export function termineAusText(text, fenster, { ort, saison } = {}) {
    const zeilen = zeilenOrdnen(text);
    const gefunden = new Set();
    let kontext = saison ? { saison } : null;
    zeilen.forEach((z, i) => {
        const vorher = kontext;
        const erg = termineLesen(z, fenster, kontext);
        kontext = erg.kontext;
        if (!erg.termine.length || NEBEN_ZEILE.test(`${z} ${zeilen[i + 1] || ''}`)) return;
        if (!ortPasst(zeilen, i, fenster, vorher, ort)) return;
        const teile = eintrag(zeilen, i, fenster, vorher, 3);
        if (ABGESAGT.test(teile.slice(0, 2).join(' '))) return;
        erg.termine.filter(d => !jahrWiderspricht(d, teile)).forEach(d => gefunden.add(d));
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
const AUFZAEHLUNG = /(?<![\d.:])\d{1,2}\.?\s*(?:,|and|und|et|&)\s*(?:[a-zé]{2,9}\.?,?\s*)?\d{1,2}(?![\d.:]\d)/i;

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
        const zeit = zeitInZeile(teile, i);
        if (zeit) return zeit;
    }
    return null;
}

const minuten = hhmm => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** Wie beginnFinden(), aber nur in Zeile i – die folgende zählt nur als Hinweis auf eine Einführung. */
function zeitInZeile(teile, i) {
    const zeile = teile[i].replace(DATUM_KURZ, m => ' '.repeat(m.length));
    let weiterAb = 0;
    for (const m of zeile.matchAll(ZEIT_ALLE)) {
        if (m.index < weiterAb) continue;
        const davor = zeile.slice(Math.max(0, m.index - 20), m.index);
        const danach = zeile.slice(m.index + m[0].length);
        const allein = !zeile.replace(m[0], '').trim();
        if (/(einführung|einlass)\W{0,3}$/i.test(davor) || /^\W{0,4}\S*(einführung|einlass)/i.test(danach)
            || (allein && EINFUEHRUNG.test((teile[i + 1] || '').split(/\s+/)[0] || ''))) continue;
        // "9.15 p.m." (Bregenz, englische Seite)
        const nachmittag = /^\s*p\.?\s?m\b/i.test(danach) && Number(m[1]) < 12;
        const hh = String(Number(m[1]) + (nachmittag ? 12 : 0)).padStart(2, '0');
        const beginn = `${hh}:${m[2] || '00'}`;
        const ende = danach.match(/^\s*(?:uhr)?\s*(?:[-–—]|bis(?:\s+ca\.)?)\s*([01]?\d|2[0-3])[:.]([0-5]\d)(\s*(?:uhr)?\s*\S*)/i);
        const bis = ende && `${ende[1].padStart(2, '0')}:${ende[2]}`;
        // Ein Ende liegt nach dem Beginn und ist keine Einführung: Gießen
        // schreibt "19:30 Uhr - 19:00 EINFÜHRUNG".
        if (!bis || bis <= beginn || EINFUEHRUNG.test(ende[3])) return beginn;
        // Eine Viertelstunde ist keine Vorstellung, sondern die Einführung
        // davor: Deutsche Oper am Rhein, "Foyer 18:00 - 18:15" über "18:30 - 21:00".
        if (minuten(bis) - minuten(beginn) <= 30) { weiterAb = m.index + m[0].length + ende[0].length; continue; }
        return `${beginn}-${bis}`;
    }
    return null;
}

/**
 * Wie termineMitUhrzeit(), dazu je Termin die Zeit, wo sie eindeutig ist –
 * nur bei einem Datum je Zeile. Eine Leiste ("So 4.10.26 Fr 9.10.26") hat
 * keine Zeiten. Dazu die Daten, deren Einträge abgesagt sind ("Entfällt").
 * @returns {{termine: string[], zeiten: Object<string, string>, abgesagt: string[]}}
 */
export function termineMitZeiten(text, fenster, { ort, saison } = {}) {
    const { zeilen, kalender } = ordnen(text);
    const gefunden = new Set();
    const abgesagt = new Set();
    const zeiten = {};
    // Das Jahr aus den Zeilen davor gilt weiter – siehe termineLesen().
    let kontext = saison ? { saison } : null;
    zeilen.forEach((z, i) => {
        const vorher = kontext;
        const erg = termineLesen(z, fenster, kontext);
        kontext = erg.kontext;
        if (!erg.termine.length || NEBEN_ZEILE.test(z) || VERKAUF_DAVOR.test(zeilen[i - 1] || '')) return;
        const teile = eintrag(zeilen, i, fenster, vorher, 3);
        const daten = erg.termine.filter(d => !jahrWiderspricht(d, teile));
        if (!daten.length) return;
        // Der Anlass steht direkt darunter ("Einführung") oder eine Zeile tiefer
        // ("MATINEE ZU …" in Essen); dort zählt "Einführung" nicht, bei manchen
        // Häusern ist das nur ein Hinweis am Ende eines Eintrags. Ein Anlass
        // über dem Datum ist nicht zu deuten: in Ulm gehört er zum Datum
        // darunter, in Krefeld zum Eintrag davor – das bleibt der Durchsicht.
        if (NUR_NEBENHER.test(teile[1] || '') || EINDEUTIG_NEBENHER.test(teile[2] || '')) return;
        // Orte, an denen keine Vorstellung stattfindet, gelten im ganzen
        // Eintrag (Ulm: Datum, Wochentag, Uhrzeit, dann "Treffpunkt
        // Bühnenpforte"). "Foyer" nicht – dort steht oft nur die Einführung.
        if (teile.some(t => ABGESAGT.test(t))) { daten.forEach(d => abgesagt.add(d)); return; }
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
            } else if (daten.length > 1 && AUFZAEHLUNG.test(z) && [...z.replace(DATUM_KURZ, ' ').matchAll(ZEIT_ALLE)].length === 1) {
                // "… and Sat 31 July – 9.15 p.m.": eine Uhrzeit für die ganze Aufzählung
                const zeit = beginnFinden([z]);
                if (zeit) daten.forEach(d => { if (!(d in zeiten)) zeiten[d] = zeit; });
            }
        }
    });
    return { termine: [...gefunden].sort(), zeiten, abgesagt: [...abgesagt].filter(d => !gefunden.has(d)).sort() };
}

const MONAT_IN_ADRESSE = /\/(januar|februar|maerz|märz|april|mai|juni|juli|august|september|oktober|november|dezember)\/?$/i;

/**
 * Der Monat, den eine Adresse nennt, als Kopfzeile für zeitenAusKalender():
 * Mainz hat Monatsseiten ".../uebersicht/januar" mit Tagen ohne Monat
 * ("8 Fr"). Das Jahr ergibt sich aus der Spielzeit des Fensters.
 * @returns {string|null} etwa "Januar 2027"
 */
export function monatAusAdresse(url, { von }) {
    const m = String(url || '').split(/[?#]/)[0].match(MONAT_IN_ADRESSE);
    if (!m) return null;
    const monat = MONATE[m[1].toLowerCase()];
    const beginn = Number(von.slice(0, 4)) - (Number(von.slice(5, 7)) >= 8 ? 0 : 1);
    return `${MONATSNAME[monat]} ${monat >= 8 ? beginn : beginn + 1}`;
}

const LD_ZEIT = /^(20\d\d-\d\d-\d\d)T([01]\d|2[0-3]):([0-5]\d)(?::\d\d(?:\.\d+)?)?([+-]\d\d:?\d\d)?$/;

/**
 * Uhrzeiten aus den strukturierten Termindaten einer Seite (schema.org Event
 * in ld+json). Zürich: "startDate": "2027-03-07T20:00", "endDate":
 * "2027-03-07T22:35" – im Text der Seite steht nur das Datum.
 *
 * Nur Ortszeit: eine Angabe in UTC ("…Z") müsste erst umgerechnet werden.
 * Mitternacht heißt meist "Uhrzeit unbekannt". Zwei verschiedene Anfänge am
 * selben Tag (Vorstellung und Matinee) lassen offen, welcher gilt – dann
 * keiner.
 *
 * @param {{start: string, ende?: string}[]} ereignisse
 * @param {{von: string, bis: string}} fenster
 * @returns {Object<string, string>} Datum -> "HH:MM" oder "HH:MM-HH:MM"
 */
export function zeitenAusLd(ereignisse, { von, bis }) {
    const je = new Map(); // Datum -> Set(Zeit)
    for (const { start, ende } of ereignisse || []) {
        const m = LD_ZEIT.exec(String(start || '').trim());
        if (!m || m[1] < von || m[1] > bis || (m[2] === '00' && m[3] === '00')) continue;
        const beginn = `${m[2]}:${m[3]}`;
        const e = LD_ZEIT.exec(String(ende || '').trim());
        const schluss = e && e[1] === m[1] && `${e[2]}:${e[3]}` > beginn ? `${e[2]}:${e[3]}` : null;
        if (!je.has(m[1])) je.set(m[1], new Map());
        const tag = je.get(m[1]);
        if (!tag.has(beginn) || (!tag.get(beginn) && schluss)) tag.set(beginn, schluss);
    }
    const aus = {};
    for (const [datum, tag] of je) {
        if (tag.size !== 1) continue;
        const [[beginn, schluss]] = tag;
        aus[datum] = schluss ? `${beginn}-${schluss}` : beginn;
    }
    return aus;
}

/**
 * Uhrzeiten aus einer Kalenderseite: Tageskopf, darunter Einträge mit
 * Uhrzeit und Titel. Deutsche Oper Berlin: "4.10." / "Oper" / "16:00" /
 * "Carmen"; Mainz: "11 So" / "14:15 Einführung" / "15:00-17:30 → Oper" /
 * "FALSTAFF". Die Seiten der Produktionen nennen dort nur die Daten.
 *
 * Liefert nur Uhrzeiten – welche Termine gelten, bestimmt weiter die Seite
 * der Produktion. Je Werk und Tag zählt der erste Eintrag: ein späteres
 * "Glam Night: nach Carmen" um 22:30 ändert nichts mehr.
 *
 * @param {string} text
 * @param {{von: string, bis: string}} fenster
 * @param {(zeile: string) => string[]} finde  Werk-Ids, die eine Zeile nennt
 * @param {{monatskopf?: string|null}} [o]  Monat der Seite, wo die Tage ihn nicht nennen
 * @returns {Map<string, Object<string, string>>} Werk -> {Datum: Uhrzeit}
 */
export function zeitenAusKalender(text, fenster, finde, { monatskopf = null } = {}) {
    const { zeilen } = ordnen(monatskopf ? `${monatskopf}\n${text}` : text);
    const aus = new Map();
    let kontext = null;
    let datum = null;
    let abschnitt = [];
    for (let i = 0; i < zeilen.length; i++) {
        const z = zeilen[i];
        // "Dezember 2026": Jahr und Monat, damit "1.1." danach ins neue Jahr
        // fällt – mit dem Jahr allein wurde es der vergangene 1.1.2026.
        const kopf = z.match(MONATSKOPF);
        if (kopf) { kontext = { jahr: Number(kopf[2]), monat: MONATE[kopf[1].toLowerCase()] }; datum = null; abschnitt = []; continue; }
        const erg = termineLesen(z, fenster, kontext);
        kontext = erg.kontext;
        const ids = finde(z);
        if (erg.termine.length > 1) { datum = null; abschnitt = []; continue; }   // eine Leiste, kein Kalender
        // Ein Tag, der sich nicht einordnen lässt, beendet den vorigen: sonst
        // hinge dessen Datum an allen folgenden Titeln.
        if (!erg.termine.length && VOLLES_DATUM.test(z) && !ids.length) { datum = null; abschnitt = []; continue; }
        if (erg.termine.length === 1) {
            datum = erg.termine[0];
            abschnitt = [];
            if (!ids.length) continue;
        }
        // "Werkstatt: Der fliegende Holländer", "Roundtable: …": ein Anlass
        // zum Werk, keine Vorstellung (Deutsche Oper Berlin, vormittags).
        const anlass = z.match(/^(.*?[a-zäöüß)]):\s/i);
        if (!datum || !ids.length || NEBEN_ZEILE.test(z) || /einführung/i.test(z) || (anlass && !finde(anlass[1]).length)) { abschnitt.push(z); continue; }
        // Die Uhrzeit, die dem Titel am nächsten steht: davor stehen oft
        // andere Einträge des Tages ("13:00 Führung", "14:00 Hamed & Sherifa").
        const teile = [...abschnitt, z];
        let zeit = null;
        for (let k = teile.length - 1; k >= 0 && !zeit; k--) zeit = zeitInZeile(teile, k);
        if (!zeit) {
            // Die Uhrzeit hinter dem Titel, bis zum nächsten Tag
            const danach = [];
            for (let j = i + 1; j < zeilen.length && danach.length < 2; j++) {
                if (termineLesen(zeilen[j], fenster, kontext).termine.length) break;
                danach.push(zeilen[j]);
            }
            zeit = beginnFinden(danach);
        }
        if (zeit && /^([01]\d|2[0-3]):[0-5]\d(-([01]\d|2[0-3]):[0-5]\d)?$/.test(zeit)) {
            for (const id of ids) {
                if (!aus.has(id)) aus.set(id, {});
                if (!aus.get(id)[datum]) aus.get(id)[datum] = zeit;
            }
        }
        abschnitt = [];
    }
    return aus;
}
