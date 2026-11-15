// Wann der nächste monatliche Spielplan-Lauf ist – für die Hinweise im
// Formular des Admins (src/components/KatalogFormular.js).
//
// Der Lauf (.github/workflows/spielplan-monatlich.yml, cron '0 2 3 * *')
// startet am 3. jedes Monats um 2 Uhr UTC, also früh morgens deutscher Zeit.
// Was bis dahin im Katalog steht, liest er mit: Werke aus catalog_operas,
// Häuser mit Spielplan-Seite aus catalog_houses. Ändert sich der cron,
// hier LAUF_TAG nachziehen; tests/checks/spielplanLauf.test.js passt auf.

export const LAUF_TAG = 3;

/**
 * @param {Date} [jetzt]
 * @returns {Date} Mitternacht (Ortszeit) des Tages des nächsten Laufs
 */
export function naechsterLauf(jetzt = new Date()) {
    const j = jetzt.getFullYear();
    const m = jetzt.getMonth();
    // Am Lauftag selbst ist er schon gelaufen (früh morgens): der nächste.
    return jetzt.getDate() < LAUF_TAG ? new Date(j, m, LAUF_TAG) : new Date(j, m + 1, LAUF_TAG);
}

/** "3. Dezember" */
export function naechsterLaufText(jetzt = new Date()) {
    return naechsterLauf(jetzt).toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });
}
