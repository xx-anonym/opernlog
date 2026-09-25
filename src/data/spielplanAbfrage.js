// Wo läuft ein Werk demnächst? Aus src/data/spielplan.js, für die Wunschliste.
//
// Rein rechnend, ohne DOM: welche Termine noch kommen, wie sie sortiert
// werden, und wie sie kurz geschrieben dastehen.

import { spielplan } from './spielplan.js';
import { operaHouses, distanceKm } from './operaHouses.js';
import { heuteIso } from '../utils.js';

// Liegt in utils.js, weil auch das Log-Formular es braucht; hier weiter
// erreichbar für alle, die es von hier holen.
export { heuteIso };

const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

const WOCHENTAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

/** "Sa, 5. Dez" – für die Wahl eines Abends. */
export function terminMitWochentag(iso, heute = heuteIso()) {
    const [j, m, t] = iso.split('-').map(Number);
    return `${WOCHENTAGE[new Date(Date.UTC(j, m - 1, t)).getUTCDay()]}, ${terminKurz(iso, heute)}`;
}

/** "19:30" oder "19:30–22:30"; null ohne bekannte Zeit. */
export function zeitText(zeit) {
    return zeit ? zeit.replace('-', '–') : null;
}

/** "8. Okt", mit Jahr nur, wenn es nicht das laufende ist. */
export function terminKurz(iso, heute = heuteIso()) {
    const [j, m, t] = iso.split('-').map(Number);
    return `${t}. ${MONATE[m - 1]}${String(j) === heute.slice(0, 4) ? '' : ` ${j}`}`;
}

/**
 * Die Häuser, an denen ein Werk ab heute noch läuft.
 *
 * Sortiert nach Entfernung, wenn ein Standort bekannt ist – eine Tosca in
 * der eigenen Stadt interessiert mehr als eine frühere in Wien. Sonst nach
 * dem nächsten Termin.
 *
 * @param {string} werkId
 * @param {object} [o]
 * @param {string} [o.heute]      JJJJ-MM-TT
 * @param {{lat: number, lon: number}|null} [o.position]
 * @param {Array}  [o.daten]      nur für Tests; sonst src/data/spielplan.js
 * @returns {Array<{haus: object, url: string, termine: string[], zeiten: object, km: number|null}>}
 */
export function kommendeAuffuehrungen(werkId, { heute = heuteIso(), position = null, daten = spielplan } = {}) {
    const zeilen = daten
        .filter(e => e.werk === werkId)
        .map(e => {
            const haus = operaHouses.find(h => h.id === e.haus);
            const termine = e.termine.filter(t => t >= heute);
            const km = haus && position && Number.isFinite(haus.lat)
                ? Math.round(distanceKm(position.lat, position.lon, haus.lat, haus.lon))
                : null;
            return { haus, url: e.url, termine, zeiten: e.zeiten || {}, km };
        })
        .filter(z => z.haus && z.termine.length);

    return zeilen.sort((a, b) => (position ? a.km - b.km : 0) || a.termine[0].localeCompare(b.termine[0]));
}

/** "2026-10-05" plus n Tage, in Ortszeit gerechnet. */
export function tagePlus(iso, n) {
    const [j, m, t] = iso.split('-').map(Number);
    return heuteIso(new Date(j, m - 1, t + n));
}

/**
 * Was demnächst läuft – für "In der Nähe". Jeder Abend einzeln, nach Datum
 * und Uhrzeit; bei gleichem Beginn das nähere Haus zuerst.
 *
 * @param {object} o
 * @param {string} [o.heute]       JJJJ-MM-TT
 * @param {string} [o.bis]         letzter Tag, einschließlich; ohne: alles Kommende
 * @param {{lat: number, lon: number}|null} [o.position]
 * @param {number|null} [o.radiusKm]  nur mit Position; ohne: alle Häuser
 * @param {Set<string>|null} [o.werke]  nur diese Werke, etwa die Wunschliste
 * @param {Array}  [o.daten]       nur für Tests; sonst src/data/spielplan.js
 * @returns {Array<{datum: string, zeit: string|null, werk: string, haus: object, url: string, km: number|null}>}
 */
