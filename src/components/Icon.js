// Icon-Satz der App.
//
// Gezeichnet im selben Stil wie die Navigation: 24er-Raster, nur Konturen,
// stroke="currentColor", runde Enden. Damit übernimmt jedes Icon die Farbe und
// Größe seines Textes.
//
// Warum überhaupt: Vorher standen in der Oberfläche Emoji (📔 🗑️ ❤️ …) neben
// den gezeichneten SVGs der Navigation – zwei Bildsprachen nebeneinander. Emoji
// werden zudem von jedem Betriebssystem anders gezeichnet, dieselbe Stelle sah
// auf iOS, Android und Windows unterschiedlich aus.
//
// Bewusst NICHT ersetzt: ★ ☆ ✓ ✕ ← → ↓. Das sind typografische Zeichen, die in
// der Schrift der App liegen und überall gleich aussehen.

const PATHS = {
  // Navigation und Seitenköpfe
  book: '<path d="M12 6.6C10.5 5.1 8.5 4.3 6 4.3c-1 0-1.9.1-2.7.4v14c.8-.3 1.7-.4 2.7-.4 2.5 0 4.5.8 6 2.3 1.5-1.5 3.5-2.3 6-2.3 1 0 1.9.1 2.7.4v-14c-.8-.3-1.7-.4-2.7-.4-2.5 0-4.5.8-6 2.3z"/><path d="M12 6.6V20.6"/>',
  music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
  // identisch mit dem Navigationseintrag "Opernhäuser"
  building: '<path d="M3 21h18M3 7v1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7H3l2-4h14l2 4M5 21V10.87M19 21V10.87"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  // identisch mit dem Navigationseintrag "Loggen"
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  feed: '<path d="M6 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8h4"/><path d="M6 4v14a2 2 0 0 1-2 2"/><path d="M10 8h8"/><path d="M10 12h8"/><path d="M10 16h5"/>',
  inbox: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  trending: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',

  // Rückmeldung
  check: '<polyline points="20 6 9 17 4 12"/>',
  checkCircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  xCircle: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
  alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22 6 12 13 2 6"/>',
  // Zwischenablage – NICHT "list". Das Emoji 📋 stand hier für Kopieren,
  // nicht für eine Aufzählung.
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',

  // Aktionen
  pencil: '<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  message: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  note: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>',

  // Metadaten
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  globe: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  bookOpen: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  seat: '<path d="M4 18v-2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2"/><path d="M6 14V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8"/><line x1="5" y1="18" x2="5" y2="21"/><line x1="19" y1="18" x2="19" y2="21"/>',
};

/**
 * Gibt ein Icon als SVG-String zurück.
 *
 * @param {string} name        Schlüssel aus PATHS
 * @param {object} [options]
 * @param {string} [options.className]  zusätzliche CSS-Klassen
 * @param {boolean} [options.filled]    füllt die Form (für aktive Zustände, z.B. gesetzter Like)
 * @param {string} [options.label]      macht das Icon für Screenreader lesbar
 */
export function icon(name, { className = '', filled = false, label = '' } = {}) {
  const path = Object.prototype.hasOwnProperty.call(PATHS, name) ? PATHS[name] : null;
  if (!path) {
    console.warn(`[Icon] Unbekanntes Icon: ${name}`);
    return '';
  }
  const a11y = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true"';
  return `<svg class="icon ${className}" viewBox="0 0 24 24" ${a11y}
    fill="${filled ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

export const ICON_NAMES = Object.keys(PATHS);
