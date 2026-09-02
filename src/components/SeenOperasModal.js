// Liste aller gesehenen Werke – hinter der Kachel "Werke gesehen" im Profil.
//
// Ein Fenster statt einer eigenen Seite: es ist ein kurzer Blick, kein Ziel.
// Wer ein Werk anklickt, landet auf dessen Seite, und das Fenster geht zu.

import { seenOperaList } from '../data/seenOperas.js';
import { escapeHTML } from '../utils.js';
import { icon } from './Icon.js';

/**
 * Öffnet das Fenster und hängt es an den übergebenen Behälter.
 *
 * @param {HTMLElement} host     Element, an das angehängt wird
 * @param {Array} visits         eigene Besuche
 * @param {Array} [seenIds]      markierte Werke
 */
export function openSeenOperasModal(host, visits, seenIds = []) {
    const liste = seenOperaList(visits, seenIds);

    const modal = document.createElement('div');
    modal.className = 'modal modal--active';

    const zeilen = liste.map(e => `
    <a class="seenlist__row" href="#/opera/${encodeURIComponent(e.opera.id)}">
      <span class="seenlist__work">
        <span class="seenlist__title">${escapeHTML(e.opera.title)}</span>
        <span class="seenlist__composer">${escapeHTML(e.opera.composer)}</span>
      </span>
      <span class="seenlist__how${e.abende ? '' : ' seenlist__how--markiert'}">
        ${e.abende
            ? `${e.abende} ${e.abende === 1 ? 'Abend' : 'Abende'}`
            : 'markiert'}
      </span>
    </a>
  `).join('');

    modal.innerHTML = `
    <div class="modal__overlay"></div>
    <div class="modal__content modal__content--liste">
      <h2 class="modal__title">${icon('music')}Gesehene Werke (${liste.length})</h2>
      ${liste.length ? `
        <div class="seenlist">${zeilen}</div>
        <p class="seenlist__foot">
          „markiert“ heißt: als gesehen vermerkt, aber ohne geloggten Abend.
        </p>
      ` : `
        <p class="text-muted">Noch kein Werk geloggt oder als gesehen markiert.</p>
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
    // Ein Klick auf ein Werk führt weg – das Fenster darf nicht stehenbleiben.
    modal.querySelectorAll('.seenlist__row').forEach(a =>
        a.addEventListener('click', schliessen));
    document.addEventListener('keydown', aufTaste);

    host.appendChild(modal);
    return modal;
}
