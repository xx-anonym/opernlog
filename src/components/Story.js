// Story: Folien bildschirmfüllend nacheinander, wie bei Instagram – für den
// Saisonrückblick (src/pages/SeasonReview.js).
//
// Oben steht je Folie ein Balken. Der laufende füllt sich in --story-dauer
// (style.css), dann kommt die nächste Folie; die letzte bleibt stehen.
// Antippen rechts blättert vor, links zurück, Gedrückthalten hält an.
// Pfeiltasten und Leertaste gehen auch, Escape schließt. Wer weniger
// Bewegung eingestellt hat, blättert selbst: dann läuft nichts von allein.
//
// Das Fenster ist ein .modal mit .modal__overlay. So schließt die
// Zurück-Geste es wie jedes andere Fenster (src/zurueckGeste.js).

import { escapeHTML } from '../utils.js';

// So lange muss man drücken, damit es als Halten zählt und nicht als Tippen.
const HALTEN_MS = 220;
// Hintergründe der Folien, reihum (style.css: .story__folie--0 bis --4).
const HINTERGRUENDE = 5;

/**
 * @param {Array<{html: string, nachbau?: (folie: HTMLElement) => void}>} folien
 * @param {{titel?: string, start?: number}} [optionen]
 * @returns {{schliessen: () => void, zeige: (nr: number) => void}}
 */
export function storyOeffnen(folien, { titel = 'Story', start = 0 } = {}) {
    let nr = 0;
    let haltTimer = null;
    let gehalten = false;

    const modal = document.createElement('div');
    modal.className = 'modal modal--active story';
    modal.innerHTML = `
      <div class="modal__overlay"></div>
      <div class="story__buehne" role="dialog" aria-modal="true" aria-label="${escapeHTML(titel)}" tabindex="-1">
        <div class="story__balken"></div>
        <button type="button" class="story__zu" aria-label="Schließen">✕</button>
        <button type="button" class="story__zone story__zone--zurueck" aria-label="Zurück"></button>
        <button type="button" class="story__zone story__zone--weiter" aria-label="Weiter"></button>
        <div class="story__folie" aria-live="polite"></div>
      </div>`;
    const buehne = modal.querySelector('.story__buehne');
    const balken = modal.querySelector('.story__balken');
    const folie = modal.querySelector('.story__folie');

    function zeige(neu) {
        nr = Math.max(0, Math.min(folien.length - 1, neu));
        balken.innerHTML = folien.map((_, i) => `<span class="story__teil${i < nr ? ' story__teil--voll' : i === nr ? ' story__teil--jetzt' : ''}"><i></i></span>`).join('');
        folie.className = `story__folie story__folie--${nr % HINTERGRUENDE}`;
        folie.innerHTML = folien[nr].html;
        folien[nr].nachbau?.(folie);
        modal.dataset.folie = String(nr);
    }

    const anhalten = (ja) => modal.classList.toggle('story--angehalten', ja);

    function schliessen() {
        clearTimeout(haltTimer);
        modal.remove();
        document.documentElement.classList.remove('story-offen');
        document.removeEventListener('keydown', taste);
        document.removeEventListener('visibilitychange', sichtbarkeit);
    }

    function taste(e) {
        if (e.key === 'Escape') schliessen();
        else if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); zeige(nr + 1); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); zeige(nr - 1); }
    }

    // Im Hintergrund soll die Story nicht ohne einen weiterlaufen.
    const sichtbarkeit = () => anhalten(document.hidden);

    // Der laufende Balken ist voll: nächste Folie.
    balken.addEventListener('animationend', (e) => {
        if (e.target.closest('.story__teil--jetzt') && nr < folien.length - 1) zeige(nr + 1);
    });

    buehne.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.story__zu, .story__folie a, .story__folie button')) return;
        gehalten = false;
        clearTimeout(haltTimer);
        haltTimer = setTimeout(() => { gehalten = true; anhalten(true); }, HALTEN_MS);
    });
    const loslassen = () => {
        clearTimeout(haltTimer);
        if (gehalten) anhalten(false);
    };
    buehne.addEventListener('pointerup', loslassen);
    buehne.addEventListener('pointercancel', loslassen);

    buehne.addEventListener('click', (e) => {
        // Nach dem Halten meldet der Browser noch einen Klick. Der blättert nicht.
        if (gehalten) { gehalten = false; return; }
        if (e.target.closest('.story__zu')) return schliessen();
        const zone = e.target.closest('.story__zone');
        if (zone) zeige(nr + (zone.classList.contains('story__zone--zurueck') ? -1 : 1));
    });
    modal.querySelector('.modal__overlay').addEventListener('click', schliessen);

    document.addEventListener('keydown', taste);
    document.addEventListener('visibilitychange', sichtbarkeit);
    document.documentElement.classList.add('story-offen');
    zeige(start);
    document.body.appendChild(modal);
    buehne.focus({ preventScroll: true });

    return { schliessen, zeige };
}
