// Fenster mit einer Liste – hinter den anklickbaren Kacheln im Profil.
//
// Ein Fenster statt einer eigenen Seite: es ist ein kurzer Blick, kein Ziel.
// Wer eine Zeile anklickt, landet auf deren Seite, und das Fenster geht zu.
//
// Gerollt wird nur die Liste, nicht das ganze Fenster: sonst verschwindet beim
// Scrollen als Erstes die Überschrift, und dann weiß niemand mehr, was er da
// vor sich hat.

import { escapeHTML } from '../utils.js';
import { icon } from './Icon.js';

/**
 * @param {HTMLElement} host      Element, an das angehängt wird
 * @param {object}   o
 * @param {string}   o.titel      Überschrift ohne Anzahl – die kommt dazu
 * @param {string}   [o.symbol]   Icon-Name für die Überschrift
 * @param {Array}    o.zeilen     [{ href, titel, unterzeile, rechts, betont }]
 * @param {string}   [o.fussnote] erklärender Satz unter der Liste
 * @param {string}   [o.leerText] was steht, wenn die Liste leer ist
 */
export function openListModal(host, { titel, symbol, zeilen, fussnote, leerText }) {
    const modal = document.createElement('div');
    modal.className = 'modal modal--active';

    const eintraege = zeilen.map(z => `
    <a class="listmodal__row" href="${escapeHTML(z.href)}">
      <span class="listmodal__main">
        <span class="listmodal__title">${escapeHTML(z.titel)}</span>
        <span class="listmodal__sub">${escapeHTML(z.unterzeile || '')}</span>
      </span>
      <span class="listmodal__side${z.betont ? ' listmodal__side--betont' : ''}">
        ${escapeHTML(z.rechts || '')}
      </span>
    </a>
  `).join('');

    modal.innerHTML = `
    <div class="modal__overlay"></div>
    <div class="modal__content modal__content--liste">
      <h2 class="modal__title">${symbol ? icon(symbol) : ''}${escapeHTML(titel)} (${zeilen.length})</h2>
      ${zeilen.length ? `
        <div class="listmodal">${eintraege}</div>
        ${fussnote ? `<p class="listmodal__foot">${escapeHTML(fussnote)}</p>` : ''}
      ` : `
        <p class="text-muted">${escapeHTML(leerText || 'Noch nichts vorhanden.')}</p>
      `}
      <div class="modal__actions" style="margin-top: 1.25rem;">
        <button class="btn btn--primary close-modal">Schließen</button>
      </div>
    </div>
  `;

    function schliessen() {
        // Der Zuhörer hängt am Dokument und muss mit dem Fenster verschwinden,
        // sonst bleibt er bis zum nächsten Neuladen liegen.
        document.removeEventListener('keydown', aufTaste);
        modal.remove();
    }

    function aufTaste(e) {
        if (e.key === 'Escape') schliessen();
    }

    modal.querySelector('.close-modal').addEventListener('click', schliessen);
    modal.querySelector('.modal__overlay').addEventListener('click', schliessen);
    // Ein Klick auf eine Zeile führt weg – das Fenster darf nicht stehenbleiben.
    modal.querySelectorAll('.listmodal__row').forEach(a =>
        a.addEventListener('click', schliessen));
    document.addEventListener('keydown', aufTaste);

    host.appendChild(modal);
    return modal;
}
