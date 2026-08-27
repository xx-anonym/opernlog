// Utility functions shared across OpernLog

/**
 * Baut den Hintergrund für Karten- und Kopfbilder aus drei Ebenen:
 * Abdunklung, Foto, farbiger Verlauf.
 *
 * Der Verlauf liegt unter dem Foto statt in einem else-Zweig. Scheitert das
 * Laden – Netz weg, Host blockiert, Bild verschwunden – malt die Foto-Ebene
 * einfach nichts und der Verlauf wird sichtbar. Vorher stand der Verlauf im
 * else-Zweig einer Bedingung, die prüfte, ob eine URL existiert; da alle
 * Einträge eine haben, war er unerreichbar und an der Stelle blieb ein
 * schwarzes Loch.
 *
 * @param {string} url         Bild-URL (darf leer sein)
 * @param {string} fallback    CSS-Verlauf, z.B. linear-gradient(...)
 * @param {string} scrim       Farbstopps der Abdunklung über dem Bild
 */
export function coverBackground(url, fallback, scrim = 'rgba(0,0,0,0.15), rgba(20,24,28,0.85)') {
    const layers = [];
    if (scrim) layers.push(`linear-gradient(to bottom, ${scrim})`);
    if (url) layers.push(`url('${cssUrl(url)}')`);
    layers.push(fallback);
    return `background-image: ${layers.join(', ')}; background-size: cover; background-position: center;`;
}

// Nur die Zeichen maskieren, die url('...') aufbrechen könnten. Bewusst kein
// encodeURI: die Wikimedia-Adressen sind bereits prozentkodiert und würden
// dabei ein zweites Mal kodiert.
function cssUrl(url) {
    return String(url).replace(/['"()\\\s]/g, c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'));
}

/**
 * Escapes HTML special characters to prevent XSS attacks.
 * Use this for ALL user-generated content before inserting into innerHTML.
 */
export function escapeHTML(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
