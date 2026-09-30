// Der Stand der eigenen Sammlungen und ihre Kopfzeile – für das Profil und
// die Seite #/sammlungen. Gestaltet wie die Komponisten in "Was dir noch
// fehlt" (BlindSpots.js): Name, "2 von 4", Balken. Eigenes Modul, damit das
// Profil nicht den Spielplan mitlädt, den nur die Seite braucht.

import { store } from '../store/store.js';
import { escapeHTML } from '../utils.js';
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
