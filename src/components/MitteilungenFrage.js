// Die Frage nach Mitteilungen beim ersten Anmelden eines neuen Kontos.
//
// Ein eigenes Fenster statt der Erlaubnisfrage des Systems: das iPhone fragt
// nur ein einziges Mal, und wer dort "Nicht erlauben" tippt, muss es später
// in den Einstellungen suchen. Hier steht vorher, wofür, und "Später" lässt
// alles offen – eingeschaltet wird dann unter "Profil bearbeiten".
//
// Ob die Frage fällig ist, entscheidet mitteilungenFrageFaellig() in push.js.

import * as sb from '../store/supabase.js';
import { icon } from './Icon.js';
import { showToast } from './Toast.js';
import { pushEinschalten, mitteilungenFrageErledigt } from '../push.js';

const STANDARD = {
    schluessel: () => sb.pushSchluessel(),
    einschalten: (schluessel) => pushEinschalten({ schluessel }),
    erledigt: () => mitteilungenFrageErledigt(),
};

/** Hängt das Fenster an und gibt es zurück. */
export function mitteilungenFrage(dienste = {}) {
    const d = { ...STANDARD, ...dienste };

    // Vorab: Safari stellt seine Erlaubnisfrage nur direkt nach dem Tippen.
    let schluessel = null;
    Promise.resolve().then(() => d.schluessel()).then(s => { schluessel = s; }).catch(() => {});

    const modal = document.createElement('div');
    modal.className = 'modal modal--active mitteilungen-frage';
    modal.innerHTML = `
      <div class="modal__overlay"></div>
      <div class="modal__content" role="dialog" aria-labelledby="mitteilungenFrageTitel">
        <h2 class="modal__title" id="mitteilungenFrageTitel">${icon('bell')}Mitteilungen einschalten?</h2>
        <p>OpernLog meldet sich, wenn</p>
        <ul class="mitteilungen-frage__liste">
          <li>dir jemand eine Freundschaftsanfrage schickt oder deine Einladung annimmt,</li>
          <li>jemand deine Review liked oder kommentiert,</li>
          <li>ein Werk deiner Wunschliste neu im Spielplan eines Hauses steht,</li>
          <li>am 31. Juli dein Saisonrückblick fertig ist.</li>
        </ul>
        <p class="form-hint">Ändern lässt sich das jederzeit unter „Profil bearbeiten“.</p>
        <div class="form-actions">
          <button type="button" class="btn btn--primary" id="mitteilungenFrageJa">Mitteilungen einschalten</button>
          <button type="button" class="btn btn--outline" id="mitteilungenFrageSpaeter">Später</button>
        </div>
      </div>`;

    const schliessen = () => {
        d.erledigt();
        modal.remove();
    };

    modal.querySelector('#mitteilungenFrageSpaeter').addEventListener('click', schliessen);
    modal.querySelector('.modal__overlay').addEventListener('click', schliessen);

    const ja = modal.querySelector('#mitteilungenFrageJa');
    ja.addEventListener('click', async () => {
        ja.disabled = true;
        try {
            const ergebnis = await d.einschalten(schluessel);
            if (ergebnis === 'an') showToast('Mitteilungen sind eingeschaltet');
        } catch (err) {
            console.error('Mitteilungen einschalten', err);
            showToast('Mitteilungen ließen sich nicht einschalten – versuch es unter „Profil bearbeiten“.', 'error');
        }
        // Egal wie es ausging: gefragt ist gefragt. Wer abgelehnt hat, soll
        // nicht bei jedem Start wieder gefragt werden.
        schliessen();
    });

    document.body.appendChild(modal);
    return modal;
}
