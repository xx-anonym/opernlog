// Wo läuft ein Werk demnächst? Aus src/data/spielplan.js, für die Wunschliste.
//
// Rein rechnend, ohne DOM: welche Termine noch kommen, wie sie sortiert
// werden, und wie sie kurz geschrieben dastehen.

import { spielplan } from './spielplan.js';
import { operaHouses, distanceKm } from './operaHouses.js';

const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

/** Heute als JJJJ-MM-TT in Ortszeit – toISOString() läge nach 22 Uhr schon beim nächsten Tag. */
export function heuteIso(jetzt = new Date()) {
    return `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, '0')}-${String(jetzt.getDate()).padStart(2, '0')}`;
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
 * @returns {Array<{haus: object, url: string, termine: string[], km: number|null}>}
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
            return { haus, url: e.url, termine, km };
        })
        .filter(z => z.haus && z.termine.length);

    return zeilen.sort((a, b) => (position ? a.km - b.km : 0) || a.termine[0].localeCompare(b.termine[0]));
}
