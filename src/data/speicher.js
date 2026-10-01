// Wie voll der Speicher bei Supabase ist – die Rechnung zum Hinweis, den
// Admins auf der Startseite bekommen (src/components/SpeicherHinweis.js).
// Jonas, 1.10.2026: warnen ab 90 %. Supabase selbst meldet sich erst, wenn
// eine Grenze schon überschritten ist.
//
// Die Grenzen sind die des kostenlosen Plans. Supabase schreibt "GB"; hier
// steht die kleinere Lesart (10⁹ statt 2³⁰ Bytes) – der Hinweis kommt so
// eher etwas zu früh als zu spät. Wechselt der Plan, ändert sich nur GRENZEN.

export const GRENZEN = { dateien: 1e9, datenbank: 500e6 };
export const WARNEN_AB = 0.9;

const NAMEN = { dateien: 'Fotospeicher', datenbank: 'Datenbank' };

/** 912 MB, 1 GB, 1,2 GB – so grob, wie ein Hinweis es braucht. */
export function groesse(bytes) {
    if (bytes >= 1e9) return `${(bytes / 1e9).toLocaleString('de-DE', { maximumFractionDigits: 1 })} GB`;
    return `${Math.round(bytes / 1e6)} MB`;
}

/**
 * Die Speicher, die zu WARNEN_AB oder mehr belegt sind, je mit Text.
 * @param {{dateien: number, datenbank: number}} belegt Bytes, aus speicher_belegt()
 * @returns {Array<{art: string, anteil: number, text: string}>}
 */
export function speicherWarnungen(belegt, grenzen = GRENZEN) {
    return Object.keys(grenzen)
        .map(art => ({ art, anteil: (belegt?.[art] || 0) / grenzen[art] }))
        .filter(w => w.anteil >= WARNEN_AB)
        .map(w => ({
            ...w,
            text: `${NAMEN[w.art]} zu ${Math.floor(w.anteil * 100)} % voll – ${groesse(belegt[w.art])} von ${groesse(grenzen[w.art])}`,
        }));
}
