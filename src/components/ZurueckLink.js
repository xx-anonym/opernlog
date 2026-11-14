// Der Zurück-Pfeil oben auf jeder Seite, die nicht in der Leiste unten steht.
//
// Ein neues Mitglied vermisste ihn auf manchen Seiten (14.11.2026). In der
// installierten App gibt es keinen Zurück-Knopf des Browsers, und vom Menü
// aus erreichte Seiten wie Wunschliste oder Freunde hatten keinen eigenen.
// Die fünf Seiten der Leiste (Feed, Opernwerke, Loggen, Tagebuch, eigenes
// Profil) brauchen ihn nicht: zu ihnen kommt man mit einem Tipp.
//
// Zurück heißt: eine Seite zurück in der App. Kam man von außen – ein
// geteilter Link, ein frisch geöffnetes Lesezeichen –, gibt es in der App
// kein "davor"; history.back() verließe sie dann oder täte nichts. Dann
// führt der Pfeil zu einer passenden Seite (ersatz).
//
// Ob es ein "davor" gibt, steht als Tiefe im Verlaufseintrag selbst
// (history.state.opernlogTiefe): jede neue Seite bekommt die Tiefe der
// vorigen plus eins, der erste Eintrag 0. Ein bloßer Zähler der
// Seitenwechsel irrte sich nach Hin und Zurück; die Tiefe stimmt auch nach
// dem Neuladen und mit den Fenstern, die src/zurueckGeste.js in den Verlauf
// legt (sie übernehmen den Zustand, also auch die Tiefe).

const TIEFE = 'opernlogTiefe';

const tiefe = () => {
    const t = Number(history.state?.[TIEFE]);
    return Number.isFinite(t) ? t : null;
};

const tiefeSetzen = (t) => {
    try { history.replaceState({ ...(history.state || {}), [TIEFE]: t }, ''); } catch { /* dann eben ohne */ }
};

let letzte = 0;

/**
 * @param {string} [ersatz]  wohin, wenn es in der App kein "davor" gibt
 * @returns {string} HTML
 */
export function zurueckLink(ersatz = '#/') {
    return `<a href="${ersatz}" class="back-link" data-zurueck>← Zurück</a>`;
}

/** Ob history.back() innerhalb der App bleibt. */
export function zurueckMoeglich() {
    return (tiefe() ?? 0) > 0;
}

/** Einmal beim Start: Tiefe führen und die Pfeile bedienen. */
export function zurueckEinrichten() {
    if (tiefe() === null) tiefeSetzen(0);
    letzte = tiefe() ?? 0;
    window.addEventListener('hashchange', () => {
        const t = tiefe();
        // Ohne Tiefe ist der Eintrag neu, sonst kam man vor oder zurück.
        if (t === null) tiefeSetzen(letzte + 1);
        letzte = tiefe() ?? letzte;
    });
    document.addEventListener('click', (e) => {
        const link = e.target instanceof Element ? e.target.closest('a[data-zurueck]') : null;
        if (!link || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
        if (!zurueckMoeglich()) return; // der Link selbst führt zum Ersatz
        e.preventDefault();
        history.back();
    });
}
