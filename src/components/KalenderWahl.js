// "In den Kalender": einen Abend wählen, dann entsteht die Kalenderdatei.
//
// Aufgerufen vom Kalender-Knopf neben einem Haus in "Läuft demnächst"
// (SpielplanBlock.js). Die Datei selbst baut src/kalender.js.

import { icon } from './Icon.js';
import { showToast } from './Toast.js';
import { escapeHTML } from '../utils.js';
import { spielplan } from '../data/spielplan.js';
import { operas } from '../data/operas.js';
import { operaHouses } from '../data/operaHouses.js';
import { heuteIso, terminMitWochentag, zeitText } from '../data/spielplanAbfrage.js';
import { kalenderEintrag, kalenderDateiname, kalenderHerunterladen } from '../kalender.js';

/** Hängt das Fenster an und gibt es zurück – oder null, wenn es nichts zu wählen gibt. */
export function kalenderWahl(werkId, hausId, { daten = spielplan, heute = heuteIso(), herunterladen = kalenderHerunterladen } = {}) {
    const eintrag = daten.find(e => e.werk === werkId && e.haus === hausId);
    const werk = operas.find(o => o.id === werkId);
    const haus = operaHouses.find(h => h.id === hausId);
    const termine = (eintrag?.termine || []).filter(t => t >= heute);
    if (!eintrag || !werk || !haus || !termine.length) return null;

    const modal = document.createElement('div');
    modal.className = 'modal modal--active kalender-wahl';
    modal.innerHTML = `
      <div class="modal__overlay"></div>
      <div class="modal__content" role="dialog" aria-labelledby="kalenderWahlTitel">
        <h2 class="modal__title" id="kalenderWahlTitel">${icon('calendar')}In den Kalender</h2>
        <p class="kalender-wahl__was">${escapeHTML(werk.title)} · ${escapeHTML(haus.name)}, ${escapeHTML(haus.city || '')}</p>
        <div class="kalender-wahl__liste">
          ${termine.map(t => `
            <button type="button" class="kalender-wahl__tag" data-datum="${t}">
              <span>${terminMitWochentag(t, heute)}</span>
              <span class="kalender-wahl__zeit">${escapeHTML(zeitText(eintrag.zeiten?.[t]) || 'Uhrzeit offen')}</span>
            </button>`).join('')}
        </div>
        <p class="form-hint">Es entsteht ein Kalendereintrag mit Ort, Uhrzeit und dem Link zum Haus.</p>
        <div class="form-actions">
          <button type="button" class="btn btn--outline" id="kalenderWahlAbbrechen">Abbrechen</button>
        </div>
      </div>`;

    const schliessen = () => modal.remove();
    modal.querySelector('#kalenderWahlAbbrechen').addEventListener('click', schliessen);
    modal.querySelector('.modal__overlay').addEventListener('click', schliessen);
    modal.querySelectorAll('.kalender-wahl__tag').forEach(knopf => {
        knopf.addEventListener('click', () => {
            const datum = knopf.dataset.datum;
            const text = kalenderEintrag({ werk, haus, datum, zeit: eintrag.zeiten?.[datum], url: eintrag.url });
            herunterladen(text, kalenderDateiname(werk, haus, datum));
            schliessen();
            showToast('Kalendereintrag erstellt');
        });
    });

    document.body.appendChild(modal);
    return modal;
}
