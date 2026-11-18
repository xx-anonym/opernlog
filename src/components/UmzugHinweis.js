// Der Hinweis für die installierte App unter der alten Adresse (src/umzug.js).
//
// Das Fenster der App vom Home-Bildschirm gehört zu opernlog.vercel.app; dorthin
// weiterleiten geht nicht. Der Knopf öffnet opernlog.de im Browser – am
// iPhone im echten Safari (x-safari-https:, wie bei den Kalenderdateien),
// sonst öffnete sich nur ein Blatt im App-Fenster, aus dem man die App nicht
// hinzufügen kann. Knapp gehalten: zwei Sätze, ein Knopf.

import { NEUE_ADRESSE } from '../umzug.js';
import { geraetArt } from '../installHinweis.js';

/** Hängt das Fenster an und gibt es zurück. */
export function umzugHinweisFenster({ umgebung = globalThis } = {}) {
    const ios = geraetArt(umgebung) === 'ios';
    const modal = umgebung.document.createElement('div');
    modal.className = 'modal modal--active umzug-hinweis';
    modal.innerHTML = `
      <div class="modal__overlay"></div>
      <div class="modal__content" role="dialog" aria-labelledby="umzugTitel">
        <h2 class="modal__title" id="umzugTitel">OpernLog ist umgezogen</h2>
        <p>Die App wohnt jetzt unter <strong>opernlog.de</strong>. Öffne die neue Adresse,
        füge sie ${ios ? 'über „Teilen“ → „Zum Home-Bildschirm“' : 'wieder zum Startbildschirm'} hinzu
        und melde dich dort einmal an. Dein Tagebuch ist schon da. Diese App kannst du danach löschen.</p>
        <div class="form-actions">
          <a class="btn btn--primary" id="umzugOeffnen" href="${ios ? `x-safari-${NEUE_ADRESSE}/` : `${NEUE_ADRESSE}/`}"
             ${ios ? '' : 'target="_blank" rel="noopener"'}>opernlog.de öffnen</a>
          <button type="button" class="btn btn--outline" id="umzugSpaeter">Später</button>
        </div>
      </div>`;

    const zu = () => modal.remove();
    modal.querySelector('#umzugSpaeter').addEventListener('click', zu);
    modal.querySelector('.modal__overlay').addEventListener('click', zu);

    umgebung.document.body.appendChild(modal);
    return modal;
}
