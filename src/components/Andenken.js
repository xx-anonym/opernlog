// Andenken: Fotos zu einem Abend auf seiner Seite (#/visit/…).
//
// In der Oberfläche heißen sie "Momentaufnahmen" (Jonas, 30.9.2026: klingt
// schöner). Tabelle, Speicher und Code behalten den Namen andenken – ein
// Umbenennen dort hieße Datenbank und Dateien umziehen, ohne dass es
// jemand sähe.
//
// Die Fotos stehen in der Karte des Abends, vor Gefällt-mir und
// Kommentaren, als Mosaik: das erste groß, die übrigen darum herum. Auf den
// Kacheln liegt nichts außer einem kleinen Globus an eigenen öffentlichen
// Fotos. Antippen vergrößert; dort blättert man (Wischen, Pfeiltasten) und
// schaltet beim eigenen Abend zwischen privat (Standard) und öffentlich
// oder löscht. Bei fremden Abenden nur die öffentlichen, ohne Knöpfe. Die
// Fotos liegen nur in der Cloud – ohne Netz steht hier nichts. Datenbank
// und Speicher: supabase/migrations/andenken_migration.sql.

import { icon } from './Icon.js';
import { showToast, runWithFeedback } from './Toast.js';
import { store } from '../store/store.js';
import { escapeHTML } from '../utils.js';
import { fotoVorbereiten } from '../bild.js';

export const HOECHSTENS_JE_ABEND = 6;

// Ein einzelnes Foto behält ungefähr sein Format – ein hochkant
// fotografiertes Programmheft soll nicht zum Querstreifen werden.
function einzelFormat(foto) {
    const verhaeltnis = foto.breite && foto.hoehe ? foto.breite / foto.hoehe : 4 / 3;
    return Math.min(16 / 9, Math.max(4 / 5, verhaeltnis)).toFixed(3);
}

