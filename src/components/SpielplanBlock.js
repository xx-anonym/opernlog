// "Läuft demnächst": wo ein Werk der Wunschliste in dieser Spielzeit läuft.
//
// Je Haus eine Zeile mit den nächsten Terminen, verlinkt auf die Seite des
// Hauses – dort wird gebucht, und dort stehen die verbindlichen Termine.

import { escapeHTML, requestPosition } from '../utils.js';
import { distanceKm } from '../data/operaHouses.js';
import { kommendeAuffuehrungen, terminKurz, heuteIso } from '../data/spielplanAbfrage.js';
import { SPIELPLAN_STAND } from '../data/spielplan.js';

// Wie viele Häuser je Werk sofort dastehen; der Rest klappt auf.
const HAEUSER_SICHTBAR = 3;
// Wie viele Termine je Haus; dahinter "+ n".
const TERMINE_SICHTBAR = 3;

/** @returns {string} HTML für den unteren Teil einer Werkkarte */
export function spielplanBlock(werkId, position = null) {
    const heute = heuteIso();
    const zeilen = kommendeAuffuehrungen(werkId, { heute, position });
    if (!zeilen.length) {
        return `<div class="spielplan-block" data-werk="${escapeHTML(werkId)}"><p class="spielplan-block__leer">In dieser Spielzeit an keinem Haus im Katalog gefunden.</p></div>`;
    }
    const zeile = z => {
        const sichtbar = z.termine.slice(0, TERMINE_SICHTBAR).map(t => terminKurz(t, heute)).join(' · ');
        const mehr = z.termine.length > TERMINE_SICHTBAR
            ? ` <span class="spielplan-zeile__mehr">+${z.termine.length - TERMINE_SICHTBAR}</span>` : '';
        const inhalt = `
            <span class="spielplan-zeile__haus">${escapeHTML(z.haus.name)}<span class="spielplan-zeile__ort">${escapeHTML(z.haus.city)}${z.km !== null ? ` · ${z.km} km` : ''}</span></span>
            <span class="spielplan-zeile__termine">${sichtbar}${mehr}</span>`;
        // Nur https wird ein Link. Die Adressen stammen von fremden Seiten;
        // ein "javascript:" liefe sonst beim Tippen als Code.
        return /^https:\/\//i.test(z.url)
            ? `<a class="spielplan-zeile" href="${escapeHTML(z.url)}" target="_blank" rel="noopener">${inhalt}</a>`
            : `<div class="spielplan-zeile">${inhalt}</div>`;
    };
    const rest = zeilen.slice(HAEUSER_SICHTBAR);
    return `
      <div class="spielplan-block" data-werk="${escapeHTML(werkId)}">
        <p class="spielplan-block__titel">Läuft demnächst</p>
        ${zeilen.slice(0, HAEUSER_SICHTBAR).map(zeile).join('')}
        ${rest.length ? `<details class="spielplan-block__weitere"><summary>${rest.length} ${rest.length === 1 ? 'weiteres Haus' : 'weitere Häuser'}</summary>${rest.map(zeile).join('')}</details>` : ''}
      </div>`;
}

/** Läuft das Werk demnächst irgendwo? Sonst braucht es keinen Knopf dafür. */
export function hatKommendeTermine(werkId) {
    return kommendeAuffuehrungen(werkId, { heute: heuteIso() }).length > 0;
}

/**
 * Fragt nach dem Standort und zeichnet die Blöcke in `bereich` danach neu,
 * die nächsten Häuser zuerst. requestPosition() fragt nicht, wenn der
 * Standort verweigert wurde – dann bleibt es bei der Reihenfolge nach Datum.
 * Kaum bewegt: nichts neu zeichnen, sonst klappte ein geöffnetes "weitere
 * Häuser" wieder zu.
 */
export function nachStandortOrdnen(bereich, bisher = null) {
    return requestPosition().then(neu => {
        if (!neu || !bereich.isConnected) return;
        if (bisher && distanceKm(bisher.lat, bisher.lon, neu.lat, neu.lon) < 1) return;
        bereich.querySelectorAll('.spielplan-block[data-werk]').forEach(block => {
            block.outerHTML = spielplanBlock(block.dataset.werk, neu);
        });
    });
}

/** Der Satz unter der Liste: woher die Termine kommen und von wann. */
export function spielplanQuelle() {
    const el = document.createElement('p');
    el.className = 'spielplan-quelle';
    const [j, m, t] = SPIELPLAN_STAND.split('-');
    el.textContent = `Termine aus den Spielplänen der Häuser im Katalog, Stand ${Number(t)}.${Number(m)}.${j}. Änderungen sind möglich – maßgeblich ist die Seite des Hauses.`;
    return el;
}
