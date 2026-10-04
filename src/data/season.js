// Spielzeit und Saisonrückblick
//
// Eine Spielzeit läuft vom 1. August bis zum 31. Juli. Der 1. August als
// Grenze statt des 1. September hat einen praktischen Grund: die
// Sommerfestspiele – Bayreuth, München, Salzburg – liegen im Juli und August.
// Zöge die Grenze am 1. September, fiele der August in ein Loch zwischen zwei
// Spielzeiten. So gehört jeder Tag zu genau einer Saison, und der Rückblick am
// 31. Juli deckt lückenlos zwölf Monate ab.

import { operaHouses, distanceKm } from './operaHouses.js';
import { operas } from './operas.js';
import { visitCredits } from '../utils.js';
import { meistgehoerteStimmen } from './besetzung.js';

const SEASON_START_MONTH = 8;   // August, 1-basiert

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

const WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch',
    'Donnerstag', 'Freitag', 'Samstag'];

// Besuchsdaten stehen als 'JJJJ-MM-TT' in der Datenbank. new Date() darauf
// legt sie auf Mitternacht UTC, was je nach Zeitzone einen Tag zurückrutschen
// kann – am Saisonwechsel entscheidet das über die Zuordnung. Deshalb wird die
// Zeichenkette von Hand zerlegt.
function toDate(wert) {
    if (wert instanceof Date) return wert;
    const m = String(wert || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Das Anfangsjahr der Spielzeit, in die ein Datum fällt. */
export function seasonStartYear(wert) {
    const d = toDate(wert);
    if (!d) return null;
    return d.getMonth() + 1 >= SEASON_START_MONTH ? d.getFullYear() : d.getFullYear() - 1;
}

/** "2025/26" */
export function seasonLabel(startYear) {
    return `${startYear}/${String((startYear + 1) % 100).padStart(2, '0')}`;
}

/** Erster und letzter Tag einer Spielzeit. */
export function seasonRange(startYear) {
    return {
        from: new Date(startYear, SEASON_START_MONTH - 1, 1),
        to: new Date(startYear + 1, SEASON_START_MONTH - 1, 0),   // Tag 0 = letzter des Vormonats
    };
}

function gleicherTag(a, b) {
    return a.getFullYear() === b.getFullYear()
        && a.getMonth() === b.getMonth()
        && a.getDate() === b.getDate();
}

/**
 * Die zuletzt abgeschlossene Spielzeit.
 *
 * Am 31. Juli gilt die laufende bereits als abgeschlossen – genau an diesem
 * Tag erscheint der Rückblick, und er soll dann die Saison zeigen, die
 * gerade zu Ende geht, nicht die davor.
 */
export function lastCompletedSeasonStartYear(now = new Date()) {
    const laufend = seasonStartYear(now);
    return gleicherTag(now, seasonRange(laufend).to) ? laufend : laufend - 1;
}

/**
 * Zeitfenster, in dem der Rückblick von selbst auftaucht: vom 31. Juli bis
 * Ende August. Danach ist er nur noch über das Osterei erreichbar.
 */
export function isSeasonReviewWindow(now = new Date()) {
    const monat = now.getMonth() + 1;
    return (monat === 7 && now.getDate() === 31) || monat === 8;
}

/** Alle Besuche einer Spielzeit, aufsteigend nach Datum. */
export function visitsInSeason(visits, startYear) {
    return (visits || [])
        .filter(v => seasonStartYear(v.date) === startYear)
        .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

/**
 * Die laufende Spielzeit in vier Zahlen – für den Kopf des Feeds.
 *
 * Dort stand vorher, wie viele Häuser und Werke der Katalog kennt. Das ändert
 * sich nie und sagt über den Nutzer nichts; diese vier Zahlen wachsen mit ihm.
 *
 * Besuche ohne Bewertung zählen als Abend mit, aber nicht im Schnitt – sonst
 * zöge eine fehlende Note den Durchschnitt nach unten, als wäre sie eine Null.
 *
 * @param {Array}  visits    eigene Besuche
 * @param {number} startYear Anfangsjahr der Spielzeit
 * @returns {{abende: number, haeuser: number, werke: number, schnitt: number|null}}
 */
export function seasonSummary(visits, startYear) {
    const besuche = visitsInSeason(visits, startYear);
    const noten = besuche
        .map(v => Number(v.rating))
        .filter(n => Number.isFinite(n) && n > 0);

    return {
        abende: besuche.length,
        haeuser: new Set(besuche.map(v => v.houseId ?? v.house_id).filter(Boolean)).size,
        werke: new Set(besuche.map(v => v.operaId ?? v.opera_id).filter(Boolean)).size,
        schnitt: noten.length ? noten.reduce((s, n) => s + n, 0) / noten.length : null,
    };
}

/** Spielzeiten mit mindestens einem Besuch, jüngste zuerst. */
export function seasonsWithVisits(visits) {
    const jahre = new Set();
    (visits || []).forEach(v => {
        const j = seasonStartYear(v.date);
        if (j !== null) jahre.add(j);
    });
    return [...jahre].sort((a, b) => b - a);
}

// Häufigstes Element samt Anzahl. Bei Gleichstand gewinnt das zuerst
// gefundene – die Reihenfolge ist chronologisch, also der frühere Abend.
function haeufigstes(werte) {
    const zaehler = new Map();
    werte.filter(Boolean).forEach(w => zaehler.set(w, (zaehler.get(w) || 0) + 1));
    let best = null;
    for (const [wert, anzahl] of zaehler) {
        if (!best || anzahl > best.anzahl) best = { wert, anzahl };
    }
    return best;
}

/**
 * Die Häuser einer Spielzeit in der Reihenfolge der Abende; zwei Abende
 * hintereinander im selben Haus sind ein Halt. Nur Häuser mit Koordinaten.
 * Die Story zeichnet daraus den Weg (src/components/Reiseweg.js).
 */
export function reiseweg(besuche) {
    const halte = [];
    for (const v of besuche) {
        const haus = operaHouses.find(h => h.id === v.houseId);
        if (!haus || typeof haus.lat !== 'number' || typeof haus.lon !== 'number') continue;
        if (halte.at(-1)?.id !== haus.id) halte.push(haus);
    }
    return halte;
}

/**
 * Wie weit die Spielzeit einen geführt hat: die Luftlinie zwischen
 * aufeinanderfolgenden Spielstätten, chronologisch aufsummiert.
 *
 * Das ist ausdrücklich keine gefahrene Strecke – zwei Abende hintereinander im
 * selben Haus zählen null, und der Weg von zu Hause zum Haus ist nicht
 * enthalten. Die Beschriftung sagt das auch so.
 */
function reiseKilometer(halte) {
    let summe = 0;
    for (let i = 1; i < halte.length; i++) {
        summe += distanceKm(halte[i - 1].lat, halte[i - 1].lon, halte[i].lat, halte[i].lon);
    }
    return Math.round(summe);
}

/** [Wert, Anzahl], meiste zuerst; bei Gleichstand bleibt die Reihenfolge des Auftretens. */
function rangliste(werte) {
    const zaehler = new Map();
    for (const w of werte) if (w) zaehler.set(w, (zaehler.get(w) || 0) + 1);
    return [...zaehler].sort((a, b) => b[1] - a[1]);
}

/** Wie viele Abende auf jeden Wochentag fielen, Montag zuerst. */
function abendeJeWochentag(besuche) {
    const zaehler = [0, 0, 0, 0, 0, 0, 0];
    for (const v of besuche) {
        const d = toDate(v.date);
        if (d) zaehler[(d.getDay() + 6) % 7]++;
    }
    return zaehler;
}

/**
 * Stellt den Rückblick auf eine Spielzeit zusammen.
 *
 * @param {Array}  alleBesuche  sämtliche Besuche des Nutzers, auch ältere –
 *                              gebraucht für „neu entdeckt“
 * @param {number} startYear    Anfangsjahr der Spielzeit
 */
export function buildSeasonReview(alleBesuche, startYear) {
    const besuche = visitsInSeason(alleBesuche, startYear);
    const label = seasonLabel(startYear);

    if (besuche.length === 0) {
        return { startYear, label, visitCount: 0, leer: true };
    }

    const haeuser = besuche.map(v => operaHouses.find(h => h.id === v.houseId)).filter(Boolean);
    const werke = besuche.map(v => operas.find(o => o.id === v.operaId)).filter(Boolean);
    const credits = besuche.map(v => visitCredits(v));

    // Häuser, die vor dieser Spielzeit nie vorkamen
    const frueher = new Set(
        (alleBesuche || [])
            .filter(v => seasonStartYear(v.date) < startYear)
            .map(v => v.houseId)
    );
    const neueHaeuser = [...new Set(besuche.map(v => v.houseId))]
        .filter(id => !frueher.has(id))
        .map(id => operaHouses.find(h => h.id === id))
        .filter(Boolean);

    const bewertungen = besuche.map(v => Number(v.rating)).filter(Number.isFinite);
    const schnitt = bewertungen.length
        ? bewertungen.reduce((s, r) => s + r, 0) / bewertungen.length
        : 0;

    // Bester Abend: höchste Bewertung, bei Gleichstand der spätere. Beide
    // Vergleiche absteigend, genommen wird der erste – ein .pop() auf die
    // absteigend sortierte Liste hätte den schlechtesten Abend geliefert.
    const bester = [...besuche]
        .filter(v => Number.isFinite(Number(v.rating)))
        .sort((a, b) => (Number(b.rating) - Number(a.rating)) || b.date.localeCompare(a.date))[0] || null;

    // Mehrfach gesehene Werke dieser Spielzeit
    const werkZaehler = new Map();
    besuche.forEach(v => werkZaehler.set(v.operaId, (werkZaehler.get(v.operaId) || 0) + 1));
    const wiederholungen = [...werkZaehler.entries()]
        .filter(([, n]) => n > 1)
        .sort((a, b) => b[1] - a[1])
        .map(([id, n]) => ({ opera: operas.find(o => o.id === id), anzahl: n }))
        .filter(w => w.opera);

    const topHaus = haeufigstes(besuche.map(v => v.houseId));
    const topKomponist = haeufigstes(werke.map(w => w.composer));
    const topDirigent = haeufigstes(credits.map(c => c.conductor));
    const topMonat = haeufigstes(besuche.map(v => {
        const d = toDate(v.date);
        return d ? `${d.getFullYear()}-${d.getMonth()}` : null;
    }));
    const topWochentag = haeufigstes(besuche.map(v => {
        const d = toDate(v.date);
        return d ? WOCHENTAGE[d.getDay()] : null;
    }));

    const monatName = topMonat
        ? `${MONATE[Number(topMonat.wert.split('-')[1])]} ${topMonat.wert.split('-')[0]}`
        : null;
    // Für das Kalenderblatt in der Story: welche Tage dieses Monats Abende hatten.
    const [topJahr, topMonatNr] = topMonat ? topMonat.wert.split('-').map(Number) : [];
    const topTage = [...new Set(besuche.map(v => toDate(v.date))
        .filter(d => d && d.getFullYear() === topJahr && d.getMonth() === topMonatNr)
        .map(d => d.getDate()))].sort((a, b) => a - b);

    return {
        startYear,
        label,
        leer: false,
        visitCount: besuche.length,
        houseCount: new Set(besuche.map(v => v.houseId)).size,
        cityCount: new Set(haeuser.map(h => h.city)).size,
        operaCount: new Set(besuche.map(v => v.operaId)).size,
        composerCount: new Set(werke.map(w => w.composer)).size,
        newHouses: neueHaeuser,
        avgRating: schnitt,
        // Die einzelnen Bewertungen, für die Verteilung in der Story.
        ratings: bewertungen.filter(n => n > 0),
        // Ranglisten fürs Bild zum Teilen: meiste Abende zuerst, bei
        // Gleichstand das, was in der Spielzeit zuerst kam.
        haeuserRang: rangliste(besuche.map(v => v.houseId))
            .map(([id, anzahl]) => ({ house: operaHouses.find(h => h.id === id), anzahl }))
            .filter(x => x.house),
        werkeRang: rangliste(besuche.map(v => v.operaId))
            .map(([id, anzahl]) => ({ opera: operas.find(o => o.id === id), anzahl }))
            .filter(x => x.opera),
        komponistenRang: rangliste(werke.map(w => w.composer)).map(([wert, anzahl]) => ({ wert, anzahl })),
        bestVisit: bester
            ? {
                visit: bester,
                opera: operas.find(o => o.id === bester.operaId) || null,
                house: operaHouses.find(h => h.id === bester.houseId) || null,
            }
            : null,
        topHouse: topHaus
            ? { house: operaHouses.find(h => h.id === topHaus.wert) || null, anzahl: topHaus.anzahl }
            : null,
        topComposer: topKomponist,
        topConductor: topDirigent,
        // Wer am häufigsten auf der Bühne stand, ab zwei Abenden (besetzung.js).
        topVoices: meistgehoerteStimmen(besuche),
        topMonth: monatName
            ? { name: monatName, anzahl: topMonat.anzahl, jahr: topJahr, monat: topMonatNr, tage: topTage }
            : null,
        // Dazu die Abende je Wochentag, Montag zuerst – für die Story.
        topWeekday: topWochentag ? { ...topWochentag, jeTag: abendeJeWochentag(besuche) } : null,
        repeats: wiederholungen,
        travelKm: reiseKilometer(reiseweg(besuche)),
        route: reiseweg(besuche),
        firstVisit: besuche[0],
        lastVisit: besuche[besuche.length - 1],
    };
}

export { MONATE, WOCHENTAGE };
