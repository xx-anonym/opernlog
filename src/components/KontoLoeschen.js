// Das eigene Konto endgültig löschen.
//
// Anders als beim Katalog gibt es hier nichts abzuwägen: wer gehen will, darf
// gehen, und zwar vollständig. Aufhalten soll das Modal niemanden – es soll
// nur verhindern, dass jemand aus Versehen geht.
//
// Deshalb drei Sicherungen:
//
//   1. Der Schalter steht unten im Profil, nicht neben "Abmelden".
//   2. Das Modal zählt vorher auf, was verloren geht. Wer sieben Abende und
//      zwei Listen schwarz auf weiß sieht, überlegt es sich anders als jemand,
//      dem nur "wirklich löschen?" entgegengehalten wird.
//   3. Der Benutzername muss abgetippt sein, bevor der Knopf aufgeht.
//
// Was NICHT mitgeht, steht ebenfalls im Modal: selbst angelegte Katalog-
// einträge bleiben. Ein Werk soll nicht aus dem Katalog verschwinden, weil
// derjenige geht, der es eingetragen hat.

import { kontoLoeschen } from '../store/supabase.js';
import { store } from '../store/store.js';
import { escapeHTML } from '../utils.js';

/**
 * @param benutzername  muss abgetippt werden
 * @param bestand       { abende, markierungen, listen } – was verloren geht
 *
 * Freundschaften stehen bewusst nicht in der Liste: es gibt keine synchrone
 * Quelle dafür, und eine still gebliebene Null wäre schlimmer als die fehlende
 * Zeile. Dass sie mitgelöscht werden, sagt der Satz über die Endgültigkeit.
 * @param dienste       nur für Tests austauschbar
 */
export function kontoLoeschModal(benutzername, bestand = {}, dienste = {}) {
    const loeschen = dienste.kontoLoeschen ?? kontoLoeschen;
    const abmelden = dienste.abmelden ?? (() => store.logout());
    const weiter = dienste.weiter ?? (() => {
        window.location.hash = '#/auth';
        window.location.reload();
    });

    const zeilen = [
        [bestand.abende, 'geloggter Abend', 'geloggte Abende'],
        [bestand.markierungen, 'als gesehen markiertes Werk', 'als gesehen markierte Werke'],
        [bestand.listen, 'Liste', 'Listen'],
    ].filter(([n]) => n > 0)
     .map(([n, eins, viele]) => `<li>${n} ${escapeHTML(n === 1 ? eins : viele)}</li>`)
     .join('');

    const modal = document.createElement('div');
    modal.className = 'modal modal--active';
    modal.innerHTML = `
        <div class="modal__overlay"></div>
        <div class="modal__content">
            <h2 class="modal__title">Konto löschen</h2>
            <p style="margin-bottom:1rem">
                Das ist endgültig. Es gibt keinen Weg zurück und keine Sicherung.
            </p>
            ${zeilen ? `<p class="form-hint" style="margin-bottom:.5rem">Verloren geht:</p>
            <ul class="konto-loeschen__liste">${zeilen}</ul>` : ''}
            <p class="form-hint" style="margin:1rem 0">
                Werke und Häuser, die du zum Katalog hinzugefügt hast, bleiben stehen –
                sie gehören inzwischen allen. Nur dein Name daran verschwindet.
            </p>
            <div class="form-group">
                <label class="form-label" for="klkName">
                    Zum Bestätigen deinen Benutzernamen eintippen
                </label>
                <input class="input" type="text" id="klkName" autocomplete="off" />
                <p class="form-hint">Genau so: <strong>${escapeHTML(benutzername)}</strong></p>
            </div>
            <div id="klkFehler" class="auth-error" style="display:none"></div>
            <div class="modal__actions" style="margin-top:1.5rem">
                <button type="button" class="btn btn--secondary close-modal">Abbrechen</button>
                <button type="button" class="btn btn--primary" id="klkLoeschen" disabled>Konto löschen</button>
            </div>
        </div>`;

    const q = (w) => modal.querySelector(w);
    const knopf = q('#klkLoeschen');
    const feld = q('#klkName');

    feld.addEventListener('input', () => {
        knopf.disabled = feld.value.trim() !== benutzername;
    });

    knopf.addEventListener('click', async () => {
        knopf.disabled = true;
        knopf.textContent = 'Wird gelöscht…';
        try {
            await loeschen();
            // Erst danach abmelden: schlägt das Löschen fehl, soll die Sitzung
            // stehen bleiben, damit man es noch einmal versuchen kann.
            await abmelden();
            weiter();
        } catch (e) {
            q('#klkFehler').textContent = `Löschen fehlgeschlagen: ${e.userMessage || e.message}`;
            q('#klkFehler').style.display = 'block';
            knopf.disabled = false;
            knopf.textContent = 'Konto löschen';
        }
    });

    modal.querySelectorAll('.close-modal').forEach(b => b.addEventListener('click', () => modal.remove()));
    q('.modal__overlay').addEventListener('click', () => modal.remove());

    setTimeout(() => feld.focus(), 0);
    return modal;
}