export function andenkenBereich(visit) {
    const bereich = document.createElement('section');
    bereich.className = 'andenken';
    bereich.hidden = true;

    // Eigen und schon in der Cloud: ein Abend, der noch auf die Übertragung
    // wartet, hat dort noch keine Zeile, an die ein Foto hängen könnte.
    const eigen = !!store.isCloud && (store.getVisitsByUser('user-me') || [])
        .some(v => String(v.id) === String(visit.id) && !v.ausstehend);
    let fotos = [];
    let laedt = false;

    function zeichnen() {
        const platz = HOECHSTENS_JE_ABEND - fotos.length;
        bereich.hidden = !eigen && !fotos.length;
        bereich.innerHTML = `
          <div class="andenken__kopf">
            <h2 class="andenken__titel">${icon('camera')}Momentaufnahmen</h2>
            ${eigen && platz > 0 ? `
            <label class="btn btn--sm btn--outline andenken__neu${laedt ? ' andenken__neu--laedt' : ''}">
              <input type="file" accept="image/*" multiple${laedt ? ' disabled' : ''}>
              ${laedt ? 'Lädt …' : `${icon('plus')}Foto`}
            </label>` : ''}
          </div>
          ${fotos.length ? `
          <div class="andenken__mosaik andenken__mosaik--${fotos.length}"${fotos.length === 1 ? ` style="aspect-ratio: ${einzelFormat(fotos[0])}"` : ''}>
            ${fotos.map((f, i) => `
              <figure class="andenken__foto" data-id="${escapeHTML(f.id)}">
                <button type="button" class="andenken__oeffnen" aria-label="Foto ${i + 1} vergrößern">
                  <img src="${escapeHTML(f.url || '')}" alt="" loading="lazy">
                </button>
                ${eigen && f.oeffentlich ? `<span class="andenken__marke" title="Öffentlich">${icon('globe')}</span>` : ''}
              </figure>`).join('')}
          </div>` : ''}`;
    }

    function gross(start) {
        let nr = start;
        let startX = null;
        let gewischt = false;
        const modal = document.createElement('div');
        modal.className = 'modal modal--active andenken-gross';
        modal.innerHTML = `
          <div class="modal__overlay"></div>
          <div class="andenken-gross__rahmen" role="dialog" aria-label="Foto"></div>`;
        const rahmen = modal.querySelector('.andenken-gross__rahmen');

        function zeigen() {
            const f = fotos[nr];
            rahmen.innerHTML = `
              <img src="${escapeHTML(f.url || '')}" alt="" draggable="false">
              ${eigen || fotos.length > 1 ? `
              <div class="andenken-gross__leiste">
                ${fotos.length > 1 ? `<span class="andenken-gross__zahl">${nr + 1} / ${fotos.length}</span>` : ''}
                ${eigen ? `
                <button type="button" class="andenken-gross__knopf andenken-gross__sicht${f.oeffentlich ? ' andenken-gross__sicht--an' : ''}" aria-pressed="${f.oeffentlich}">${icon(f.oeffentlich ? 'globe' : 'lock')}${f.oeffentlich ? 'Öffentlich' : 'Privat'}</button>
                <button type="button" class="andenken-gross__knopf andenken-gross__weg">${icon('trash')}Löschen</button>` : ''}
              </div>` : ''}`;
        }
        const blaettern = (schritt) => {
            if (fotos.length < 2) return;
            nr = (nr + schritt + fotos.length) % fotos.length;
            zeigen();
        };
        const schliessen = () => {
            modal.remove();
            document.removeEventListener('keydown', taste);
        };
        function taste(e) {
            if (e.key === 'Escape') schliessen();
            else if (e.key === 'ArrowRight') blaettern(1);
            else if (e.key === 'ArrowLeft') blaettern(-1);
        }
        document.addEventListener('keydown', taste);

        // Wischen blättert; der Klick, den die Maus danach noch meldet,
        // schließt dann nicht. Ein Finger meldet nach dem Wischen oft gar
        // keinen Klick – deshalb setzt jedes neue Antippen die Sperre zurück.
        rahmen.addEventListener('pointerdown', (e) => {
            startX = e.clientX;
            gewischt = false;
        });
        rahmen.addEventListener('pointerup', (e) => {
            if (startX === null) return;
            const weg = e.clientX - startX;
            startX = null;
            if (Math.abs(weg) < 40) return;
            gewischt = true;
            blaettern(weg < 0 ? 1 : -1);
        });

        modal.addEventListener('click', async (e) => {
            if (gewischt) {
                gewischt = false;
                return;
            }
            const knopf = e.target.closest('.andenken-gross__knopf');
            if (!knopf) {
                if (!e.target.closest('.andenken-gross__leiste')) schliessen();
                return;
            }
            if (knopf.disabled) return;
            const f = fotos[nr];
            if (knopf.classList.contains('andenken-gross__sicht')) {
                knopf.disabled = true;
                const neu = !f.oeffentlich;
                if (await runWithFeedback(() => store.andenkenSichtbarkeit(f.id, neu), { failure: 'Sichtbarkeit ließ sich nicht ändern' })) {
                    f.oeffentlich = neu;
                    showToast(neu ? 'Öffentlich – jeder, der den Abend sieht' : 'Privat – nur für dich');
                }
                zeigen();
                zeichnen();
                return;
            }
            if (!window.confirm('Foto löschen?')) return;
            knopf.disabled = true;
            if (await runWithFeedback(() => store.andenkenLoeschen(f), { failure: 'Foto ließ sich nicht löschen' })) {
                fotos = fotos.filter(x => x.id !== f.id);
                zeichnen();
                if (!fotos.length) return schliessen();
                nr = Math.min(nr, fotos.length - 1);
            }
            zeigen();
        });

        zeigen();
        document.body.appendChild(modal);
    }

    bereich.addEventListener('click', (e) => {
        const oeffnen = e.target.closest('.andenken__oeffnen');
        if (!oeffnen) return;
        const nr = fotos.findIndex(f => f.id === oeffnen.closest('.andenken__foto')?.dataset.id);
        if (nr >= 0) gross(nr);
    });

    bereich.addEventListener('change', async (e) => {
        const feld = e.target.closest('.andenken__neu input');
        if (!feld || !feld.files?.length) return;
        const platz = HOECHSTENS_JE_ABEND - fotos.length;
        const dateien = [...feld.files].slice(0, platz);
        if (feld.files.length > platz) showToast(`Höchstens ${HOECHSTENS_JE_ABEND} Fotos je Abend`);
        laedt = true;
        zeichnen();
        for (const datei of dateien) {
            await runWithFeedback(async () => {
                const foto = await store.andenkenHinzufuegen(visit.id, await fotoVorbereiten(datei));
                fotos = [...fotos, foto];
            }, { failure: 'Foto ließ sich nicht hochladen' });
        }
        laedt = false;
        zeichnen();
    });

    if (eigen) zeichnen();
    store.getAndenken(visit.id).then((geladen) => {
        fotos = geladen;
        zeichnen();
    }, (e) => console.warn('[Andenken] laden', e));

    return bereich;
}

