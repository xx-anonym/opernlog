// Lieblingskomponist und meistbesuchtes Haus
//
// Beide standen bisher zweimal im Code: einmal in store.getStats() für das
// eigene Profil, einmal in Profile.js für fremde Profile – Zeile für Zeile
// dasselbe. Genau diese Doppelung war in dieser App schon mehrfach der Grund,
// warum eine Änderung eine Stelle vergessen hat.
//
// Beide Funktionen geben das gefundene Objekt zurück, nicht nur dessen Namen.
// Wer nur den Namen anzeigen will, nimmt ihn sich heraus; wer verlinken will,
// braucht die Id.

import { operas } from './operas.js';
import { operaHouses } from './operaHouses.js';

// Besuche kommen aus der Cloud in snake_case und aus dem lokalen Speicher in
// camelCase – dieselbe Doppelung wie bei den Mitwirkenden (siehe visitCredits).
const werkId = (v) => v?.operaId ?? v?.opera_id ?? null;
const hausId = (v) => v?.houseId ?? v?.house_id ?? null;

/**
 * Das am häufigsten besuchte Haus.
 *
 * @param {Array} visits
 * @returns {{house: object, besuche: number}|null}
 */
export function topHouse(visits = []) {
    const zaehler = new Map();
    for (const v of visits || []) {
        const id = hausId(v);
        if (!id) continue;
        zaehler.set(id, (zaehler.get(id) || 0) + 1);
    }

    const beste = [...zaehler.entries()]
        .map(([id, besuche]) => ({ house: operaHouses.find(h => h.id === id) || null, besuche }))
        // Häuser, die der Katalog nicht kennt, ließen sich weder benennen noch
        // verlinken.
        .filter(e => e.house)
        // Bei Gleichstand der Name, damit die Anzeige nicht bei jedem Laden
        // wechselt – die Reihenfolge der Besuche darf das nicht entscheiden.
        .sort((a, b) => (b.besuche - a.besuche) || a.house.name.localeCompare(b.house.name, 'de'));

    return beste[0] || null;
}

/**
 * Der Komponist mit den meisten Abenden; bei Gleichstand der besser bewertete.
 *
 * @param {Array} visits
 * @returns {{composer: string, abende: number, schnitt: number}|null}
 */
export function topComposer(visits = []) {
    const zaehler = new Map();
    for (const v of visits || []) {
        const werk = operas.find(o => o.id === werkId(v));
        if (!werk) continue;

        let e = zaehler.get(werk.composer);
        if (!e) {
            e = { composer: werk.composer, abende: 0, summe: 0, bewertet: 0 };
            zaehler.set(werk.composer, e);
        }
        e.abende += 1;
        const note = Number(v.rating);
        if (Number.isFinite(note)) { e.summe += note; e.bewertet += 1; }
    }

    const beste = [...zaehler.values()]
        .map(e => ({
            composer: e.composer,
            abende: e.abende,
            schnitt: e.bewertet ? e.summe / e.bewertet : 0,
        }))
        .sort((a, b) => (b.abende - a.abende)
            || (b.schnitt - a.schnitt)
            || a.composer.localeCompare(b.composer, 'de'));

    return beste[0] || null;
}
