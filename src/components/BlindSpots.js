// "Was dir noch fehlt" – siehe src/data/blindSpots.js für die Auswahl.
//
// Zwei Teile:
//   Läuft demnächst   fehlende Werke der eigenen Komponisten, die bald an
//                     einem Haus im Katalog laufen – mit Bild, dem nächsten
//                     Termin und den Knöpfen Wunschliste und Schon gesehen.
//                     Aus einer Feststellung wird so eine Gelegenheit.
//   Deine Komponisten der Stand je Komponist als Balken; aufgeklappt die
//                     fehlenden Werke, die laufenden markiert.
//
// Auf der Startseite steht das offen da. Auf der Seite "Opern" über dem
// Katalog zugeklappt: dort will die Mehrheit den Katalog sehen. Wer es dort
// einmal aufklappt, findet es beim nächsten Mal offen vor.

import { blindeFlecken } from '../data/blindSpots.js';
import { composerVerlauf } from '../data/composerFarben.js';
import { kurzname } from '../data/composers.js';
import { terminKurz, heuteIso, tagePlus } from '../data/spielplanAbfrage.js';
import { store } from '../store/store.js';
import { escapeHTML, coverBackground, getCachedPosition } from '../utils.js';
import { icon } from './Icon.js';
import { runWithFeedback } from './Toast.js';

const SPEICHER = 'opernlog:blindspotsOffen';

function warOffen() {
    try {
        return localStorage.getItem(SPEICHER) === '1';
    } catch (e) {
        // localStorage fehlt im privaten Modus mancher Browser
        return false;
    }
}

function merkeOffen(offen) {
    try {
        localStorage.setItem(SPEICHER, offen ? '1' : '0');
    } catch (e) { /* siehe oben */ }
}


// Kurz beschriftet, damit beide Knöpfe auch auf dem Handy nebeneinander passen.
function wunschKnopf(id) {
    const an = store.isOnWishlist(id);
    return `<button type="button" class="btn btn--sm ${an ? 'btn--wishlist-active' : 'btn--outline'}" data-aktion="wunsch" data-werk="${escapeHTML(id)}"
        title="${an ? 'Auf der Wunschliste – zum Entfernen tippen' : 'Auf die Wunschliste'}">
        ${icon('star', { filled: an })}${an ? 'Gemerkt' : 'Merken'}</button>`;
}

/** "heute", "morgen" oder "8. Okt". */
function wann(iso, heute) {
    if (iso === heute) return 'heute';
    if (iso === tagePlus(heute, 1)) return 'morgen';
    return terminKurz(iso, heute);
}

function gelegenheit(g, heute) {
    const o = g.opera;
    const [erste, ...weitere] = g.auffuehrungen;
    const mehrereTermine = erste.termine.length > 1;
    const ort = [erste.haus.city, erste.km !== null ? `${erste.km} km` : null].filter(Boolean).join(' · ');
    const aktionen = store.hatKonto ? `
        <div class="gelegenheit__aktionen">
          ${wunschKnopf(o.id)}
          <button type="button" class="btn btn--sm btn--outline" data-aktion="gesehen" data-werk="${escapeHTML(o.id)}"
            title="Schon gesehen – für Werke, die du vor OpernLog gesehen hast">${icon('check')}Gesehen</button>
        </div>` : '';
    return `
      <article class="gelegenheit" data-werk="${escapeHTML(o.id)}">
        <a class="gelegenheit__bild" href="#/opera/${encodeURIComponent(o.id)}" tabindex="-1" aria-hidden="true"
          style="${coverBackground(o.image, composerVerlauf(o.composer), 'rgba(0,0,0,0), rgba(20,24,28,0.35)')}"></a>
        <div class="gelegenheit__inhalt">
          <a class="gelegenheit__titel" href="#/opera/${encodeURIComponent(o.id)}">${escapeHTML(o.title)}</a>
          <p class="gelegenheit__komponist">${escapeHTML(kurzname(g.composer))} · du kennst ${g.gesehen} von ${g.gesamt}</p>
          <p class="gelegenheit__termin">
            ${icon('calendar', { className: 'icon--meta' })}
            <span><strong>${mehrereTermine ? 'ab ' : ''}${wann(erste.termine[0], heute)}</strong>
            · ${escapeHTML(erste.haus.name)}${ort ? `<span class="gelegenheit__ort">${escapeHTML(ort)}</span>` : ''}</span>
          </p>
          ${weitere.length ? `<p class="gelegenheit__weitere">und an ${weitere.length} ${weitere.length === 1 ? 'weiteren Haus' : 'weiteren Häusern'}</p>` : ''}
          ${aktionen}
        </div>
      </article>`;
}