export function abendeInDerNaehe({ heute = heuteIso(), bis = null, position = null, radiusKm = null, werke = null, daten = spielplan } = {}) {
    const abende = [];
    for (const e of daten) {
        if (werke && !werke.has(e.werk)) continue;
        const haus = operaHouses.find(h => h.id === e.haus);
        if (!haus) continue;
        const km = position && Number.isFinite(haus.lat)
            ? Math.round(distanceKm(position.lat, position.lon, haus.lat, haus.lon))
            : null;
        if (position && radiusKm !== null && (km === null || km > radiusKm)) continue;
        for (const datum of e.termine) {
            if (datum < heute || (bis && datum > bis)) continue;
            abende.push({ datum, zeit: e.zeiten?.[datum] || null, werk: e.werk, haus, url: e.url, km });
        }
    }
    // Ohne bekannte Uhrzeit ans Ende des Tages.
    const beginn = a => a.zeit ? a.zeit.slice(0, 5) : '99:99';
    return abende.sort((a, b) => a.datum.localeCompare(b.datum)
        || beginn(a).localeCompare(beginn(b))
        || (a.km ?? 0) - (b.km ?? 0)
        || a.haus.name.localeCompare(b.haus.name, 'de'));
}

/**
 * Was an einem Haus demnächst läuft – für die Seite des Hauses. Dieselben
 * Abende wie in abendeInDerNaehe(), nur die dieses Hauses.
 *
 * @param {string} hausId
 * @param {object} [o]
 * @param {string} [o.heute]
 * @param {Array}  [o.daten]   nur für Tests
 */
export function abendeImHaus(hausId, { heute = heuteIso(), daten = spielplan } = {}) {
    return abendeInDerNaehe({ heute, daten: daten.filter(e => e.haus === hausId) });
}

// ── Umkreis für "In der Nähe" ──────────────────────────────────────────
//
// Die Stufen des Schiebers: fein, wo es auf wenige Kilometer ankommt, grob
// weiter draußen. Nicht über 300 km: dahinter endet die Landkarte
// (src/data/landkarte.js), und wer noch weiter will, nimmt "Alle Häuser".
export const UMKREIS_STUFEN = [5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100, 125, 150, 175, 200, 250, 300];

/** Die Stufe, die einem Wert am nächsten liegt – für die Lage des Schiebers. */
export function naechsteStufe(km) {
    return UMKREIS_STUFEN.reduce((beste, s) => Math.abs(s - km) < Math.abs(beste - km) ? s : beste);
}

/**
 * Ein Umkreis, wie er dasteht: nah fein, weiter draußen gröber – "bis 83 km"
 * wäre Scheingenauigkeit. Zwischen 5 und 300 km.
 */
export function rundeKm(km) {
    const schritt = km < 20 ? 1 : km < 100 ? 5 : 10;
    return Math.min(UMKREIS_STUFEN.at(-1), Math.max(UMKREIS_STUFEN[0], Math.round(km / schritt) * schritt));
}

// "Alle Häuser" zählt beim Zoomen wie ein Umkreis ein Stück jenseits der
// letzten Stufe: wer ganz herauszoomt, sieht alle, wer von dort hineinzoomt,
// landet bei 300 km.
const ALLE_ALS_KM = 400;

/**
 * Der Umkreis nach einer Zoom-Geste. faktor > 1 heißt hineinzoomen (Finger
 * auseinander), also kleinerer Umkreis. Stufenlos, nur gerundet (rundeKm);
 * die Stufen gelten für den Schieber, nicht für die Finger.
 *
 * @param {number|null} startKm  Umkreis zu Beginn der Geste; null = alle Häuser
 * @returns {number|null}        neuer Umkreis, oder null für alle Häuser
 */
export function umkreisNachZoom(startKm, faktor) {
    const ziel = (startKm ?? ALLE_ALS_KM) / faktor;
    if (ziel > UMKREIS_STUFEN.at(-1) * 1.15) return null;
    return rundeKm(ziel);
}
