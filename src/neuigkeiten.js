// "Neu in OpernLog" – die einmalige Ankündigung eines großen Updates.
//
// Einmal je Gerät, und nur für Konten, die es schon vorher gab: wer nach dem
// Update dazukommt, kennt die App nicht anders. Kommt ein neues Update,
// bekommt NEUIGKEIT eine neue id – wer die alte gesehen hat, sieht die neue
// trotzdem. Der Inhalt steht in components/Neuigkeit.js.

export const NEUIGKEIT = {
    id: '2026-09-spielplaene',
    seit: '2026-09-23',
};

export const NEUIGKEIT_GESEHEN = 'opernlog:neuigkeitGesehen';

/**
 * @param {object} o
 * @param {string} o.profilErstellt  created_at des Profils
 */
export function neuigkeitFaellig({ umgebung = globalThis, profilErstellt, neuigkeit = NEUIGKEIT } = {}) {
    const erstellt = Date.parse(profilErstellt || '');
    if (!Number.isFinite(erstellt) || erstellt >= Date.parse(`${neuigkeit.seit}T00:00:00Z`)) return false;
    try {
        return umgebung.localStorage?.getItem(NEUIGKEIT_GESEHEN) !== neuigkeit.id;
    } catch {
        // Ohne Speicher lieber nicht: sonst käme sie bei jedem Start.
        return false;
    }
}

/** Gesehen – auf diesem Gerät nicht noch einmal zeigen. */
export function neuigkeitGesehen(umgebung = globalThis, neuigkeit = NEUIGKEIT) {
    try {
        umgebung.localStorage?.setItem(NEUIGKEIT_GESEHEN, neuigkeit.id);
    } catch {
        // siehe oben
    }
}
