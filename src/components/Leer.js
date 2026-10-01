// Eine leere Seite: Zeichen, eine Zeile, höchstens ein Satz und ein Knopf –
// statt zweier grauer Sätze mit Ausrufezeichen (Jonas, 1.10.2026). Für
// Wunschliste, Listen und Freunde. Die Klasse empty-state bleibt dabei,
// weil Tests und ältere Stellen nach ihr suchen.

import { icon } from './Icon.js';

/**
 * @param {{zeichen: string, titel: string, text?: string, knopf?: {text: string, href: string}}} angaben
 *   Texte sind fest im Code, kein Nutzerinhalt – sie gehen ungefiltert ins HTML.
 */
export function leerHTML({ zeichen, titel, text = '', knopf = null }) {
    return `
      <div class="empty-state leer">
        <span class="leer__zeichen">${icon(zeichen)}</span>
        <p class="leer__titel">${titel}</p>
        ${text ? `<p class="leer__text">${text}</p>` : ''}
        ${knopf ? `<a class="btn btn--outline leer__knopf" href="${knopf.href}">${knopf.text}</a>` : ''}
      </div>`;
}
