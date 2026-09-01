// Anzeige der blinden Flecken – siehe src/data/blindSpots.js für die Auswahl.

import { blindSpots } from '../data/blindSpots.js';
import { escapeHTML } from '../utils.js';
import { icon } from './Icon.js';

/**
 * Gibt null zurück, wenn es nichts zu zeigen gibt: wer noch keine Besuche hat,
 * bekommt keinen leeren Kasten vorgesetzt.
 *
 * @param {Array} visits  eigene Besuche
 */
export function BlindSpots(visits) {
    const { gruppen, allesGesehen } = blindSpots(visits);
    if (!gruppen.length && !allesGesehen) return null;

    const box = document.createElement('section');
    box.className = 'blindspots';

    if (allesGesehen) {
        box.innerHTML = `
      <h2 class="blindspots__title">${icon('trending', { className: 'icon--meta' })}Blinde Flecken</h2>
      <p class="blindspots__lead">
        Von deinen Komponisten hast du alles gesehen, was der Katalog kennt.
      </p>
    `;
        return box;
    }

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
    <h2 class="blindspots__title">${icon('trending', { className: 'icon--meta' })}Blinde Flecken</h2>
    <p class="blindspots__lead">
      Komponisten, die du oft siehst – und ihre Werke, die dir noch fehlen.
    </p>
    ${abschnitte}
  `;

    return box;
}