function komponistZeile(k) {
    const anteil = k.gesamt ? Math.round((k.gesehen / k.gesamt) * 100) : 0;
    const laufend = k.fehlend.filter(f => f.auffuehrungen.length).length;
    const werke = k.fehlend.map(f => `
        <a class="blindspot__work${f.auffuehrungen.length ? ' blindspot__work--laeuft' : ''}" href="#/opera/${encodeURIComponent(f.opera.id)}"
          ${f.auffuehrungen.length ? 'title="Läuft demnächst"' : ''}>${escapeHTML(f.opera.title)}</a>`).join('');
    return `
      <details class="sammlung__zeile">
        <summary class="sammlung__kopf">
          <span class="sammlung__name">${escapeHTML(k.composer)}</span>
          <span class="sammlung__zahl">${k.gesehen}<span> von ${k.gesamt}</span></span>
          <span class="sammlung__pfeil" aria-hidden="true"></span>
          <span class="sammlung__balken" role="img" aria-label="${k.gesehen} von ${k.gesamt} Werken gesehen"><i style="width: ${anteil}%"></i></span>
        </summary>
        <div class="sammlung__werke">
          ${laufend ? `<p class="sammlung__hinweis"><span class="blindspot__punkt"></span>läuft demnächst</p>` : ''}
          ${werke}
        </div>
      </details>`;
}

function inhalt(daten, heute) {
    const { gelegenheiten, komponisten } = daten;
    return `
      ${gelegenheiten.length ? `
        <p class="luecken__kopf">Läuft demnächst</p>
        <div class="gelegenheiten">${gelegenheiten.map(g => gelegenheit(g, heute)).join('')}</div>` : ''}
      <p class="luecken__kopf">Deine Komponisten</p>
      <div class="sammlung">${komponisten.map(komponistZeile).join('')}</div>`;
}

/**
 * Gibt null zurück, wenn es nichts zu zeigen gibt: wer weder Besuche noch
 * Markierungen hat, bekommt keinen leeren Kasten vorgesetzt.
 *
 * @param {Array} visits    eigene Besuche
 * @param {Array} [seenIds] ohne Besuchseintrag als gesehen markierte Werke
 * @param {object} [o]
 * @param {boolean} [o.eingeklappt]  als aufklappbare Zeile (Seite "Opern")
 */
export function BlindSpots(visits, seenIds = [], { eingeklappt = false } = {}) {
    const heute = heuteIso();
    // Nur ein schon bekannter Standort: die Startseite fragt nicht danach.
    const daten = blindeFlecken(visits, seenIds, { heute, position: getCachedPosition() });
    if (!daten.komponisten.length && !daten.allesGesehen) return null;

    // Für einen einzigen Satz lohnt kein Kasten.
    if (daten.allesGesehen) {
        const notiz = document.createElement('p');
        notiz.className = 'blindspots__done';
        notiz.innerHTML = `${icon('check', { className: 'icon--meta' })}`
            + `Von deinen Komponisten hast du alles gesehen, was der Katalog kennt.`;
        return notiz;
    }

    let el;
    if (eingeklappt) {
        el = document.createElement('details');
        el.className = 'form-collapse blindspots';
        el.open = warOffen();
        el.addEventListener('toggle', () => merkeOffen(el.open));
        const n = daten.gelegenheiten.length;
        el.innerHTML = `
          <summary class="form-collapse__summary">
            ${icon('trending', { className: 'icon--meta' })}Was dir noch fehlt
            <span class="form-collapse__optional">${n ? `${n} ${n === 1 ? 'läuft' : 'laufen'} demnächst` : `${daten.komponisten.length} ${daten.komponisten.length === 1 ? 'Komponist' : 'Komponisten'}`}</span>
          </summary>
          <div class="form-collapse__body luecken">${inhalt(daten, heute)}</div>`;
    } else {
        el = document.createElement('div');
        el.className = 'luecken blindspots';
        el.innerHTML = inhalt(daten, heute);
    }

    el.addEventListener('click', async (e) => {
        const knopf = e.target.closest('button[data-aktion]');
        if (!knopf) return;
        const id = knopf.dataset.werk;
        knopf.disabled = true;
        if (knopf.dataset.aktion === 'wunsch') {
            const war = store.isOnWishlist(id);
            const ok = await runWithFeedback(
                () => war ? store.removeFromWishlist(id) : store.addToWishlist(id),
                { failure: war ? 'Konnte nicht von der Wunschliste entfernt werden' : 'Konnte nicht auf die Wunschliste gesetzt werden' });
            knopf.disabled = false;
            if (ok) knopf.outerHTML = wunschKnopf(id);
            return;
        }
        // Schon gesehen: das Werk ist kein blinder Fleck mehr – neu aufbauen.
        const ok = await runWithFeedback(() => store.markSeenOpera(id),
            { failure: 'Konnte nicht als gesehen markiert werden', success: 'Als gesehen markiert' });
        knopf.disabled = false;
        if (!ok) return;
        const neu = BlindSpots(visits, store.getSeenOperas(), { eingeklappt });
        if (neu) {
            if (eingeklappt) neu.open = true;
            el.replaceWith(neu);
        } else {
            el.remove();
        }
    });

    return el;
}
