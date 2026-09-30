// Andenken: Fotos zu einem Abend – auf seiner Seite (#/visit/…) und im Feed.
//
// In der Oberfläche heißen sie "Momentaufnahmen" (Jonas, 30.9.2026: klingt
// schöner). Tabelle, Speicher und Code behalten den Namen andenken – ein
// Umbenennen dort hieße Datenbank und Dateien umziehen, ohne dass es
// jemand sähe. Ebenso die Spalte "oeffentlich": sie heißt nur so, bedeutet
// aber "für Freunde sichtbar", nie mehr (Jonas, 1.10.2026). In der
// Oberfläche steht deshalb "Freunde", nicht "öffentlich".
//
// Auf der Seite eines Abends stehen die Fotos in seiner Karte, vor
// Gefällt-mir und Kommentaren, als Mosaik: das erste groß, die übrigen
// darum herum. Auf den Kacheln liegt nichts außer einem kleinen Zeichen an
// eigenen, für Freunde freigegebenen Fotos. Antippen vergrößert; dort
// blättert man (Wischen, Pfeiltasten) und schaltet beim eigenen Abend
// zwischen privat (Standard) und Freunden oder löscht. Im Feed stehen die
// freigegebenen Fotos von Freunden als kleines Mosaik aus höchstens drei
// Kacheln. Kacheln zeigen die Vorschau (720 px), die Vergrößerung das Foto.
// Die Fotos liegen nur in der Cloud – ohne Netz steht hier nichts.
// Datenbank und Speicher: supabase/migrations/andenken_migration.sql.

import { icon } from './Icon.js';
import { showToast, runWithFeedback } from './Toast.js';
import { store } from '../store/store.js';
import { escapeHTML } from '../utils.js';
import { fotoVorbereiten } from '../bild.js';

export const HOECHSTENS_JE_ABEND = 6;
// Im Feed höchstens so viele Kacheln; die übrigen zählt ein "+2" auf der letzten.
const IM_FEED = 3;

const FREUNDE = 'Für Freunde sichtbar';
const PRIVAT = 'Privat – nur du';

/** Das Schalter-Innere: Zeichen und, wo Platz ist, Wort. */
const sichtZeichen = f => icon(f.oeffentlich ? 'users' : 'lock');

// Ein einzelnes Foto behält ungefähr sein Format – ein hochkant
// fotografiertes Programmheft soll nicht zum Querstreifen werden.
function einzelFormat(foto) {
    const verhaeltnis = foto.breite && foto.hoehe ? foto.breite / foto.hoehe : 4 / 3;
    return Math.min(16 / 9, Math.max(4 / 5, verhaeltnis)).toFixed(3);
}

/**
 * Das Mosaik. `feed`: höchstens IM_FEED Kacheln, alle als Vorschau.
 * Sonst bekommt eine Kachel über die volle Breite das Foto selbst – die
 * Vorschau wäre dort auf scharfen Bildschirmen zu weich.
 */
function mosaikHTML(fotos, { eigen = false, feed = false } = {}) {
    const n = fotos.length;
    const gezeigt = feed ? fotos.slice(0, IM_FEED) : fotos;
    const breit = !feed && (n === 1 || n === 4);
    const format = !feed && n === 1 ? ` style="aspect-ratio: ${einzelFormat(fotos[0])}"` : '';
    return `
      <div class="andenken__mosaik andenken__mosaik--${gezeigt.length}${feed ? ' andenken__mosaik--feed' : ''}"${format}>
        ${gezeigt.map((f, i) => `
          <figure class="andenken__foto" data-id="${escapeHTML(f.id)}">
            <button type="button" class="andenken__oeffnen" aria-label="Foto ${i + 1} von ${n} vergrößern">
              <img src="${escapeHTML((i === 0 && breit ? f.url : f.vorschauUrl) || f.url || '')}" alt="" loading="lazy">
            </button>
            ${eigen && f.oeffentlich ? `<span class="andenken__marke" title="${FREUNDE}">${icon('users')}</span>` : ''}
            ${feed && i === gezeigt.length - 1 && n > gezeigt.length ? `<span class="andenken__mehr">+${n - gezeigt.length}</span>` : ''}
          </figure>`).join('')}
      </div>`;
}

/**
 * Die Vergrößerung. `holen` liefert die aktuelle Liste (sie kann beim
 * Löschen schrumpfen); `aktionen` gibt es nur beim eigenen Abend:
 * umschalten(foto) und loeschen(foto) – letzteres liefert, ob es geklappt hat.
 */
