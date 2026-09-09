// Der eigene Verlauf mit einem Werk – ein Abend nach dem anderen
//
// Das ist der Unterschied zwischen Oper und Film: ein Film bleibt derselbe,
// eine Oper wird jedes Mal neu gemacht. Die Frage ist deshalb selten "magst du
// Tosca", sondern "welche Tosca" – und die Antwort steht bisher über einzelne
// Tagebucheinträge verstreut, obwohl jeder Besuch Haus, Datum, Bewertung und
// Mitwirkende führt.
//
// Gruppiert wird über die Werk-Id aus dem Katalog, nicht über Freitext. Deshalb
// ist die Zuordnung hier eindeutig – anders als bei den Namen in cast_list,
// wo "J. Kaufmann" und "Jonas Kaufmann" zwei Personen wären.

import { operas } from './operas.js';
import { operaHouses } from './operaHouses.js';
import { visitCredits } from '../utils.js';

// Besuche kommen aus der Cloud in snake_case und aus dem lokalen Speicher in
// camelCase – dieselbe Doppelung wie in favorites.js und bei visitCredits.
const werkId = (v) => v?.operaId ?? v?.opera_id ?? null;
const hausId = (v) => v?.houseId ?? v?.house_id ?? null;

/** Die Bewertung als Zahl, oder null. Die Cloud liefert DECIMAL als Text. */
function note(v) {
    const n = Number(v?.rating);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Alle eigenen Abende mit einem Werk, ältester zuerst.
 *
 * Aufsteigend und nicht wie sonst absteigend: hier geht es um den Verlauf,
 * und der wird von vorn gelesen.
 *
 * @param {Array}  visits   eigene Besuche
 * @param {string} operaId  Werk aus dem Katalog
 * @returns {{
 *   werk: object|null, abende: Array, anzahl: number, haeuser: number,
 *   schnitt: number|null, erste: object|null, letzte: object|null,
 *   beste: object|null, entwicklung: number|null
 * }|null}  null, wenn es das Werk nicht gibt oder kein Abend dazu vorliegt
 */
export function werkVerlauf(visits = [], operaId) {
    const werk = operas.find(o => o.id === operaId) || null;
    if (!werk) return null;

    const abende = (visits || [])
        .filter(v => werkId(v) === operaId)
        .map(v => ({
            visit: v,
            datum: String(v?.date || ''),
            jahr: Number(String(v?.date || '').slice(0, 4)) || null,
            // Ein Haus, das der Katalog nicht kennt, lässt den Abend trotzdem
            // stehen. Anders als bei einer Werkliste wäre das Weglassen hier
            // ein Verlust: der Abend hat stattgefunden, nur der Name fehlt.
            haus: operaHouses.find(h => h.id === hausId(v)) || null,
            note: note(v),
            credits: visitCredits(v),
        }))
        // Nach Datum, bei Gleichstand nach Id – sonst entscheidet die
        // Reihenfolge des Ladens, und die Anzeige wechselt beim Neuladen.
        .sort((a, b) => a.datum.localeCompare(b.datum)
            || String(a.visit?.id ?? '').localeCompare(String(b.visit?.id ?? '')));

    if (!abende.length) return null;

    const bewertet = abende.filter(a => a.note !== null);
    const schnitt = bewertet.length
        ? bewertet.reduce((s, a) => s + a.note, 0) / bewertet.length
        : null;

    // Der beste Abend: höchste Note, bei Gleichstand der frühere – wer ein
    // Werk zweimal gleich gut fand, meint meist den, der ihn dahin gebracht hat.
    const beste = bewertet.length
        ? bewertet.reduce((b, a) => (a.note > b.note ? a : b))
        : null;

    // Nur aussagekräftig, wenn erster und letzter Abend bewertet sind.
    const entwicklung = bewertet.length >= 2
        ? bewertet[bewertet.length - 1].note - bewertet[0].note
        : null;

    return {
        werk,
        abende,
        anzahl: abende.length,
        haeuser: new Set(abende.map(a => a.haus?.id).filter(Boolean)).size,
        schnitt,
        erste: abende[0],
        letzte: abende[abende.length - 1],
        beste,
        entwicklung,
    };
}

/**
 * Werke, die mehr als einmal gesehen wurden – die meistgesehenen zuerst.
 *
 * @param {Array} visits eigene Besuche
 * @param {number} [ab]  ab wie vielen Abenden ein Werk zählt
 * @returns {Array} Verläufe, wie werkVerlauf sie liefert
 */
export function mehrfachGesehen(visits = [], ab = 2) {
    const ids = new Set((visits || []).map(werkId).filter(Boolean));

    return [...ids]
        .map(id => werkVerlauf(visits, id))
        .filter(v => v && v.anzahl >= ab)
        .sort((a, b) => (b.anzahl - a.anzahl)
            || a.werk.title.localeCompare(b.werk.title, 'de'));
}
