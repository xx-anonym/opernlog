// "Neu in OpernLog" – die einmalige Ankündigung eines großen Updates.
//
// Einmal je Gerät, und nur für Konten, die es schon vorher gab: wer nach dem
// Update dazukommt, kennt die App nicht anders.
//
// Und nur in den ersten acht Wochen nach dem Update. Danach ist es keine
// Neuigkeit mehr. Gemerkt wird "gesehen" im Speicher der Adresse; nach dem
// Umzug auf opernlog.de (18.11.2026) war der leer, und die Ankündigung vom
// September kam bei Jonas zweimal wieder – im Safari-Tab und in der neu
// hinzugefügten App, die am iPhone ihren eigenen Speicher hat. Kommt ein neues Update,
// bekommt NEUIGKEIT eine neue id – wer die alte gesehen hat, sieht die neue
// trotzdem. Der Inhalt steht in components/Neuigkeit.js.

export const NEUIGKEIT = {
    id: '2026-09-spielplaene',
    seit: '2026-09-23',
};

export const NEUIGKEIT_GESEHEN = 'opernlog:neuigkeitGesehen';

/** So lange nach `seit` gilt eine Neuigkeit als neu. */
export const NEUIGKEIT_WOCHEN = 8;

/**
 * @param {object} o
 * @param {string} o.profilErstellt  created_at des Profils
 */
export function neuigkeitFaellig({ umgebung = globalThis, profilErstellt, neuigkeit = NEUIGKEIT, jetzt = Date.now() } = {}) {
    const seit = Date.parse(`${neuigkeit.seit}T00:00:00Z`);
    if (jetzt >= seit + NEUIGKEIT_WOCHEN * 7 * 24 * 3600e3) return false;
    const erstellt = Date.parse(profilErstellt || '');
    if (!Number.isFinite(erstellt) || erstellt >= seit) return false;
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
