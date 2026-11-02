// E-Mails im Fenster "Profil bearbeiten": ob bei einer neuen
// Freundschaftsanfrage eine Mail kommt.
//
// Anders als die Push-Mitteilungen gilt das fürs Konto, nicht fürs Gerät.
// Eingeschaltet ist es, solange niemand es abschaltet (supabase/migrations/
// mail_anfrage_migration.sql); verschickt wird von der Edge Function
// mail-senden. Jede dieser Mails verweist hierher.

import * as sb from '../store/supabase.js';
import { icon } from './Icon.js';

const STANDARD = {
    istAn: () => sb.mailBeiAnfrage(),
    setzen: (an) => sb.mailBeiAnfrageSetzen(an),
};

/**
 * @param {object} [dienste] für Tests austauschbar
 * @returns {HTMLElement}
 */
export function mailBereich(dienste = {}) {
    const d = { ...STANDARD, ...dienste };

    const bereich = document.createElement('section');
    bereich.className = 'mail-einstellungen konto-abschnitt';
    bereich.innerHTML = `
      <div class="konto-abschnitt__kopf">
        <h3 class="konto-abschnitt__titel">${icon('mail')}E-Mails</h3>
        <div class="mitteilungen__knoepfe mail-einstellungen__knoepfe"></div>
      </div>
      <p class="mail-einstellungen__stand konto-abschnitt__stand" aria-live="polite"></p>
      <p class="auth-error mitteilungen__fehler mail-einstellungen__fehler" hidden></p>`;

    const stand = bereich.querySelector('.mail-einstellungen__stand');
    const fehlerEl = bereich.querySelector('.mail-einstellungen__fehler');
    const knoepfe = bereich.querySelector('.mail-einstellungen__knoepfe');
    const zeigeFehler = (text) => { fehlerEl.textContent = text || ''; fehlerEl.hidden = !text; };

    function zeige(an) {
        stand.textContent = an
            ? 'Bei einer neuen Freundschaftsanfrage bekommst du eine Mail.'
            : 'Bei Freundschaftsanfragen kommt keine Mail.';
        knoepfe.innerHTML = `<button type="button" class="btn btn--ghost btn--sm" id="mailAnfrageBtn">${an ? 'Ausschalten' : 'Einschalten'}</button>`;
        const knopf = knoepfe.querySelector('#mailAnfrageBtn');
        knopf.addEventListener('click', async () => {
            zeigeFehler('');
            knopf.disabled = true;
            try {
                await d.setzen(!an);
                zeige(!an);
            } catch (err) {
                console.error('Mail-Einstellung speichern', err);
                zeigeFehler(err?.userMessage || 'Ließ sich nicht speichern. Bitte versuch es noch einmal.');
                knopf.disabled = false;
            }
        });
    }

    stand.textContent = 'Wird geprüft …';
    Promise.resolve().then(() => d.istAn())
        .then(an => zeige(an !== false))
        .catch(err => {
            // Ohne Stand lieber keinen Knopf: er schaltete womöglich das
            // Gegenteil dessen, was eingestellt ist.
            console.error('Mail-Einstellung lesen', err);
            stand.textContent = 'Ließ sich gerade nicht laden.';
        });

    return bereich;
}
