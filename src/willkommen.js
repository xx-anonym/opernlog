// Das Karussell "Was hast du schon gesehen?" beim ersten Anmelden eines neuen
// Kontos – wann es fällig ist. Das Fenster selbst steht in
// components/Willkommen.js.
//
// Einmal je Gerät und nur für Konten, die neu und noch leer sind: höchstens
// 30 Tage alt, kein Abend im Tagebuch, kein Werk als gesehen markiert. Wer
// schon etwas eingetragen hat, braucht den Einstieg nicht mehr – auch nicht
// auf einem zweiten Gerät.

export const WILLKOMMEN_GESEHEN = 'opernlog:willkommenGesehen';

const NEU_TAGE = 30;

/**
 * @param {object} o
 * @param {string} o.profilErstellt  created_at des Profils
 * @param {number} o.abende          Abende im eigenen Tagebuch
 * @param {number} o.gesehen         als gesehen markierte Werke
 */
export function willkommenFaellig({ umgebung = globalThis, profilErstellt, abende = 0, gesehen = 0, jetzt = Date.now() } = {}) {
    if (abende > 0 || gesehen > 0) return false;
    const erstellt = Date.parse(profilErstellt || '');
    if (!Number.isFinite(erstellt) || jetzt - erstellt > NEU_TAGE * 24 * 3600 * 1000) return false;
    try {
        return !umgebung.localStorage?.getItem(WILLKOMMEN_GESEHEN);
    } catch {
        // Ohne Speicher lieber nicht: sonst käme es bei jedem Start.
        return false;
    }
}

/** Gesehen oder übersprungen – auf diesem Gerät nicht noch einmal zeigen. */
export function willkommenErledigt(umgebung = globalThis) {
    try {
        umgebung.localStorage?.setItem(WILLKOMMEN_GESEHEN, new Date().toISOString());
    } catch {
        // siehe oben
    }
}
