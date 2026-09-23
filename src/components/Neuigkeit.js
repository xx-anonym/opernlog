// Das Fenster zu NEUIGKEIT (src/neuigkeiten.js): die Spielpläne.
//
// Die Zahlen kommen aus der Spielplandatei selbst, damit sie nach dem
// nächsten Lauf nicht veraltet dastehen.

import { icon } from './Icon.js';
import { spielplan, SPIELPLAN_STAND } from '../data/spielplan.js';
import { neuigkeitGesehen } from '../neuigkeiten.js';

/** Hängt das Fenster an und gibt es zurück. */
export function neuigkeitFenster({ gesehen = () => neuigkeitGesehen() } = {}) {
    const haeuser = new Set(spielplan.map(e => e.haus)).size;
    const termine = spielplan.reduce((n, e) => n + e.termine.length, 0);
    const [j, m, t] = SPIELPLAN_STAND.split('-');

    const modal = document.createElement('div');
    modal.className = 'modal modal--active neuigkeit';
    modal.innerHTML = `
      <div class="modal__overlay"></div>
      <div class="modal__content" role="dialog" aria-labelledby="neuigkeitTitel">
        <p class="neuigkeit__marke">Neu in OpernLog</p>
        <h2 class="modal__title" id="neuigkeitTitel">${icon('calendar')}Wo deine Opern gerade laufen</h2>
        <p>OpernLog kennt jetzt die Spielpläne der Häuser im Katalog: ${termine.toLocaleString('de-DE')} Termine an ${haeuser} Häusern, für die ganze Spielzeit.</p>
        <ul class="neuigkeit__liste">
          <li><strong>Wunschliste:</strong> Unter jedem Werk steht, wo es demnächst läuft – mit deinem Standort die nächsten Häuser zuerst.</li>
          <li><strong>Jedes Werk:</strong> „Aktuelle Termine“ neben „Schon gesehen“ zeigt alle Häuser und Termine.</li>
          <li>Ein Tipp auf ein Haus führt zu dessen Spielplan und zu den Karten.</li>
        </ul>
        <p class="form-hint">Stand ${Number(t)}.${Number(m)}.${j}. Maßgeblich ist die Seite des Hauses.</p>
        <div class="form-actions">
          <a href="#/wishlist" class="btn btn--primary" id="neuigkeitWunschliste">Zur Wunschliste</a>
          <button type="button" class="btn btn--outline" id="neuigkeitSchliessen">Schließen</button>
        </div>
      </div>`;

    const schliessen = () => {
        gesehen();
        modal.remove();
    };
    modal.querySelector('#neuigkeitSchliessen').addEventListener('click', schliessen);
    modal.querySelector('.modal__overlay').addEventListener('click', schliessen);
    // Der Link führt selbst zur Wunschliste; das Fenster geht dabei zu.
    modal.querySelector('#neuigkeitWunschliste').addEventListener('click', schliessen);

    document.body.appendChild(modal);
    return modal;
}
