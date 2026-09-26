// Der Admin wählt auf der Seite eines Werks oder Hauses, welcher Teil des
// Titelbilds zu sehen ist.
//
// Das Bild füllt den Kopf ganz aus (background-size: cover); was übersteht,
// fällt weg. Ohne Wahl ist das links und rechts, oben und unten gleich viel.
// Hier lässt sich das Bild im Kopf verschieben, bis das Richtige zu sehen ist.
// Gespeichert wird der Bildpunkt in Prozent, wie background-position ihn
// versteht – er gilt danach überall, wo das Bild erscheint (bildPosition in
// src/utils.js).
//
// Wer kein Admin ist, sieht den Knopf nie: die Seiten fragen vorher
// istAdmin(). Schreiben lässt ohnehin nur die Datenbank zu, und nur Admins
// (supabase/migrations/bild_ausschnitte_migration.sql).

import { icon } from './Icon.js';
import { showToast, showError } from './Toast.js';
import { bildPosition } from '../utils.js';
import { setBildAusschnitt, deleteBildAusschnitt } from '../store/supabase.js';
import { ausschnittSetzen } from '../data/katalogZusatz.js';

const MITTE = { x: 50, y: 50 };
const grenzen = (n) => Math.min(100, Math.max(0, n));
const gerundet = (p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 });
// Näher als ein halbes Prozent an der Mitte: dann ist es die Mitte, und es
// braucht keine Zeile in der Datenbank.
const istMitte = (p) => Math.abs(p.x - 50) < 0.5 && Math.abs(p.y - 50) < 0.5;

/** Wie groß das Bild mit cover gezeichnet wird – und wie weit es übersteht. */
function ueberstand(kopf, bild) {
    const r = kopf.getBoundingClientRect();
    if (!bild.w || !bild.h) {
        // Maße unbekannt (Bild nicht geladen): so tun, als stünde es um eine
        // ganze Breite bzw. Höhe über. Das Ziehen fühlt sich dann etwas
        // anders an, bleibt aber möglich.
        return { x: r.width, y: r.height };
    }
    const massstab = Math.max(r.width / bild.w, r.height / bild.h);
    return { x: bild.w * massstab - r.width, y: bild.h * massstab - r.height };
}

/**
 * Den Knopf oben rechts in den Kopf setzen.
 *
 * @param kopf     das .detail-hero-Element
 * @param art      'werk' oder 'haus'
 * @param eintrag  der Katalogeintrag (trägt danach bildAusschnitt)
 * @param bildUrl  das Bild im Kopf; ohne Bild gibt es nichts zu verschieben
 */
export function bildAusschnittKnopf(kopf, art, eintrag, bildUrl) {
    if (!kopf || !bildUrl) return null;

    const knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.className = 'bild-ausschnitt__knopf';
    knopf.title = 'Bildausschnitt wählen';
    knopf.setAttribute('aria-label', 'Bildausschnitt wählen');
    knopf.innerHTML = icon('camera');
    kopf.appendChild(knopf);

    knopf.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        knopf.disabled = true;
        const bild = await bildMasse(bildUrl);
        knopf.disabled = false;
        bearbeiten(kopf, knopf, art, eintrag, bildUrl, bild);
    });
    return knopf;
}

/**
 * Die Maße des Bildes – ohne sie weiß das Ziehen nicht, wie weit es übersteht.
 * Meist liegt es schon im Cache, weil es im Kopf zu sehen ist. Kommt es nicht
 * binnen anderthalb Sekunden, geht es ohne (siehe ueberstand).
 */
function bildMasse(url) {
    return new Promise((fertig) => {
        const probe = new Image();
        const uhr = setTimeout(() => fertig({ w: 0, h: 0 }), 1500);
        probe.onload = () => { clearTimeout(uhr); fertig({ w: probe.naturalWidth, h: probe.naturalHeight }); };
        probe.onerror = () => { clearTimeout(uhr); fertig({ w: 0, h: 0 }); };
        probe.src = url;
    });
}

