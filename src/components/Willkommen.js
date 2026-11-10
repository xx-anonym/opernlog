// "Was hast du schon gesehen?" – das Karussell beim ersten Anmelden.
//
// Wer neu ist, hat Jahre an Opernabenden hinter sich, aber ein leeres
// Tagebuch. Hier tippt er an, welche der meistgespielten Werke er schon auf
// der Bühne erlebt hat. Das ist "gesehen", nicht "geloggt": es entsteht kein
// Abend, nur die Markierung (seen_operas), aus der "Was dir noch fehlt" und
// der Stand je Komponist werden. Die Startseite ist danach nicht mehr leer.
//
// Jedes Antippen wird sofort gespeichert – wer mittendrin aufhört, verliert
// nichts. Ob das Fenster fällig ist, entscheidet willkommenFaellig() in
// src/willkommen.js; die Auswahl der Werke steht in src/data/beliebt.js.
//
// Ein .modal mit .modal__overlay, damit die Zurück-Geste es schließt
// (src/zurueckGeste.js).

import { beliebteWerke } from '../data/beliebt.js';
import { composerVerlauf } from '../data/composerFarben.js';
import { kurzname } from '../data/composers.js';
import { store } from '../store/store.js';
import { coverBackground, escapeHTML } from '../utils.js';
import { tippen } from '../haptik.js';
import { icon } from './Icon.js';
import { showError } from './Toast.js';
import { willkommenErledigt } from '../willkommen.js';

const STANDARD = {
    werke: () => beliebteWerke(24),
    istGesehen: id => store.isSeenOpera(id),
    merken: id => store.markSeenOpera(id),
    vergessen: id => store.unmarkSeenOpera(id),
    erledigt: () => willkommenErledigt(store._profile?.id),
    name: () => store._profile?.username || '',
};

// Wie lange das Siegel zu sehen ist, bevor die nächste Karte kommt.
const WEITER_NACH = 420;

const ruhig = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

function fertigText(n) {
    if (!n) return 'Überspringen';
    return n === 1 ? 'Weiter mit einem Werk' : `Weiter mit ${n} Werken`;
}

/**
 * Hängt das Fenster an und gibt es zurück.
 * @param {object} [o]
 * @param {(anzahl: number) => void} [o.onFertig]  nach dem Schließen
 */
