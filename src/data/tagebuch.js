// Reihenfolge und Gruppierung im Tagebuch.
//
// Beides steht hier bewusst beieinander, denn beides ist dieselbe Entscheidung.
// Vorher sortierte die Seite erst und gruppierte danach immer nach Monat. Die
// Gruppierung machte die Sortierung nach Bewertung damit wieder zunichte: die
// Abende blieben in ihren Monatsblöcken und standen nur innerhalb eines Blocks
// nach Note. Wer "Beste Bewertung zuerst" wählte, sah oben trotzdem den
// jüngsten Monat.
//
// Nach Bewertung sortiert sind die Überschriften deshalb keine Monate, sondern
// die Noten selbst. Eine Gruppierung, die nicht der Sortierung folgt, hebt sie
// auf.

import { seasonStartYear } from './season.js';

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/** Wird nach Note sortiert – und nicht nach Datum? */
export function nachNote(sort) {
    return sort === 'rating-desc' || sort === 'rating-asc';
}

/**
 * Die Note eines Abends als Zahl, oder null, wenn keine vergeben wurde.
 *
 * Aus der Cloud kommt DECIMAL(2,1) je nach Weg als Zahl oder als Zeichenkette;
 * ohne Number() verglichen stünde "10" vor "9". Die Null zählt wie das Fehlen
 * einer Note – so hält es auch seasonSummary().
 */
export function note(visit) {
    const n = Number(visit?.rating);
    return Number.isFinite(n) && n > 0 ? n : null;
}

// Besuchsdaten stehen als 'JJJJ-MM-TT' in der Datenbank. In dieser Form
// vergleichen sie sich als Zeichenkette richtig, ohne den Umweg über new Date()
// – der legt sie auf Mitternacht UTC und kann sie je nach Zeitzone einen Tag
// zurückschieben.
function tag(visit) {
    return String(visit?.date || '').slice(0, 10);
}

/**
 * Bringt die Abende in die gewählte Reihenfolge. Liefert eine neue Liste.
 *
 * Bei gleicher Note entscheidet das Datum, neueste zuerst – sonst hinge die
 * Reihenfolge innerhalb einer Note davon ab, wie die Besuche aus der Datenbank
 * kamen, und spränge bei jedem Laden.
 *
 * Abende ohne Note stehen in beiden Richtungen am Ende. "Keine Note" ist
 * nicht "null Sterne": bei "Schlechteste zuerst" stünden sie sonst ganz oben
 * und behaupteten ein Urteil, das niemand gefällt hat.
 */
export function sortiereBesuche(besuche, sort) {
    const liste = [...(besuche || [])];

    if (!nachNote(sort)) {
        const richtung = sort === 'date-asc' ? 1 : -1;
        return liste.sort((a, b) => richtung * tag(a).localeCompare(tag(b)));
    }

    const richtung = sort === 'rating-asc' ? 1 : -1;
    return liste.sort((a, b) => {
        const x = note(a), y = note(b);
        if (x === null && y === null) return tag(b).localeCompare(tag(a));
        if (x === null) return 1;
        if (y === null) return -1;
        return richtung * (x - y) || tag(b).localeCompare(tag(a));
    });
}

/** "4,5 Sterne", "1 Stern", "Ohne Bewertung" */
export function notenTitel(n) {
    if (n === null) return 'Ohne Bewertung';
    return `${String(n).replace('.', ',')} ${n === 1 ? 'Stern' : 'Sterne'}`;
}

/** "März 2025" aus dem Schlüssel "2025-03" */
function monatsTitel(schluessel) {
    const [jahr, monat] = schluessel.split('-');
    return `${MONATE[Number(monat) - 1]} ${jahr}`;
}

/**
 * Sortiert die Abende und schlägt sie in Blöcke – Monate bei chronologischer
 * Sortierung, Noten bei Sortierung nach Bewertung.
 *
 * Die Blöcke stehen in der Reihenfolge der sortierten Liste; innerhalb eines
 * Blocks bleibt sie ebenfalls erhalten.
 *
 * @returns {Array<{typ: 'monat'|'note', schluessel: string, titel: string,
 *                  spielzeit: number|null, note: number|null, besuche: Array}>}
 */
export function gruppiereBesuche(besuche, sort) {
    const sortiert = sortiereBesuche(besuche, sort);
    const nachNoten = nachNote(sort);
    const bloecke = new Map();

    for (const visit of sortiert) {
        const n = note(visit);
        const schluessel = nachNoten
            ? (n === null ? 'ohne' : String(n))
            : tag(visit).slice(0, 7);

        if (!bloecke.has(schluessel)) {
            bloecke.set(schluessel, {
                typ: nachNoten ? 'note' : 'monat',
                schluessel,
                titel: nachNoten ? notenTitel(n) : monatsTitel(schluessel),
                spielzeit: nachNoten ? null : seasonStartYear(`${schluessel}-01`),
                note: nachNoten ? n : null,
                besuche: [],
            });
        }
        bloecke.get(schluessel).besuche.push(visit);
    }

    return [...bloecke.values()];
}

export { MONATE };
