// Das Karussell "Was hast du schon gesehen?" beim ersten Anmelden eines neuen
// Kontos – wann es fällig ist. Das Fenster selbst steht in
// components/Willkommen.js.
//
// Einmal je Konto und Gerät, und nur für Konten, die neu und noch leer sind:
// höchstens 30 Tage alt, kein Abend im Tagebuch, kein Werk als gesehen
// markiert. Wer schon etwas eingetragen hat, braucht den Einstieg nicht mehr –
// auch nicht auf einem zweiten Gerät.
//
// Gemerkt wird je Konto, nicht je Gerät: am 10.11.2026 bekam ein frisch
// registriertes Konto kein Karussell, weil auf demselben iPhone am Vorabend
// ein anderes Konto es gesehen hatte.

export const WILLKOMMEN_GESEHEN = 'opernlog:willkommenGesehen';

/** Der Schlüssel im Speicher des Geräts für dieses Konto. */
export const willkommenSchluessel = profilId => `${WILLKOMMEN_GESEHEN}:${profilId}`;

const NEU_TAGE = 30;

/**
 * @param {object} o
 * @param {string} o.profilId        Kennung des Kontos
 * @param {string} o.profilErstellt  created_at des Profils
 * @param {number} o.abende          Abende im eigenen Tagebuch
 * @param {number} o.gesehen         als gesehen markierte Werke
 */
export function willkommenFaellig({ umgebung = globalThis, profilId, profilErstellt, abende = 0, gesehen = 0, jetzt = Date.now() } = {}) {
    if (!profilId || abende > 0 || gesehen > 0) return false;
    const erstellt = Date.parse(profilErstellt || '');
    if (!Number.isFinite(erstellt) || jetzt - erstellt > NEU_TAGE * 24 * 3600 * 1000) return false;
    try {
        return !umgebung.localStorage?.getItem(willkommenSchluessel(profilId));
    } catch {
        // Ohne Speicher lieber nicht: sonst käme es bei jedem Start.
        return false;
    }
}

/** Gesehen oder übersprungen – diesem Konto auf diesem Gerät nicht noch einmal zeigen. */
export function willkommenErledigt(profilId, umgebung = globalThis) {
    if (!profilId) return;
    try {
        umgebung.localStorage?.setItem(willkommenSchluessel(profilId), new Date().toISOString());
    } catch {
        // siehe oben
    }
}