function bearbeiten(kopf, knopf, art, eintrag, bildUrl, bild) {
    const vorher = eintrag.bildAusschnitt ? { ...eintrag.bildAusschnitt } : null;
    let pos = { ...(vorher ?? MITTE) };

    // Auf dem Handy gibt es keine Pfeiltasten.
    const beruehrung = window.matchMedia?.('(pointer: coarse)').matches;
    const leiste = document.createElement('div');
    leiste.className = 'bild-ausschnitt__leiste';
    leiste.innerHTML = `
      <span class="bild-ausschnitt__hinweis">${beruehrung ? 'Bild ziehen' : 'Bild ziehen oder Pfeiltasten'}</span>
      <button type="button" class="btn btn--sm btn--outline" data-aktion="mitte">Mitte</button>
      <button type="button" class="btn btn--sm btn--outline" data-aktion="abbrechen">Abbrechen</button>
      <button type="button" class="btn btn--sm btn--primary" data-aktion="speichern">Speichern</button>`;
    kopf.appendChild(leiste);
    knopf.hidden = true;
    kopf.classList.add('detail-hero--ausschnitt');
    // Beim Wählen das Bild ohne die Abdunklung darüber – sonst sieht man
    // gerade den unteren Teil kaum, um den es oft geht. Über das CSSOM
    // gesetzt, nicht als HTML: die Adresse wird dabei nicht ausgewertet.
    const ebenenVorher = kopf.style.backgroundImage;
    kopf.style.backgroundImage = `url(${JSON.stringify(bildUrl)})`;
    kopf.tabIndex = 0;
    kopf.focus({ preventScroll: true });

    const zeigen = () => { kopf.style.backgroundPosition = bildPosition(pos); };

    // ── Ziehen ──
    let zug = null;
    const runter = (e) => {
        if (leiste.contains(e.target)) return;
        e.preventDefault();
        zug = { id: e.pointerId, x: e.clientX, y: e.clientY, start: { ...pos }, ueber: ueberstand(kopf, bild) };
        kopf.setPointerCapture?.(e.pointerId);
        kopf.classList.add('detail-hero--ziehen');
    };
    const bewegen = (e) => {
        if (!zug || e.pointerId !== zug.id) return;
        // Das Bild folgt dem Finger: nach rechts ziehen zeigt mehr vom linken
        // Rand, also sinkt x. Steht das Bild in einer Richtung nicht über,
        // gibt es dort nichts zu verschieben.
        const dx = e.clientX - zug.x;
        const dy = e.clientY - zug.y;
        if (zug.ueber.x > 1) pos.x = grenzen(zug.start.x - dx / zug.ueber.x * 100);
        if (zug.ueber.y > 1) pos.y = grenzen(zug.start.y - dy / zug.ueber.y * 100);
        zeigen();
    };
    const los = (e) => {
        if (!zug || e.pointerId !== zug.id) return;
        zug = null;
        kopf.classList.remove('detail-hero--ziehen');
    };

    // ── Tastatur ──
    const taste = (e) => {
        const schritt = e.shiftKey ? 10 : 2;
        const richtung = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (richtung) {
            e.preventDefault();
            pos = { x: grenzen(pos.x + richtung[0] * schritt), y: grenzen(pos.y + richtung[1] * schritt) };
            zeigen();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            ende(false);
        } else if (e.key === 'Enter' && e.target === kopf) {
            e.preventDefault();
            speichern();
        }
    };

    kopf.addEventListener('pointerdown', runter);
    kopf.addEventListener('pointermove', bewegen);
    kopf.addEventListener('pointerup', los);
    kopf.addEventListener('pointercancel', los);
    kopf.addEventListener('keydown', taste);

    function ende(gespeichert) {
        kopf.removeEventListener('pointerdown', runter);
        kopf.removeEventListener('pointermove', bewegen);
        kopf.removeEventListener('pointerup', los);
        kopf.removeEventListener('pointercancel', los);
        kopf.removeEventListener('keydown', taste);
        kopf.classList.remove('detail-hero--ausschnitt', 'detail-hero--ziehen');
        kopf.removeAttribute('tabindex');
        kopf.style.backgroundImage = ebenenVorher;
        leiste.remove();
        knopf.hidden = false;
        if (!gespeichert) kopf.style.backgroundPosition = bildPosition(vorher);
        knopf.focus({ preventScroll: true });
    }

    async function speichern() {
        const knoepfe = leiste.querySelectorAll('button');
        knoepfe.forEach(b => { b.disabled = true; });
        const neu = istMitte(pos) ? null : gerundet(pos);
        try {
            if (neu) await setBildAusschnitt(art, eintrag.id, neu);
            else if (vorher) await deleteBildAusschnitt(art, eintrag.id, { hatteEinen: true });
            ausschnittSetzen(art, eintrag.id, neu);
            pos = neu ?? { ...MITTE };
            zeigen();
            ende(true);
            showToast(neu ? 'Bildausschnitt gespeichert' : 'Bildausschnitt auf die Mitte gesetzt');
        } catch (fehler) {
            console.error('[BildAusschnitt]', fehler);
            knoepfe.forEach(b => { b.disabled = false; });
            showError('Der Ausschnitt ließ sich nicht speichern. Bist du noch als Admin angemeldet?');
        }
    }

    leiste.addEventListener('click', (e) => {
        const aktion = e.target.closest('button')?.dataset.aktion;
        if (!aktion) return;
        e.preventDefault();
        e.stopPropagation();
        if (aktion === 'mitte') { pos = { ...MITTE }; zeigen(); kopf.focus({ preventScroll: true }); }
        if (aktion === 'abbrechen') ende(false);
        if (aktion === 'speichern') speichern();
    });

    zeigen();
}