function grossAnsicht(holen, start, aktionen = null) {
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
        const fotos = holen();
        const f = fotos[nr];
        rahmen.innerHTML = `
          <img src="${escapeHTML(f.url || f.vorschauUrl || '')}" alt="" draggable="false">
          ${aktionen || fotos.length > 1 ? `
          <div class="andenken-gross__leiste">
            ${fotos.length > 1 ? `<span class="andenken-gross__zahl">${nr + 1} / ${fotos.length}</span>` : ''}
            ${aktionen ? `
            <button type="button" class="andenken-gross__knopf andenken-gross__sicht${f.oeffentlich ? ' andenken-gross__sicht--an' : ''}"
              aria-pressed="${f.oeffentlich}" title="${f.oeffentlich ? FREUNDE : PRIVAT}">${sichtZeichen(f)}${f.oeffentlich ? 'Freunde' : 'Privat'}</button>
            <button type="button" class="andenken-gross__knopf andenken-gross__weg">${icon('trash')}Löschen</button>` : ''}
          </div>` : ''}`;
    }
    const blaettern = (schritt) => {
        const n = holen().length;
        if (n < 2) return;
        nr = (nr + schritt + n) % n;
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
        if (knopf.disabled || !aktionen) return;
        const f = holen()[nr];
        if (knopf.classList.contains('andenken-gross__sicht')) {
            knopf.disabled = true;
            await aktionen.umschalten(f);
            zeigen();
            return;
        }
        if (!window.confirm('Foto löschen?')) return;
        knopf.disabled = true;
        if (await aktionen.loeschen(f)) {
            const rest = holen().length;
            if (!rest) return schliessen();
            nr = Math.min(nr, rest - 1);
        }
        zeigen();
    });

    zeigen();
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
          <div class="andenken__kopf">
            <h2 class="andenken__titel">${icon('camera')}Momentaufnahmen</h2>
            ${eigen && platz > 0 ? `
            <label class="btn btn--sm btn--outline andenken__neu${laedt ? ' andenken__neu--laedt' : ''}">
              <input type="file" accept="image/*" multiple${laedt ? ' disabled' : ''}>
              ${laedt ? 'Lädt …' : `${icon('plus')}Foto`}
            </label>` : ''}
          </div>
          ${fotos.length ? mosaikHTML(fotos, { eigen }) : ''}`;
    }

    const aktionen = eigen ? {
        async umschalten(f) {
            const neu = !f.oeffentlich;
            if (await runWithFeedback(() => store.andenkenSichtbarkeit(f.id, neu), { failure: 'Sichtbarkeit ließ sich nicht ändern' })) {
                f.oeffentlich = neu;
                showToast(neu ? FREUNDE : 'Privat – nur für dich');
            }
            zeichnen();
        },
        async loeschen(f) {
            const ok = await runWithFeedback(() => store.andenkenLoeschen(f), { failure: 'Foto ließ sich nicht löschen' });
            if (ok) fotos = fotos.filter(x => x.id !== f.id);
            zeichnen();
            return ok;
        },
    } : null;

    bereich.addEventListener('click', (e) => {
        const oeffnen = e.target.closest('.andenken__oeffnen');
        if (!oeffnen) return;
        const nr = fotos.findIndex(f => f.id === oeffnen.closest('.andenken__foto')?.dataset.id);
        if (nr >= 0) grossAnsicht(() => fotos, nr, aktionen);
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
 * Die freigegebenen Fotos eines Abends in seiner Karte im Feed
 * (src/pages/Home.js). Antippen vergrößert und blättert durch alle.
 */
export function andenkenImFeed(fotos) {
    const el = document.createElement('div');
    el.className = 'andenken andenken--feed';
    el.innerHTML = mosaikHTML(fotos, { feed: true });
    el.addEventListener('click', (e) => {
        const oeffnen = e.target.closest('.andenken__oeffnen');
        if (!oeffnen) return;
        const nr = fotos.findIndex(f => f.id === oeffnen.closest('.andenken__foto')?.dataset.id);
        if (nr >= 0) grossAnsicht(() => fotos, nr);
    });
    return el;
}

/**
 * Fotos schon beim Loggen wählen (src/pages/LogVisit.js). Hochgeladen wird
 * erst nach dem Speichern: ein Foto hängt an einem Abend, und den gibt es
 * vorher nicht. Vorbereitet (verkleinert, ohne Metadaten) wird gleich bei
 * der Auswahl, damit das Speichern nicht darauf warten muss.
 *
 * @returns {{element: HTMLElement, fotos: () => Array<{blob: Blob, vorschau: Blob, breite: number, hoehe: number, oeffentlich: boolean}>}}
 */
export function andenkenAuswahl() {
    const feld = document.createElement('div');
    feld.className = 'form-group andenken andenken--auswahl';
    let fotos = [];   // { blob, vorschau, breite, hoehe, oeffentlich, anzeige }
    let laedt = false;

    function zeichnen() {
        const platz = HOECHSTENS_JE_ABEND - fotos.length;
        feld.innerHTML = `
          <span class="form-label">${icon('camera', { className: 'icon--meta' })}Momentaufnahmen<span class="form-collapse__optional">(optional)</span></span>
          <div class="andenken__raster">
            ${fotos.map((f, i) => `
              <figure class="andenken__foto" data-i="${i}">
                <img src="${f.anzeige}" alt="">
                <button type="button" class="andenken__sicht${f.oeffentlich ? ' andenken__sicht--an' : ''}" aria-pressed="${f.oeffentlich}"
                  title="${f.oeffentlich ? FREUNDE : PRIVAT}">${sichtZeichen(f)}</button>
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
            URL.revokeObjectURL(foto.anzeige);
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
                fotos = [...fotos, { ...foto, oeffentlich: false, anzeige: URL.createObjectURL(foto.vorschau || foto.blob) }];
            }, { failure: 'Foto ließ sich nicht öffnen' });
        }
        laedt = false;
        zeichnen();
    });

    zeichnen();
    return {
        element: feld,
        fotos: () => fotos.map(({ blob, vorschau, breite, hoehe, oeffentlich }) => ({ blob, vorschau, breite, hoehe, oeffentlich })),
    };
}
