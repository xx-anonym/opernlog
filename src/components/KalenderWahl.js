// Die Termine eines Werks an einem Haus: antippen für die Kalenderdatei,
// "Vormerken" für die geplanten Besuche (src/data/geplant.js).
//
// Aufgerufen vom Kalender-Knopf neben einem Haus in "Läuft demnächst"
// (SpielplanBlock.js). Die Datei selbst baut src/kalender.js. Vormerken gibt
// es nur mit Konto – die Pläne liegen in der Datenbank.
//
// Unten außerdem das Lesezeichen für die Abend-Zeilen in "In der Nähe" und
// "Demnächst hier" auf der Seite eines Hauses: dort steht jeder Abend
// einzeln, mit eigenem Kalender-Knopf, ohne dieses Fenster.

import { icon } from './Icon.js';
import { showToast, runWithFeedback } from './Toast.js';
import { store } from '../store/store.js';
import { escapeHTML } from '../utils.js';
import { spielplan } from '../data/spielplan.js';
import { operas } from '../data/operas.js';
import { operaHouses } from '../data/operaHouses.js';
import { heuteIso, terminMitWochentag, zeitText } from '../data/spielplanAbfrage.js';
import { kalenderEintrag, kalenderDateiname, kalenderHerunterladen } from '../kalender.js';
import { tippen } from '../haptik.js';

/** Hängt das Fenster an und gibt es zurück – oder null, wenn es nichts zu wählen gibt. */
export function kalenderWahl(werkId, hausId, { daten = spielplan, heute = heuteIso(), herunterladen = kalenderHerunterladen, mitKonto = store.hatKonto } = {}) {
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
        <h2 class="modal__title" id="kalenderWahlTitel">${icon('calendar')}Termine</h2>
        <p class="kalender-wahl__was">${escapeHTML(werk.title)} · ${escapeHTML(haus.name)}, ${escapeHTML(haus.city || '')}</p>
        <div class="kalender-wahl__liste">
          ${termine.map(t => `
            <div class="kalender-wahl__zeile">
              <button type="button" class="kalender-wahl__tag" data-datum="${t}" title="In den Kalender">
                <span>${terminMitWochentag(t, heute)}</span>
                <span class="kalender-wahl__zeit">${escapeHTML(zeitText(eintrag.zeiten?.[t]) || 'Uhrzeit offen')}</span>
              </button>
              ${mitKonto ? vormerkKnopf(t, !!store.planFuer(werkId, hausId, t)) : ''}
            </div>`).join('')}
        </div>
        <p class="form-hint">Termin antippen: Kalendereintrag mit Ort, Uhrzeit und Link zum Haus.</p>
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

    // Ein Zuhörer für alle "Vormerken"-Knöpfe; der Knopf schaltet an Ort und
    // Stelle um, das Fenster bleibt offen – man merkt sich oft zwei Abende.
    modal.querySelector('.kalender-wahl__liste').addEventListener('click', async (e) => {
        const knopf = e.target.closest('.kalender-wahl__vormerken');
        if (!knopf || knopf.disabled) return;
        const datum = knopf.dataset.datum;
        knopf.disabled = true;
        const an = await vormerkungUmschalten({ operaId: werkId, houseId: hausId, datum, zeit: eintrag.zeiten?.[datum] });
        knopf.disabled = false;
        if (an !== null) zeigeVormerkung(knopf, an);
    });

    document.body.appendChild(modal);
    return modal;
}

function vormerkKnopf(datum, vorgemerkt) {
    return `<button type="button" class="kalender-wahl__vormerken${vorgemerkt ? ' kalender-wahl__vormerken--an' : ''}" data-haptik data-datum="${datum}"
      aria-pressed="${vorgemerkt}">${vorgemerkt ? '✓ Vorgemerkt' : 'Vormerken'}</button>`;
}

function zeigeVormerkung(knopf, vorgemerkt) {
    knopf.classList.toggle('kalender-wahl__vormerken--an', vorgemerkt);
    knopf.setAttribute('aria-pressed', String(vorgemerkt));
    knopf.textContent = vorgemerkt ? '✓ Vorgemerkt' : 'Vormerken';
}

/**
 * Merkt einen Abend vor oder nimmt die Vormerkung zurück, mit Meldung.
 * Gibt den neuen Stand zurück (true = vorgemerkt), null wenn es nicht
 * geklappt hat.
 */
async function vormerkungUmschalten({ operaId, houseId, datum, zeit }) {
    tippen();
    const plan = store.planFuer(operaId, houseId, datum);
    const ok = await runWithFeedback(
        () => plan ? store.planEntfernen(plan.id) : store.vormerken({ operaId, houseId, datum, zeit }),
        { failure: plan ? 'Vormerkung ließ sich nicht entfernen' : 'Vormerken hat nicht geklappt' },
    );
    if (!ok) return null;
    showToast(plan ? 'Vormerkung entfernt' : 'Vorgemerkt – steht jetzt auf deiner Startseite');
    return !plan;
}

// ── Lesezeichen in den Abend-Zeilen ────────────────────────────────────
//
// Die Zeilen sind schmal; neben dem Kalender-Knopf steht deshalb nur ein
// Zeichen, gefüllt, wenn der Abend vorgemerkt ist.

/** Das Lesezeichen für eine Abend-Zeile – ohne Konto nichts. */
export function vormerkZeichen(werk, haus, datum) {
    if (!store.hatKonto) return '';
    const an = !!store.planFuer(werk.id, haus.id, datum);
    return `<button type="button" class="naehe-abend__vormerken${an ? ' naehe-abend__vormerken--an' : ''}" data-haptik
      data-werk="${escapeHTML(werk.id)}" data-haus="${escapeHTML(haus.id)}" data-datum="${datum}" aria-pressed="${an}"
      title="${an ? 'Vorgemerkt' : 'Vormerken'}" aria-label="${escapeHTML(`Vormerken: ${werk.title}, ${haus.name}`)}">${icon('bookmark', { filled: an })}</button>`;
}

/** Klick auf ein Lesezeichen; zeit aus dem Spielplan, für die Startseite. */
export async function vormerkZeichenUmschalten(knopf, zeit) {
    if (knopf.disabled) return;
    const { werk, haus, datum } = knopf.dataset;
    knopf.disabled = true;
    const an = await vormerkungUmschalten({ operaId: werk, houseId: haus, datum, zeit });
    knopf.disabled = false;
    if (an === null) return;
    knopf.classList.toggle('naehe-abend__vormerken--an', an);
    knopf.setAttribute('aria-pressed', String(an));
    knopf.title = an ? 'Vorgemerkt' : 'Vormerken';
    knopf.innerHTML = icon('bookmark', { filled: an });
}
