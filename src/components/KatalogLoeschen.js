// Einen Katalogeintrag wieder entfernen.
//
// Löschen ist hier etwas anderes als bei einem Tagebucheintrag: der Katalog
// gehört allen. Verschwindet ein Werk, verschwindet es auch aus dem Tagebuch
// jedes anderen, der es geloggt hat – dort stünde dann ein Abend zu einem
// Werk, das es nicht mehr gibt.
//
// Deshalb vier Sicherungen statt eines confirm():
//
//   1. Der Schalter steht nur auf der Detailseite. Man muss den Eintrag also
//      geöffnet haben, den man entfernt.
//   2. Er erscheint nur bei Einträgen aus der Datenbank. Was als Datei im Repo
//      liegt, kann die App gar nicht löschen.
//   3. Vorher wird gezählt, was daran hängt: Besuche, Gesehen-Markierungen,
//      Listen. Ist etwas dabei, wird nicht gelöscht, sondern erklärt.
//   4. Erst wenn der Titel Zeichen für Zeichen abgetippt ist, lässt sich der
//      Knopf drücken.

import { katalogVerweise, deleteKatalogWerk, deleteKatalogHaus } from '../store/supabase.js';
import { entfernen } from '../data/katalogZusatz.js';
import { escapeHTML } from '../utils.js';

/**
 * @param art      'werk' oder 'haus'
 * @param eintrag  der Katalogeintrag, wie er in operas/operaHouses steht
 * @param fertig   wird nach dem Löschen gerufen
 * @param dienste  nur für Tests austauschbar
 */
export function loeschModal(art, eintrag, fertig, dienste = {}) {
    const zaehle = dienste.katalogVerweise ?? katalogVerweise;
    const loesche = dienste.loeschen
        ?? (art === 'werk' ? deleteKatalogWerk : deleteKatalogHaus);

    const name = art === 'werk' ? eintrag.title : eintrag.name;
    const wort = art === 'werk' ? 'Werk' : 'Haus';

    const modal = document.createElement('div');
    modal.className = 'modal modal--active';
    modal.innerHTML = `
        <div class="modal__overlay"></div>
        <div class="modal__content">
            <h2 class="modal__title">${escapeHTML(wort)} aus dem Katalog entfernen</h2>
            <p style="margin-bottom:1rem">
                <strong>${escapeHTML(name)}</strong> verschwindet damit für alle, nicht nur für dich.
            </p>
            <div id="klStand" class="form-hint">Wird geprüft, was daran hängt…</div>
            <div id="klBereich" hidden>
                <div class="form-group" style="margin-top:1rem">
                    <label class="form-label" for="klTitel">
                        Zum Bestätigen den Titel eintippen
                    </label>
                    <input class="input" type="text" id="klTitel" autocomplete="off" />
                    <p class="form-hint">Genau so: <strong>${escapeHTML(name)}</strong></p>
                </div>
            </div>
            <div id="klFehler" class="auth-error" style="display:none"></div>
            <div class="modal__actions" style="margin-top:1.5rem">
                <button type="button" class="btn btn--secondary close-modal">Abbrechen</button>
                <button type="button" class="btn btn--primary" id="klLoeschen" disabled>Entfernen</button>
            </div>
        </div>`;

    const q = (w) => modal.querySelector(w);
    const knopf = q('#klLoeschen');

    function fehler(text) {
        q('#klFehler').textContent = text;
        q('#klFehler').style.display = 'block';
    }

    // Erst zählen, was daran hängt. Bis das da ist, bleibt der Knopf gesperrt.
    zaehle(art, eintrag.id).then(({ besuche, markierungen, listen }) => {
        const haengt = [];
        if (besuche) haengt.push(`${besuche} ${besuche === 1 ? 'geloggter Abend' : 'geloggte Abende'}`);
        if (markierungen) haengt.push(`${markierungen} ${markierungen === 1 ? 'Gesehen-Markierung' : 'Gesehen-Markierungen'}`);
        if (listen) haengt.push(`${listen} ${listen === 1 ? 'Liste' : 'Listen'}`);

        if (haengt.length) {
            // Nicht löschen. Ein Abend im Tagebuch eines anderen, der auf ein
            // Werk zeigt, das es nicht mehr gibt, ist schlimmer als ein Werk
            // zu viel im Katalog.
            q('#klStand').innerHTML =
                `Daran hängt schon etwas: <strong>${escapeHTML(haengt.join(', '))}</strong>. `
                + 'Solange das so ist, wird nichts entfernt – die Einträge zeigten sonst ins Leere, '
                + 'auch bei anderen Leuten.';
            q('#klStand').style.color = 'var(--accent)';
            knopf.textContent = 'Geht nicht';
            // Das Eingabefeld ganz entfernen, nicht bloß verbergen. Ein
            // verborgenes Feld ist immer noch da, und dass daran kein Listener
            // hängt, wäre eine Zusicherung, die beim nächsten Umbau still
            // wegfällt.
            q('#klBereich').remove();
            return;
        }

        q('#klStand').textContent = 'Niemand hat dieses '
            + (art === 'werk' ? 'Werk geloggt oder als gesehen markiert.' : 'Haus besucht.');
        q('#klBereich').hidden = false;

        // Der Knopf öffnet sich erst, wenn der Titel steht.
        const feld = q('#klTitel');
        feld.addEventListener('input', () => {
            knopf.disabled = feld.value.trim() !== name;
        });
        feld.focus();
    }).catch(e => {
        q('#klStand').textContent = '';
        fehler(`Konnte nicht prüfen, was daran hängt: ${e.message}. Es wird nichts entfernt.`);
    });

    knopf.addEventListener('click', async () => {
        knopf.disabled = true;
        knopf.textContent = 'Wird entfernt…';
        try {
            await loesche(eintrag.id);
            entfernen(art, eintrag.id);
            modal.remove();
            fertig?.();
        } catch (e) {
            fehler(`Entfernen fehlgeschlagen: ${e.message}`);
            knopf.disabled = false;
            knopf.textContent = 'Entfernen';
        }
    });

    modal.querySelectorAll('.close-modal').forEach(b => b.addEventListener('click', () => modal.remove()));
    q('.modal__overlay').addEventListener('click', () => modal.remove());

    return modal;
}

/**
 * Der Schalter für die Detailseite. Gibt null zurück, wenn er dort nicht
 * hingehört – also bei allem, was aus dem Repo stammt, und bei jedem, der
 * kein Admin ist.
 */
export function loeschSchalter(art, eintrag, istAdminJetzt, fertig) {
    if (!istAdminJetzt || !eintrag?.ausDatenbank) return null;

    const knopf = document.createElement('button');
    knopf.className = 'btn btn--secondary btn--sm';
    knopf.id = 'katalogLoeschenBtn';
    knopf.textContent = 'Aus dem Katalog entfernen';
    knopf.style.marginTop = '1rem';
    knopf.addEventListener('click', () => {
        document.body.appendChild(loeschModal(art, eintrag, fertig));
    });
    return knopf;
}