export function willkommenFenster({ onFertig, ...dienste } = {}) {
    const d = { ...STANDARD, ...dienste };
    const werke = d.werke();
    const gesehen = new Set(werke.filter(w => d.istGesehen(w.id)).map(w => w.id));
    const name = d.name();

    const karte = (w, i) => `
      <button type="button" class="willkommen__karte${gesehen.has(w.id) ? ' willkommen__karte--gesehen' : ''}"
              data-werk="${escapeHTML(w.id)}" data-nr="${i}" aria-pressed="${gesehen.has(w.id)}"
              aria-label="${escapeHTML(`${w.title} von ${w.composer}`)}">
        <span class="willkommen__bild" style="${coverBackground(w.image, composerVerlauf(w.composer), 'rgba(8,9,11,0) 38%, rgba(8,9,11,0.94)', w.bildAusschnitt)}"></span>
        <span class="willkommen__siegel" aria-hidden="true">${icon('check')}</span>
        <span class="willkommen__text">
          <span class="willkommen__komponist">${escapeHTML(kurzname(w.composer))}</span>
          <span class="willkommen__werk">${escapeHTML(w.title)}</span>
        </span>
      </button>`;

    const modal = document.createElement('div');
    modal.className = 'modal modal--active willkommen';
    modal.innerHTML = `
      <div class="modal__overlay"></div>
      <div class="willkommen__buehne" role="dialog" aria-modal="true" aria-labelledby="willkommenTitel" tabindex="-1">
        <header class="willkommen__kopf">
          <span class="willkommen__kicker">${name ? `Willkommen, ${escapeHTML(name)}` : 'Willkommen'}</span>
          <h2 class="willkommen__titel" id="willkommenTitel">Was hast du schon <em>gesehen</em>?</h2>
          <p class="willkommen__zeile">Tippe an, was du schon auf der Bühne erlebt hast.</p>
        </header>
        <div class="willkommen__mitte">
          <button type="button" class="willkommen__pfeil willkommen__pfeil--zurueck" aria-label="Voriges Werk">‹</button>
          <div class="willkommen__reihe">${werke.map(karte).join('')}</div>
          <button type="button" class="willkommen__pfeil willkommen__pfeil--weiter" aria-label="Nächstes Werk">›</button>
        </div>
        <p class="willkommen__stand" aria-live="polite"></p>
        <footer class="willkommen__fuss">
          <button type="button" class="btn btn--lg willkommen__fertig"></button>
          <p class="willkommen__klein">Die meistgespielten Werke dieser Spielzeit ·
            <a href="#/bildnachweise" class="willkommen__nachweis">Bildnachweise</a></p>
        </footer>
      </div>`;

    const reihe = modal.querySelector('.willkommen__reihe');
    const karten = [...modal.querySelectorAll('.willkommen__karte')];
    const stand = modal.querySelector('.willkommen__stand');
    const fertig = modal.querySelector('.willkommen__fertig');
    let mitte = 0;
    let offen = true;

    const zeigeStand = () => {
        stand.innerHTML = `${mitte + 1} von ${karten.length}`
            + (gesehen.size ? ` · <strong>${gesehen.size} gesehen</strong>` : '');
        fertig.textContent = fertigText(gesehen.size);
        fertig.classList.toggle('btn--primary', gesehen.size > 0);
        fertig.classList.toggle('btn--outline', gesehen.size === 0);
        modal.dataset.gesehen = String(gesehen.size);
    };

    const setzeMitte = (nr) => {
        mitte = nr;
        karten.forEach((k, i) => k.classList.toggle('willkommen__karte--mitte', i === nr));
        modal.dataset.mitte = String(nr);
        zeigeStand();
    };

    /** Welche Karte der Mitte der Reihe am nächsten steht. */
    const misseMitte = () => {
        const m = reihe.scrollLeft + reihe.clientWidth / 2;
        let beste = 0;
        let abstand = Infinity;
        karten.forEach((k, i) => {
            const a = Math.abs(k.offsetLeft + k.offsetWidth / 2 - m);
            if (a < abstand) { abstand = a; beste = i; }
        });
        if (beste !== mitte) setzeMitte(beste);
    };

    const geheZu = (nr) => {
        const ziel = karten[Math.max(0, Math.min(karten.length - 1, nr))];
        if (!ziel) return;
        reihe.scrollTo({
            left: ziel.offsetLeft + ziel.offsetWidth / 2 - reihe.clientWidth / 2,
            behavior: ruhig() ? 'auto' : 'smooth',
        });
    };

    let gemessen = false;
    reihe.addEventListener('scroll', () => {
        if (gemessen) return;
        gemessen = true;
        requestAnimationFrame(() => { gemessen = false; misseMitte(); });
    }, { passive: true });

    const zeichne = (k, an) => {
        k.classList.toggle('willkommen__karte--gesehen', an);
        k.setAttribute('aria-pressed', String(an));
    };

    async function umschalten(k) {
        const id = k.dataset.werk;
        const nr = Number(k.dataset.nr);
        const an = !gesehen.has(id);
        if (an) gesehen.add(id); else gesehen.delete(id);
        zeichne(k, an);
        zeigeStand();
        tippen();
        // Erst das Siegel, dann die nächste Karte – nur beim Markieren: wer
        // eine Markierung zurücknimmt, will sehen, dass sie weg ist.
        if (an) setTimeout(() => { if (offen && mitte === nr) geheZu(nr + 1); }, WEITER_NACH);
        else if (mitte !== nr) geheZu(nr);
        try {
            await (an ? d.merken(id) : d.vergessen(id));
        } catch (e) {
            console.error('[Willkommen] Markierung nicht gespeichert', e);
            if (an) gesehen.delete(id); else gesehen.add(id);
            zeichne(k, !an);
            zeigeStand();
            showError('Das ließ sich gerade nicht speichern.');
        }
    }

    reihe.addEventListener('click', (e) => {
        const k = e.target.closest('.willkommen__karte');
        if (k) umschalten(k);
    });
    modal.querySelector('.willkommen__pfeil--zurueck').addEventListener('click', () => geheZu(mitte - 1));
    modal.querySelector('.willkommen__pfeil--weiter').addEventListener('click', () => geheZu(mitte + 1));

    const tasten = (e) => {
        if (e.key === 'ArrowRight') { e.preventDefault(); geheZu(mitte + 1); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); geheZu(mitte - 1); }
        else if (e.key === 'Escape') { e.preventDefault(); schliessen(); }
    };

    function schliessen() {
        if (!offen) return;
        offen = false;
        d.erledigt();
        document.removeEventListener('keydown', tasten);
        document.documentElement.classList.remove('willkommen-offen');
        const weg = () => { modal.remove(); onFertig?.(gesehen.size); };
        if (ruhig()) { weg(); return; }
        modal.classList.add('willkommen--geht');
        setTimeout(weg, 320);
    }

    fertig.addEventListener('click', schliessen);
    modal.querySelector('.modal__overlay').addEventListener('click', schliessen);
    // Der Link zu den Bildnachweisen führt aus dem Fenster heraus.
    modal.querySelector('.willkommen__nachweis').addEventListener('click', schliessen);
    document.addEventListener('keydown', tasten);

    document.documentElement.classList.add('willkommen-offen');
    document.body.appendChild(modal);
    setzeMitte(0);
    modal.querySelector('.willkommen__buehne').focus({ preventScroll: true });
    return modal;
}