/**
 * Fotos schon beim Loggen wählen (src/pages/LogVisit.js). Hochgeladen wird
 * erst nach dem Speichern: ein Foto hängt an einem Abend, und den gibt es
 * vorher nicht. Vorbereitet (verkleinert, ohne Metadaten) wird gleich bei
 * der Auswahl, damit das Speichern nicht darauf warten muss.
 *
 * @returns {{element: HTMLElement, fotos: () => Array<{blob: Blob, breite: number, hoehe: number, oeffentlich: boolean}>}}
 */
export function andenkenAuswahl() {
    const feld = document.createElement('div');
    feld.className = 'form-group andenken andenken--auswahl';
    let fotos = [];   // { blob, breite, hoehe, oeffentlich, vorschau }
    let laedt = false;

    function zeichnen() {
        const platz = HOECHSTENS_JE_ABEND - fotos.length;
        feld.innerHTML = `
          <span class="form-label">${icon('camera', { className: 'icon--meta' })}Momentaufnahmen<span class="form-collapse__optional">(optional)</span></span>
          <div class="andenken__raster">
            ${fotos.map((f, i) => `
              <figure class="andenken__foto" data-i="${i}">
                <img src="${f.vorschau}" alt="">
                <button type="button" class="andenken__sicht${f.oeffentlich ? ' andenken__sicht--an' : ''}" aria-pressed="${f.oeffentlich}"
                  title="${f.oeffentlich ? 'Öffentlich – jeder, der den Abend sieht' : 'Privat – nur du'}">${icon(f.oeffentlich ? 'globe' : 'lock')}</button>
                <button type="button" class="andenken__weg" aria-label="Foto entfernen" title="Foto entfernen">✕</button>
              </figure>`).join('')}
            ${platz > 0 ? `
            <label class="andenken__neu${laedt ? ' andenken__neu--laedt' : ''}">
              <input type="file" accept="image/*" multiple${laedt ? ' disabled' : ''}>
              <span>${laedt ? 'Bereitet vor …' : `${icon('plus')}Foto`}</span>
            </label>` : ''}
          </div>`;
    }

    const fotoZu = knopf => fotos[Number(knopf.closest('.andenken__foto')?.dataset.i)];

    feld.addEventListener('click', (e) => {
        const sicht = e.target.closest('.andenken__sicht');
        if (sicht) {
            const foto = fotoZu(sicht);
            if (foto) foto.oeffentlich = !foto.oeffentlich;
            zeichnen();
            return;
        }
        const weg = e.target.closest('.andenken__weg');
        if (weg) {
            const foto = fotoZu(weg);
            if (!foto) return;
            URL.revokeObjectURL(foto.vorschau);
            fotos = fotos.filter(f => f !== foto);
            zeichnen();
        }
    });

    feld.addEventListener('change', async (e) => {
        const eingabe = e.target.closest('.andenken__neu input');
        if (!eingabe || !eingabe.files?.length) return;
        const platz = HOECHSTENS_JE_ABEND - fotos.length;
        const dateien = [...eingabe.files].slice(0, platz);
        if (eingabe.files.length > platz) showToast(`Höchstens ${HOECHSTENS_JE_ABEND} Fotos je Abend`);
        laedt = true;
        zeichnen();
        for (const datei of dateien) {
            await runWithFeedback(async () => {
                const foto = await fotoVorbereiten(datei);
                fotos = [...fotos, { ...foto, oeffentlich: false, vorschau: URL.createObjectURL(foto.blob) }];
            }, { failure: 'Foto ließ sich nicht öffnen' });
        }
        laedt = false;
        zeichnen();
    });

    zeichnen();
    return {
        element: feld,
        fotos: () => fotos.map(({ blob, breite, hoehe, oeffentlich }) => ({ blob, breite, hoehe, oeffentlich })),
    };
}
