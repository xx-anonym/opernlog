// Besuchte Opernhäuser
//
// Gegenstück zu seenOperas.js: welche Häuser hat jemand besucht und wie oft.
// Anders als bei den Werken gibt es hier keine Markierung ohne Besuch – ein
// Haus kennt man aus dem Tagebuch oder gar nicht.

import { operaHouses } from './operaHouses.js';

/**
 * @param {Array} visits  eigene Besuche
 * @returns {Array<{house: object, besuche: number}>} alphabetisch nach Name
 */
export function visitedHouseList(visits = []) {
    const zaehler = new Map();
    for (const v of visits || []) {
        if (!v?.houseId) continue;
        zaehler.set(v.houseId, (zaehler.get(v.houseId) || 0) + 1);
    }

    return [...zaehler.entries()]
        .map(([id, besuche]) => ({
            house: operaHouses.find(h => h.id === id) || null,
            besuche,
        }))
        // Häuser, die der Katalog nicht kennt, fallen heraus – sie ließen sich
        // ohnehin nicht benennen.
        .filter(e => e.house)
        .sort((a, b) => a.house.name.localeCompare(b.house.name, 'de'));
}
