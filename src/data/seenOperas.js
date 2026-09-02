// Gesehene Werke – geloggt oder markiert
//
// Eine einzige Stelle für die Frage "welche Werke hat jemand gesehen". Sowohl
// die Kachel "Werke gesehen" im Profil als auch die Liste dahinter greifen
// darauf zu; sonst könnte die Zahl acht sagen und die Liste sieben zeigen.

import { operas } from './operas.js';

/**
 * @param {Array} visits    eigene Besuche
 * @param {Array} [seenIds] ohne Besuchseintrag als gesehen markierte Werke
 * @returns {Array<{opera: object, abende: number, markiert: boolean}>}
 *          alphabetisch nach Titel
 */
export function seenOperaList(visits = [], seenIds = []) {
    const abende = new Map();
    for (const v of visits || []) {
        if (!v?.operaId) continue;
        abende.set(v.operaId, (abende.get(v.operaId) || 0) + 1);
    }

    const markiert = new Set(seenIds || []);
    const alle = new Set([...abende.keys(), ...markiert]);

    return [...alle]
        .map(id => ({
            opera: operas.find(o => o.id === id) || null,
            abende: abende.get(id) || 0,
            markiert: markiert.has(id),
        }))
        // Werke, die der Katalog nicht kennt, fallen heraus. Sie ließen sich
        // ohnehin nicht benennen, und mitgezählt würde die Zahl über der Liste
        // größer als die Liste selbst.
        .filter(e => e.opera)
        .sort((a, b) => a.opera.title.localeCompare(b.opera.title, 'de'));
}
