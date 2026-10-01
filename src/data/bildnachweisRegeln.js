// Bildnachweise: aus einer Bildadresse den Dateinamen auf Wikimedia Commons,
// und aus den Angaben dort eine kurze Zeile. Ohne DOM und ohne Netz, damit
// das Werkzeug (tests/werkzeug/bildnachweise-holen.mjs), die App und die
// Tests dieselbe Rechnung benutzen.

/**
 * Der Dateiname auf Commons, wie er in der Bildadresse steht – dekodiert,
 * mit Unterstrichen. Nur für Commons-Adressen, sonst null.
 * .../commons/thumb/a/ab/Name.jpg/500px-Name.jpg → "Name.jpg"
 */
export function dateinameAus(adresse) {
    const ohneQuery = String(adresse || '').split('?')[0];
    const m = ohneQuery.match(/\/wikipedia\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+)/);
    if (!m) return null;
    try {
        return decodeURIComponent(m[1]).replace(/ /g, '_');
    } catch {
        return m[1];
    }
}

const UNBEKANNT = /^(unknown( author| photographer)?|unbekannt|anonym(ous)?|anonymer? (fotograf|autor)|author unknown|άγνωστος)\b/i;

/**
 * Der Urheber aus dem HTML, das Commons liefert: ohne Markup, ohne die
 * versteckte Wiederholung ("Unknown author<span style="display: none;">
 * Unknown author</span>"), ohne Lebensdaten in Klammern, höchstens 80 Zeichen.
 */
export function urheberText(html) {
    const ohneVersteckt = String(html || '').replace(/<([a-z]+)[^>]*display:\s*none[^>]*>.*?<\/\1>/gis, '');
    let text = ohneVersteckt.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\s+/g, ' ').trim();
    text = text.replace(/\s*\((\*|geb\.|born|\d{3,4}).*?\)\s*$/i, '').replace(/^(photo|foto|photograph)\s*:\s*/i, '').trim();
    if (!text || UNBEKANNT.test(text)) return 'unbekannt';
    return text.length > 80 ? `${text.slice(0, 79).trim()}…` : text;
}

/** "Bild: Name · CC BY-SA 4.0" – ohne Urheber, wo er unbekannt ist. */
export function nachweisZeile({ urheber, lizenz }) {
    const wer = urheber && urheber !== 'unbekannt' ? urheber : null;
    return ['Bild:', [wer, lizenz].filter(Boolean).join(' · ') || 'Wikimedia Commons'].join(' ');
}
