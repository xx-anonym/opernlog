// Blinde Flecken
//
// Werke von Komponisten, die jemand oft sieht – die er aber selbst noch nie
// erlebt hat. Die Empfehlung stammt ausschließlich aus dem eigenen Tagebuch
// und dem Katalog: kein Netz, kein fremder Dienst, keine Bewertung durch
// andere. Wer zwölfmal bei Verdi war und Don Carlos nicht kennt, braucht dafür
// keinen Algorithmus, nur den Abgleich.

import { operas } from './operas.js';

/**
 * Innerhalb eines Komponisten wird in Katalogreihenfolge vorgeschlagen. Der
 * Katalog ist nach Bekanntheit gepflegt – bei Verdi steht La Traviata vorn und
 * Simon Boccanegra hinten, bei Mozart die Zauberflöte vor La clemenza di Tito.
 * Damit kommt der naheliegendste Vorschlag zuerst, ohne dass es dafür ein
 * eigenes Feld oder Zahlen von außen bräuchte.
 */
const REIHENFOLGE = new Map(operas.map((o, i) => [o.id, i]));

/**
 * @param {Array}  visits    eigene Besuche
 * @param {Array}  [seenIds] Werke, die ohne Besuchseintrag als gesehen
 *                           markiert wurden (vor OpernLog gesehen)
 * @param {object} [optionen]
 * @param {number} [optionen.maxKomponisten]  wie viele Komponisten höchstens
 * @param {number} [optionen.maxWerke]        wie viele Werke je Komponist
 * @returns {{
 *   gruppen: Array<{composer: string, abende: number, markiert: number,
 *                   gesehen: number, gesamt: number, fehlend: Array<object>,
 *                   fehlendGesamt: number}>,
 *   allesGesehen: boolean
 * }}
 */
export function blindSpots(visits, seenIds = [], { maxKomponisten = 3, maxWerke = 4 } = {}) {
    const proKomponist = new Map();

    function eintragFuer(composer) {
        let e = proKomponist.get(composer);
        if (!e) {
            e = { abende: 0, markiert: 0, gesehen: new Set(), bewertungen: [] };
            proKomponist.set(composer, e);
        }
        return e;
    }

    for (const v of visits || []) {
        const werk = operas.find(o => o.id === v.operaId);
        if (!werk) continue;

        const eintrag = eintragFuer(werk.composer);
        eintrag.abende += 1;
        eintrag.gesehen.add(werk.id);
        const note = Number(v.rating);
        if (Number.isFinite(note)) eintrag.bewertungen.push(note);
    }

    // Markierungen zählen für "gesehen", aber ausdrücklich nicht als Abende:
    // sie haben kein Datum, kein Haus und keine Bewertung. Wer acht Werke
    // eines Komponisten markiert und nie bei ihm im Haus war, soll trotzdem
    // als jemand gelten, der ihn kennt – deshalb ein eigener Zähler.
    for (const id of seenIds || []) {
        const werk = operas.find(o => o.id === id);
        if (!werk) continue;

        const eintrag = eintragFuer(werk.composer);
        if (!eintrag.gesehen.has(werk.id)) eintrag.markiert += 1;
        eintrag.gesehen.add(werk.id);
    }

    if (proKomponist.size === 0) return { gruppen: [], allesGesehen: false };

    const werkeJeKomponist = new Map();
    for (const o of operas) {
        if (!werkeJeKomponist.has(o.composer)) werkeJeKomponist.set(o.composer, []);
        werkeJeKomponist.get(o.composer).push(o);
    }

    const alle = [...proKomponist.entries()].map(([composer, e]) => {
        const katalog = werkeJeKomponist.get(composer) || [];
        const fehlend = katalog
            .filter(o => !e.gesehen.has(o.id))
            .sort((a, b) => REIHENFOLGE.get(a.id) - REIHENFOLGE.get(b.id));
        const schnitt = e.bewertungen.length
            ? e.bewertungen.reduce((s, n) => s + n, 0) / e.bewertungen.length
            : 0;
        return {
            composer,
            abende: e.abende,
            markiert: e.markiert,
            gesehen: e.gesehen.size,
            gesamt: katalog.length,
            schnitt,
            fehlend,
            // Vor dem Kürzen festgehalten: die Zusammenfassung soll die
            // tatsächliche Lücke nennen, nicht die Zahl der angezeigten Chips.
            fehlendGesamt: fehlend.length,
        };
    });

    // Wer bei allen seinen Komponisten schon alles gesehen hat, bekommt keine
    // leere Liste, sondern eine eigene Meldung – das ist schließlich eine
    // Auszeichnung und kein Fehlen von Daten.
    const mitLuecken = alle.filter(g => g.fehlend.length > 0);
    if (mitLuecken.length === 0) return { gruppen: [], allesGesehen: true };

    const gruppen = mitLuecken
        // Häufigkeit entscheidet – Abende und Markierungen zusammen, sonst
        // fiele ein Komponist heraus, den man nur von früher kennt. Bei
        // Gleichstand die bessere Bewertung, dann der Name, damit die
        // Reihenfolge nicht bei jedem Aufruf wechselt.
        .sort((a, b) => ((b.abende + b.markiert) - (a.abende + a.markiert))
            || (b.schnitt - a.schnitt)
            || a.composer.localeCompare(b.composer, 'de'))
        .slice(0, maxKomponisten)
        .map(g => ({ ...g, fehlend: g.fehlend.slice(0, maxWerke) }));

    return { gruppen, allesGesehen: false };
}
