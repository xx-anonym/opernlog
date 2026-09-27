// "Meine Daten herunterladen" im Fenster "Profil bearbeiten": ein schlichter
// Knopf direkt über "Konto löschen", ohne eigenen Kasten. Was in der Datei
// steht, legt src/datenExport.js fest; hier nur der Knopf und der Weg der
// Datei auf das Gerät.

import * as sb from '../store/supabase.js';
import { store } from '../store/store.js';
import { operas } from '../data/operas.js';
import { operaHouses } from '../data/operaHouses.js';
import { VERSION } from '../version.js';
import { datenExport, exportDateiname, DATEI_TYP } from '../datenExport.js';

const STANDARD = {
    holen: () => sb.meineDatenCloud(),
    ausstehend: () => store.getAusstehendeBesuche(),
    jetzt: () => new Date(),
};

/**
 * @param {object} [dienste] für Tests austauschbar: holen, ausstehend, jetzt
 * @returns {HTMLElement}
 */
export function datenExportBereich(dienste = {}) {
    const d = { ...STANDARD, ...dienste };

    const bereich = document.createElement('div');
    bereich.className = 'daten-export';
    bereich.innerHTML = `
      <button type="button" class="btn btn--ghost btn--sm" id="datenExportBtn">Meine Daten herunterladen</button>
      <p class="auth-error daten-export__fehler" hidden></p>`;

    const knopf = bereich.querySelector('#datenExportBtn');
    const fehlerEl = bereich.querySelector('.daten-export__fehler');
    const knopfText = knopf.textContent;

    const zeigeFehler = (text) => {
        fehlerEl.textContent = text || '';
        fehlerEl.hidden = !text;
    };

    // Auf dem iPhone geht die Datei über das Teilen-Blatt, und das öffnet
    // Safari nur innerhalb der Nutzergeste. Dauert das Zusammenstellen zu
    // lange, ist die Geste verbraucht; die fertige Datei wartet dann hier auf
    // den nächsten Tipp.
    let bereit = null;

    knopf.addEventListener('click', async () => {
        zeigeFehler('');
        if (!bereit) {
            knopf.disabled = true;
            knopf.textContent = 'Wird zusammengestellt…';
            try {
                const jetzt = d.jetzt();
                const inhalt = datenExport(await d.holen(), {
                    werke: operas, haeuser: operaHouses, version: VERSION, jetzt, ausstehend: d.ausstehend(),
                });
                const name = exportDateiname(jetzt);
                const blob = new Blob([JSON.stringify(inhalt, null, 2)], { type: DATEI_TYP });
                bereit = { name, blob, file: new File([blob], name, { type: DATEI_TYP }) };
            } catch (err) {
                console.error('Datenexport', err);
                zeigeFehler('Deine Daten ließen sich gerade nicht zusammenstellen. Versuch es gleich noch einmal.');
                knopf.textContent = knopfText;
                knopf.disabled = false;
                return;
            }
        }

        const ergebnis = await sichern(bereit);
        knopf.disabled = false;
        if (ergebnis === 'geste-verbraucht') {
            knopf.textContent = 'Datei sichern';
            return;
        }
        knopf.textContent = knopfText;
        bereit = null;
        if (ergebnis === 'blockiert') zeigeFehler('Der Browser hat das Fenster mit der Datei blockiert.');
    });

    return bereich;
}

/**
 * Wie das Bild im Saisonrückblick (src/pages/SeasonReview.js, sichern()):
 * auf iPhone und iPad lädt ein <a download> nichts herunter, dort führt nur
 * das Teilen-Blatt mit "In Dateien sichern" zum Ziel. Überall sonst ist der
 * Download der bessere Weg.
 */
async function sichern(datei) {
    if (istIOS()) {
        if (navigator.canShare?.({ files: [datei.file] })) {
            try {
                await navigator.share({ files: [datei.file], title: 'Meine OpernLog-Daten' });
                return 'geteilt';
            } catch (e) {
                if (e?.name === 'AbortError') return 'abgebrochen';
                if (e?.name === 'NotAllowedError') return 'geste-verbraucht';
                console.warn('[Datenexport] Teilen-Blatt', e);
            }
        }
        const url = URL.createObjectURL(datei.blob);
        const fenster = window.open(url, '_blank');
        if (!fenster) {
            URL.revokeObjectURL(url);
            return 'blockiert';
        }
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        return 'geoeffnet';
    }

    const url = URL.createObjectURL(datei.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = datei.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return 'geladen';
}

// iPadOS meldet sich als Macintosh; verraten wird es durch den Touchscreen.
function istIOS() {
    const ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}
