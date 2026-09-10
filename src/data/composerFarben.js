// Die Farbe hinter einem Werk, wenn kein Bild da ist
//
// Sie stand fünfmal im Code – in Home.js, Operas.js, OperaDetail.js,
// ListDetail.js und Wishlist.js – und war dabei nicht einmal gleich: Operas.js
// kannte neun Komponisten, die übrigen fünf oder sechs. Händel, Rossini und
// Donizetti hatten ihre Farbe also nur im Katalog und verloren sie auf jeder
// anderen Seite. Hier steht die Vereinigung, damit das aufhört.
//
// Bewusst nicht in composers.js: die Datei schreibt komponisten-holen.mjs neu,
// und von Hand gewählte Farben hätten den nächsten Lauf nicht überlebt.

const FARBEN = {
    'Wolfgang Amadeus Mozart': '#c9a84c',
    'Giuseppe Verdi': '#2d7d46',
    'Richard Wagner': '#7d2d2d',
    'Giacomo Puccini': '#2d5a7d',
    'Richard Strauss': '#7d5a2d',
    'Georges Bizet': '#7d2d5a',
    'Georg Friedrich Händel': '#5a2d7d',
    'Gioachino Rossini': '#2d7d7d',
    'Gaetano Donizetti': '#7d7d2d',
};

/** Das Rot des Hauses – für alle, die keine eigene Farbe haben. */
export const STANDARDFARBE = '#8b1a2b';

/**
 * @param {string} composer Name aus dem Werkkatalog
 * @returns {string} Hex-Farbe
 */
export function composerFarbe(composer) {
    return FARBEN[composer] || STANDARDFARBE;
}

/**
 * Der fertige Verlauf für eine Kachel ohne Bild – dieselbe Formel, die vorher
 * an fünf Stellen ausgeschrieben stand.
 *
 * @param {string} composer
 * @returns {string} CSS-Wert für background-image
 */
export function composerVerlauf(composer) {
    return `linear-gradient(135deg, ${composerFarbe(composer)}, #14181c)`;
}
