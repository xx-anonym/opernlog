// Die meistgespielten Werke – für das Karussell beim ersten Anmelden
// (src/components/Willkommen.js).
//
// "Beliebt" heißt hier etwas Nachprüfbares: an wie vielen Häusern im Katalog
// ein Werk in dieser Spielzeit auf dem Spielplan steht. Bei gleich vielen
// Häusern entscheidet die Zahl der Termine, danach die Reihenfolge im Katalog.
// Die Liste kommt aus src/data/spielplan.js und wandert mit jedem Lauf mit –
// es gibt keine von Hand gepflegte Auswahl, die veralten könnte.

import { operas } from './operas.js';
import { spielplan } from './spielplan.js';

/**
 * @param {number} [anzahl]
 * @param {object} [o]
 * @param {Array}  [o.daten]    nur für Tests; sonst src/data/spielplan.js
 * @param {Array}  [o.katalog]  nur für Tests; sonst die Werke des Katalogs
 * @returns {Array<object>}  Werke aus dem Katalog, das meistgespielte zuerst
 */
export function beliebteWerke(anzahl = 24, { daten = spielplan, katalog = operas } = {}) {
    const zahl = new Map();
    for (const e of daten) {
        const z = zahl.get(e.werk) || { haeuser: new Set(), termine: 0 };
        z.haeuser.add(e.haus);
        z.termine += e.termine.length;
        zahl.set(e.werk, z);
    }
    return katalog
        .map((werk, platz) => ({ werk, platz, z: zahl.get(werk.id) }))
        .filter(x => x.z)
        .sort((a, b) => b.z.haeuser.size - a.z.haeuser.size || b.z.termine - a.z.termine || a.platz - b.platz)
        .slice(0, anzahl)
        .map(x => x.werk);
}
