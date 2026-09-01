// Anzeige der blinden Flecken – siehe src/data/blindSpots.js für die Auswahl.
//
// Bewusst zugeklappt: der Abschnitt steht auf der Seite "Opern" über dem
// Katalog, und dort will die Mehrheit den Katalog sehen und nicht eine
// Empfehlung. Als eine Zeile ist er auffindbar, ohne im Weg zu stehen; wer ihn
// einmal aufklappt, findet ihn beim nächsten Mal offen vor.

import { blindSpots } from '../data/blindSpots.js';
import { escapeHTML } from '../utils.js';
import { icon } from './Icon.js';

const SPEICHER = 'opernlog:blindspotsOffen';

function warOffen() {
    try {
        return localStorage.getItem(SPEICHER) === '1';
    } catch (e) {
        // localStorage fehlt im privaten Modus mancher Browser
        return false;
    }
}

function merkeOffen(offen) {
    try {
        localStorage.setItem(SPEICHER, offen ? '1' : '0');
    } catch (e) { /* siehe oben */ }
}

/**
 * Gibt null zurück, wenn es nichts zu zeigen gibt: wer noch keine Besuche hat,
 * bekommt keinen leeren Kasten vorgesetzt.
 *
 * @param {Array} visits  eigene Besuche
 */
export function BlindSpots(visits) {
    const { gruppen, allesGesehen } = blindSpots(visits);
    if (!gruppen.length && !allesGesehen) return null;

    // Für einen einzigen Satz lohnt kein Aufklappen.
    if (allesGesehen) {
        const notiz = document.createElement('p');
        notiz.className = 'blindspots__done';
        notiz.innerHTML = `${icon('check', { className: 'icon--meta' })}`
            + `Von deinen Komponisten hast du alles gesehen, was der Katalog kennt.`;
        return notiz;
    }

    const werkeGesamt = gruppen.reduce((s, g) => s + g.fehlendGesamt, 0);

    const box = document.createElement('details');
    box.className = 'form-collapse blindspots';
    box.open = warOffen();
    box.addEventListener('toggle', () => merkeOffen(box.open));

    const abschnitte = gruppen.map(g => `
    <div class="blindspot">
      <div class="blindspot__head">
        <span class="blindspot__composer">${escapeHTML(g.composer)}</span>
        <span class="blindspot__meta">
          ${g.abende} ${g.abende === 1 ? 'Abend' : 'Abende'} ·
          ${g.gesehen} von ${g.gesamt} ${g.gesamt === 1 ? 'Werk' : 'Werken'}
        </span>
      </div>
      <div class="blindspot__works">
        ${g.fehlend.map(o => `
          <a class="blindspot__work" href="#/opera/${encodeURIComponent(o.id)}">
            ${escapeHTML(o.title)}
          </a>
        `).join('')}
      </div>
    </div>
  `).join('');

    box.innerHTML = `
    <summary class="form-collapse__summary">
      ${icon('trending', { className: 'icon--meta' })}Blinde Flecken
      <span class="form-collapse__optional">
        ${gruppen.length} ${gruppen.length === 1 ? 'Komponist' : 'Komponisten'},
        ${werkeGesamt} ${werkeGesamt === 1 ? 'Werk' : 'Werke'} offen
      </span>
    </summary>
    <div class="form-collapse__body">
      <p class="blindspots__lead">
        Komponisten, die du oft siehst – und ihre Werke, die dir noch fehlen.
      </p>
      ${abschnitte}
    </div>
  `;

    return box;
}
