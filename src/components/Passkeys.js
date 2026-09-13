// Passkeys im eigenen Profil: anlegen, ansehen, löschen.
//
// Steht über "Konto löschen" und nur dort, wo es Sinn ergibt: im eigenen
// Profil, mit Cloud-Konto, in einem Browser mit WebAuthn. Die Entscheidung
// darüber trifft Profile.js; dieser Baustein zeichnet nur.

import * as sb from '../store/supabase.js';
import { escapeHTML } from '../utils.js';
import { icon } from './Icon.js';
import { passkeyFehlertext, passkeyZeile } from '../passkey.js';

const STANDARD = {
    liste: () => sb.listPasskeys(),
    anlegen: () => sb.registerPasskey(),
    loeschen: (id) => sb.deletePasskey(id),
    bestaetigen: (frage) => window.confirm(frage),
};

/**
 * @param {object} [dienste] für Tests austauschbar: liste, anlegen, loeschen, bestaetigen
 * @returns {HTMLElement}
 */
export function passkeyBereich(dienste = {}) {
    const d = { ...STANDARD, ...dienste };

    const bereich = document.createElement('section');
    bereich.className = 'passkeys';
    bereich.innerHTML = `
      <h3 class="passkeys__titel">${icon('key')}Passkeys</h3>
      <p class="form-hint passkeys__erklaerung">Anmelden mit Face ID, Fingerabdruck oder Geräte-PIN – ohne Passwort. Ein Passkey gilt für das Gerät oder den Passwortmanager, auf dem du ihn anlegst.</p>
      <ul class="passkeys__liste" aria-live="polite"></ul>
      <p class="auth-error passkeys__fehler" hidden></p>
      <button type="button" class="btn btn--outline btn--sm" id="passkeyAnlegenBtn">${icon('plus')}Passkey hinzufügen</button>`;

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

        if (!passkeys.length) {
            liste.innerHTML = '<li class="passkeys__leer">Noch kein Passkey angelegt.</li>';
            return;
        }

        liste.innerHTML = passkeys.map(p => {
            const z = passkeyZeile(p);
            return `
              <li class="passkeys__zeile">
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
