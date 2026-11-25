// Der geheime Entdecken-Modus (seit 25.11.2026).
//
// Strg+E (Mac: Cmd+E) öffnet ein Fenster mit genau einem Knopf. Er öffnet
// eine zufällige Aufnahme aus den "bekannten Stellen" aller Werke
// (stellen_links) in einem neuen Tab. Nirgends verlinkt, nirgends erwähnt –
// Jonas, 25.11.2026: "Neuer, geheimer Entdecken-Modus".
//
// Natives <dialog> mit showModal(): Esc, die Zurück-Geste, Fokus und das
// inerte Seitenleben dahinter bringt der Browser mit. Klick daneben schließt
// (closedby="any", in Safari per Rückfall unten).
//
// Die Liste wird beim Öffnen geladen, nicht beim Klick: window.open muss
// direkt im Klick passieren, sonst hält der Browser den neuen Tab für ein
// Werbefenster und blockiert ihn. Blockiert er trotzdem, steht der Link da.

import { escapeHTML } from './utils.js';
import { operas } from './data/operas.js';
import { getAlleStellenLinksCloud } from './store/supabase.js';

/** Strg+E oder Cmd+E, ohne weitere Umschalttasten. */
export function istEntdeckenTaste(e) {
    return Boolean(e && (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey
        && String(e.key).toLowerCase() === 'e' && !e.repeat);
}

/**
 * Eine zufällige Aufnahme – möglichst nicht dieselbe wie eben.
 * @param {Array<{werk_id: string, stelle: string, url: string}>} liste
 * @param {{ zufall?: () => number, nicht?: string|null }} [o]  nicht: url der letzten
 */
export function zufallsAufnahme(liste, { zufall = Math.random, nicht = null } = {}) {
    const brauchbar = (liste || []).filter(a => a && /^https:\/\//.test(a.url || ''));
    if (!brauchbar.length) return null;
    const auswahl = brauchbar.length > 1 && nicht ? brauchbar.filter(a => a.url !== nicht) : brauchbar;
    return auswahl[Math.min(auswahl.length - 1, Math.floor(zufall() * auswahl.length))];
}

/** "Vissi d’arte · Tosca" */
export function aufnahmeTitel(a, werke = operas) {
    const werk = werke.find(o => o.id === a.werk_id)?.title || '';
    return werk ? `${a.stelle} · ${werk}` : a.stelle;
}

let dialog = null;
let liste = null;
let letzte = null;

function bauen() {
    dialog = document.createElement('dialog');
    dialog.className = 'entdecken';
    dialog.setAttribute('closedby', 'any');
    dialog.setAttribute('aria-labelledby', 'entdeckenTitel');
    dialog.innerHTML = `
      <div class="entdecken__buehne">
        <h1 class="entdecken__titel" id="entdeckenTitel">Entdecken</h1>
        <div class="entdecken__knopfrahmen">
          <span class="entdecken__strahlen" aria-hidden="true"></span>
          <span class="entdecken__funken" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>
          <button type="button" class="entdecken__knopf" autofocus disabled>
            <span class="entdecken__knopftext">Vorhang auf</span>
          </button>
        </div>
        <p class="entdecken__zeile" aria-live="polite">Einen Moment …</p>
      </div>
      <form method="dialog" class="entdecken__schliessen">
        <button type="submit" aria-label="Schließen">×</button>
      </form>`;
    document.body.appendChild(dialog);

    const knopf = dialog.querySelector('.entdecken__knopf');
    const zeile = dialog.querySelector('.entdecken__zeile');

    knopf.addEventListener('click', () => {
        const a = zufallsAufnahme(liste, { nicht: letzte });
        if (!a) return;
        letzte = a.url;
        // Direkt im Klick, sonst blockiert der Browser den Tab. Ohne
        // "noopener" im Aufruf – damit gäbe window.open immer null zurück,
        // und ein blockierter Tab wäre nicht zu erkennen. Die Verbindung zum
        // neuen Tab wird stattdessen hier gekappt.
        const tab = window.open(a.url, '_blank');
        if (tab) tab.opener = null;
        zeile.innerHTML = tab === null
            ? `<a href="${escapeHTML(a.url)}" target="_blank" rel="noopener">${escapeHTML(aufnahmeTitel(a))}</a>`
            : escapeHTML(aufnahmeTitel(a));
        // Der Auftritt: Funken und ein Lichtblitz, neu bei jedem Klick.
        dialog.classList.remove('entdecken--zuendet');
        void dialog.offsetWidth;
        dialog.classList.add('entdecken--zuendet');
    });

    // Klick daneben schließt, wo closedby fehlt (Safari).
    if (!('closedBy' in HTMLDialogElement.prototype)) {
        const draussen = (e) => {
            const r = dialog.getBoundingClientRect();
            return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
        };
        let gedruecktDraussen = false;
        dialog.addEventListener('pointerdown', (e) => { gedruecktDraussen = draussen(e); });
        dialog.addEventListener('pointerup', (e) => { if (gedruecktDraussen && draussen(e)) dialog.close(); });
    }
}

async function laden() {
    const knopf = dialog.querySelector('.entdecken__knopf');
    const zeile = dialog.querySelector('.entdecken__zeile');
    if (liste?.length) {
        knopf.disabled = false;
        knopf.focus();
        return;
    }
    try {
        liste = await getAlleStellenLinksCloud();
    } catch (e) {
        console.warn('[Entdecken] Aufnahmen laden', e);
        liste = null;
    }
    if (liste?.length) {
        knopf.disabled = false;
        // autofocus greift nicht, solange der Knopf beim Öffnen noch
        // gesperrt ist – sonst stünde der Fokus auf dem Schließen-Kreuz.
        if (dialog.open) knopf.focus();
        zeile.textContent = `${liste.length} Aufnahmen warten.`;
    } else {
        zeile.textContent = 'Gerade keine Verbindung – versuch es gleich noch einmal.';
    }
}

export function entdeckenOeffnen() {
    if (!dialog) bauen();
    if (dialog.open) return;
    dialog.classList.remove('entdecken--zuendet');
    dialog.showModal();
    laden();
}

/** Einmal beim Start (main.js). */
export function entdeckenEinrichten(umgebung = globalThis) {
    umgebung.addEventListener('keydown', (e) => {
        if (!istEntdeckenTaste(e)) return;
        // Der Browser legt auf Strg/Cmd+E eigene Dinge (Suchleiste, Auswahl
        // suchen). Hier gehört die Taste der App.
        e.preventDefault();
        if (dialog?.open) dialog.close();
        else entdeckenOeffnen();
    });
}
