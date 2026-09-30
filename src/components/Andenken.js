// Andenken: Fotos zu einem Abend auf seiner Seite (#/visit/…).
//
// Beim eigenen Abend: Fotos hinzufügen (höchstens sechs), je Foto
// umschalten zwischen privat (Schloss, Standard) und öffentlich (Globus),
// löschen. Bei fremden Abenden nur die öffentlichen, ohne Knöpfe. Antippen
// vergrößert. Die Fotos liegen nur in der Cloud – ohne Netz steht hier
// nichts. Datenbank und Speicher: supabase/migrations/andenken_migration.sql.

import { icon } from './Icon.js';
import { showToast, runWithFeedback } from './Toast.js';
import { store } from '../store/store.js';
import { escapeHTML } from '../utils.js';
import { fotoVorbereiten } from '../bild.js';

export const HOECHSTENS_JE_ABEND = 6;

function gross(foto) {
    const modal = document.createElement('div');
    modal.className = 'modal modal--active andenken-gross';
    modal.innerHTML = `
      <div class="modal__overlay"></div>
      <div class="andenken-gross__rahmen" role="dialog" aria-label="Foto">
        <img src="${escapeHTML(foto.url || '')}" alt="">
      </div>`;
    const schliessen = () => modal.remove();
    modal.querySelector('.modal__overlay').addEventListener('click', schliessen);
    modal.querySelector('.andenken-gross__rahmen').addEventListener('click', schliessen);
    document.body.appendChild(modal);
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
          <h2 class="andenken__titel">${icon('camera')}Andenken</h2>
          <div class="andenken__raster">
            ${fotos.map(f => `
              <figure class="andenken__foto" data-id="${escapeHTML(f.id)}">
                <button type="button" class="andenken__oeffnen" aria-label="Foto vergrößern">
                  <img src="${escapeHTML(f.url || '')}" alt="" loading="lazy">
                </button>
                ${eigen ? `
                <button type="button" class="andenken__sicht${f.oeffentlich ? ' andenken__sicht--an' : ''}" aria-pressed="${f.oeffentlich}"
                  title="${f.oeffentlich ? 'Öffentlich – jeder, der den Abend sieht' : 'Privat – nur du'}">${icon(f.oeffentlich ? 'globe' : 'lock')}</button>
                <button type="button" class="andenken__weg" aria-label="Foto löschen" title="Foto löschen">✕</button>` : ''}
              </figure>`).join('')}
            ${eigen && platz > 0 ? `
            <label class="andenken__neu${laedt ? ' andenken__neu--laedt' : ''}">
              <input type="file" accept="image/*" multiple${laedt ? ' disabled' : ''}>
              <span>${laedt ? 'Lädt …' : `${icon('plus')}Foto`}</span>
            </label>` : ''}
          </div>`;
    }

    const fotoZu = knopf => fotos.find(f => f.id === knopf.closest('.andenken__foto')?.dataset.id);

    bereich.addEventListener('click', async (e) => {
        const oeffnen = e.target.closest('.andenken__oeffnen');
        if (oeffnen) {
            const foto = fotoZu(oeffnen);
            if (foto) gross(foto);
            return;
        }
        const sicht = e.target.closest('.andenken__sicht');
        if (sicht && !sicht.disabled) {
            const foto = fotoZu(sicht);
            if (!foto) return;
            sicht.disabled = true;
            const neu = !foto.oeffentlich;
            if (await runWithFeedback(() => store.andenkenSichtbarkeit(foto.id, neu), { failure: 'Sichtbarkeit ließ sich nicht ändern' })) {
                foto.oeffentlich = neu;
                showToast(neu ? 'Öffentlich – jeder, der den Abend sieht' : 'Privat – nur für dich');
            }
            zeichnen();
            return;
        }
        const weg = e.target.closest('.andenken__weg');
        if (weg && !weg.disabled) {
            const foto = fotoZu(weg);
            if (!foto || !window.confirm('Foto löschen?')) return;
            weg.disabled = true;
            if (await runWithFeedback(() => store.andenkenLoeschen(foto), { failure: 'Foto ließ sich nicht löschen' })) {
                fotos = fotos.filter(f => f.id !== foto.id);
            }
            zeichnen();
        }
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
          <span class="form-label">${icon('camera', { className: 'icon--meta' })}Andenken <span class="form-collapse__optional">(optional)</span></span>
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
