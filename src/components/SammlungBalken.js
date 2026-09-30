// Der Stand der eigenen Sammlungen und ihre Kopfzeile – für das Profil und
// die Seite #/sammlungen. Gestaltet wie die Komponisten in "Was dir noch
// fehlt" (BlindSpots.js): Name, "2 von 4", Balken. Eigenes Modul, damit das
// Profil nicht den Spielplan mitlädt, den nur die Seite braucht.

import { store } from '../store/store.js';
import { escapeHTML } from '../utils.js';
import { icon } from './Icon.js';
import { fortschritt } from '../data/sammlungen.js';

/** Der Stand aller Sammlungen für die eigenen Abende und Markierungen. */
export function eigeneSammlungen() {
    return fortschritt(store.getVisitsByUser('user-me') || [], store.getSeenOperas());
}

/** Name, Stand und Balken einer Sammlung; der Rahmen (summary oder a) kommt vom Aufrufer. */
export function sammlungKopf(stand) {
    const anteil = Math.round((stand.erledigt / stand.gesamt) * 100);
    return `
          <span class="sammlung__name">${escapeHTML(stand.sammlung.titel)}</span>
          <span class="sammlung__zahl">${stand.erledigt}<span> von ${stand.gesamt}</span></span>
          <span class="sammlung__pfeil" aria-hidden="true"></span>
          <span class="sammlung__balken" role="img" aria-label="${stand.erledigt} von ${stand.gesamt}"><i style="width: ${anteil}%"></i></span>`;
}

function ziel(sammlung, teil) {
    if (sammlung.art === 'werke') return `#/opera/${encodeURIComponent(teil.id)}`;
    if (sammlung.art === 'haeuser') return `#/house/${encodeURIComponent(teil.id)}`;
    return null;
}

/**
 * Ein Teil einer Sammlung als Knopf wie in "Was dir noch fehlt": gesehen mit
 * Haken; mit hinweis (dem nächsten Termin) der goldene Punkt davor.
 */
export function teilChip(sammlung, teil, hinweis = null) {
    const klasse = `blindspot__work${teil.erledigt ? ' sammlung__gesehen' : ''}${hinweis ? ' blindspot__work--laeuft' : ''}`;
    const inhalt = `${teil.erledigt ? icon('check') : ''}${escapeHTML(teil.name)}`;
    const titel = hinweis ? ` title="${escapeHTML(hinweis)}"` : '';
    const link = ziel(sammlung, teil);
    return link ? `<a class="${klasse}" href="${link}"${titel}>${inhalt}</a>` : `<span class="${klasse}"${titel}>${inhalt}</span>`;
}
