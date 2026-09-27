// Passkeys im eigenen Profil: anlegen, ansehen, löschen.
//
// Steht über "Konto löschen" und nur dort, wo es Sinn ergibt: im eigenen
// Profil, mit Cloud-Konto, in einem Browser mit WebAuthn. Die Entscheidung
// darüber trifft Profile.js; dieser Baustein zeichnet nur.

import * as sb from '../store/supabase.js';
import { escapeHTML } from '../utils.js';
import { icon } from './Icon.js';
import { passkeyFehlertext, passkeyZeile, passkeyVermerken } from '../passkey.js';

const STANDARD = {
    liste: () => sb.listPasskeys(),
    anlegen: () => sb.registerPasskey(),
    loeschen: (id) => sb.deletePasskey(id),
    bestaetigen: (frage) => window.confirm(frage),
};

/**
 * @param {string} nutzerId  wessen Passkeys das sind – die Anmeldeseite zeigt
 *                           ihren Knopf nur für Konten, die hier welche hatten
 * @param {object} [dienste] für Tests austauschbar: liste, anlegen, loeschen, bestaetigen
 * @returns {HTMLElement}
 */
export function passkeyBereich(nutzerId, dienste = {}) {
    const d = { ...STANDARD, ...dienste };

    // Eine schlichte Zeile wie Mitteilungen darüber: Titel links, Anlegen
    // rechts, darunter die Passkeys klein. Ohne Kasten und ohne Erklärung –
    // der Bereich war größer als alles andere im Fenster (Jonas, 27.09.2026).
    const bereich = document.createElement('section');
    bereich.className = 'passkeys konto-abschnitt';
    bereich.innerHTML = `
      <div class="konto-abschnitt__kopf">
        <h3 class="konto-abschnitt__titel">${icon('key')}Passkeys</h3>
        <button type="button" class="btn btn--ghost btn--sm" id="passkeyAnlegenBtn"
          aria-label="Passkey hinzufügen">${icon('plus')}Hinzufügen</button>
      </div>
      <ul class="passkeys__liste" aria-live="polite"></ul>
      <p class="auth-error passkeys__fehler" hidden></p>`;

    const liste = bereich.querySelector('.passkeys__liste');
    const fehlerEl = bereich.querySelector('.passkeys__fehler');
    const anlegenBtn = bereich.querySelector('#passkeyAnlegenBtn');

    const zeigeFehler = (text) => {
        fehlerEl.textContent = text || '';
        fehlerEl.hidden = !text;
    };

    async function laden() {
        let passkeys;
        try {
            passkeys = await d.liste();
        } catch (err) {
            console.error('Passkeys laden', err);
            liste.innerHTML = '';
            zeigeFehler('Deine Passkeys ließen sich nicht laden.');
            return;
        }

        // Nach jedem Laden stimmt der Vermerk für die Anmeldeseite wieder –
        // auch nach Anlegen und Löschen, die beide hier enden.
        passkeyVermerken(nutzerId, passkeys.length > 0);

        if (!passkeys.length) {
            liste.innerHTML = '<li class="passkeys__leer">Noch kein Passkey angelegt.</li>';
            return;
        }

        liste.innerHTML = passkeys.map(p => {
            const z = passkeyZeile(p);
            return `
              <li class="passkeys__zeile" title="${escapeHTML(z.angelegt)}">
                <span class="passkeys__text">
                  <span class="passkeys__name">${escapeHTML(z.name)}</span>
                  <span class="passkeys__unterzeile">${escapeHTML(z.unterzeile)}</span>
                </span>
                <button type="button" class="btn-icon passkeys__loeschen" data-id="${escapeHTML(p.id)}"
                  title="Passkey löschen">${icon('trash', { label: `${z.name} löschen` })}</button>
              </li>`;
        }).join('');
    }

    anlegenBtn.addEventListener('click', async () => {
        zeigeFehler('');
        anlegenBtn.disabled = true;
        try {
            await d.anlegen();
            await laden();
        } catch (err) {
            console.error('Passkey anlegen', err);
            zeigeFehler(passkeyFehlertext(err, 'anlegen'));
        } finally {
            anlegenBtn.disabled = false;
        }
    });

    liste.addEventListener('click', async (e) => {
        const knopf = e.target.closest('.passkeys__loeschen');
        if (!knopf) return;
        const name = knopf.closest('.passkeys__zeile').querySelector('.passkeys__name').textContent;
        // Ohne Rückfrage wäre ein verrutschter Finger auf dem Handy genug, um
        // die einzige Anmeldung ohne Passwort zu verlieren.
        if (!d.bestaetigen(`Passkey „${name}" löschen? Auf diesem Gerät kannst du dich dann nicht mehr ohne Passwort anmelden.`)) return;

        zeigeFehler('');
        knopf.disabled = true;
        try {
            await d.loeschen(knopf.dataset.id);
            await laden();
        } catch (err) {
            console.error('Passkey löschen', err);
            zeigeFehler('Der Passkey ließ sich nicht löschen.');
            knopf.disabled = false;
        }
    });

    laden();
    return bereich;
}
