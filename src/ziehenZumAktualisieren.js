// Den Feed von Hand aktualisieren: ganz oben nach unten ziehen und loslassen.
// Auf der Startseite (main.js) und der Seite Freunde (pages/Community.js).
//
// Wunsch eines neuen Mitglieds (14.11.2026), "wie bei Letterboxd". Nur in der
// installierten App: im Browser zieht man schon so, und Safari wie Chrome
// laden dann die ganze Seite neu – ein zweites Ziehen darüber käme sich mit
// dem eingebauten in die Quere. Installiert gibt es keines.
//
// Gezogen wird ein gefüllter Kreis mit einer Musiknote oben auf der Seite;
// der Inhalt rückt mit, und ein goldener Ring um den Kreis schließt sich mit
// dem Weg des Fingers. Ab SCHWELLE ist er zu, die Note leuchtet auf und
// (Android) das Gerät vibriert kurz – loslassen aktualisiert, solange dreht
// sich ein Bogen des Rings um die Note. Darunter schnappt alles zurück. Das Federn der Seite unterdrückt das Ziehen selbst, solange es
// läuft, damit nur eine Bewegung zu sehen ist.

import { istInstalliert } from './installHinweis.js';
import { tippen } from './haptik.js';

/** So weit (in Pixeln, nach der Dämpfung) muss man ziehen. */
export const SCHWELLE = 64;
const HOECHSTENS = 104;
/** Der Finger bewegt den Kreis nur halb so weit – es soll sich nach Widerstand anfühlen. */
const DAEMPFUNG = 0.5;

const NOTE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 17.4V4.6c2.4 1.5 4.6 2.3 6.6 4.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="8.1" cy="17.5" rx="3.1" ry="2.4" transform="rotate(-22 8.1 17.5)" fill="currentColor"/></svg>';

const ganzOben = () => (document.scrollingElement?.scrollTop ?? window.scrollY ?? 0) <= 0;

/**
 * @param {HTMLElement} seite  die Seite, über der gezogen wird
 * @param {() => Promise<unknown>|unknown} aktualisieren
 * @param {object} [o]
 * @param {boolean} [o.aktiv]  sonst nur in der installierten App
 */
export function ziehenZumAktualisieren(seite, aktualisieren, { aktiv = istInstalliert() } = {}) {
    if (!aktiv) return;

    const anzeige = document.createElement('div');
    anzeige.className = 'ziehen';
    anzeige.setAttribute('aria-hidden', 'true');
    anzeige.innerHTML = `<span class="ziehen__kreis">${NOTE}</span>`;
    seite.prepend(anzeige);

    let start = null;   // { x, y } des Fingers beim Aufsetzen
    let zieht = false;  // die Bewegung gehört uns (senkrecht nach unten)
    let weg = 0;
    let bereit = false;
    let laeuft = false;

    const zeige = (hoehe) => {
        weg = hoehe;
        anzeige.style.height = `${hoehe}px`;
        anzeige.style.setProperty('--ziehen', String(Math.min(1, hoehe / SCHWELLE)));
    };

    const zurueck = () => {
        anzeige.classList.add('ziehen--zurueck');
        anzeige.classList.remove('ziehen--bereit', 'ziehen--laeuft');
        bereit = false;
        zeige(0);
    };

    function abmelden() {
        document.removeEventListener('touchstart', beginn);
        document.removeEventListener('touchmove', bewegung);
        document.removeEventListener('touchend', ende);
        document.removeEventListener('touchcancel', ende);
    }

    function beginn(e) {
        if (!seite.isConnected) { abmelden(); return; }
        if (laeuft || e.touches.length !== 1 || !ganzOben()) return;
        // Nicht aus einem offenen Fenster oder dem Menü heraus.
        if (document.querySelector('.modal--active, .nav-links--open')) return;
        start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        zieht = false;
    }

    function bewegung(e) {
        if (!start || laeuft) return;
        const dx = e.touches[0].clientX - start.x;
        const dy = e.touches[0].clientY - start.y;
        if (!zieht) {
            // Erst entscheiden, wem die Bewegung gehört: seitwärts (ein
            // Karussell) oder nach oben (scrollen) ist nicht unsere.
            if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
            if (dy <= 0 || Math.abs(dx) > dy || !ganzOben()) { start = null; return; }
            zieht = true;
            anzeige.classList.remove('ziehen--zurueck');
        }
        if (e.cancelable) e.preventDefault();
        zeige(Math.max(0, Math.min(HOECHSTENS, dy * DAEMPFUNG)));
        const jetzt = weg >= SCHWELLE;
        if (jetzt !== bereit) {
            bereit = jetzt;
            anzeige.classList.toggle('ziehen--bereit', jetzt);
            if (jetzt) tippen();
        }
    }

    function ende() {
        if (!start) return;
        const losgelassen = zieht && bereit;
        start = null;
        zieht = false;
        if (!losgelassen) { zurueck(); return; }
        laeuft = true;
        anzeige.classList.add('ziehen--zurueck', 'ziehen--laeuft');
        zeige(SCHWELLE * 0.8);
        Promise.resolve()
            .then(aktualisieren)
            .catch(e => console.warn('[Aktualisieren] fehlgeschlagen', e))
            .finally(() => {
                laeuft = false;
                // Meist ist die Seite inzwischen neu gezeichnet und diese weg.
                if (seite.isConnected) zurueck(); else abmelden();
            });
    }

    document.addEventListener('touchstart', beginn, { passive: true });
    document.addEventListener('touchmove', bewegung, { passive: false });
    document.addEventListener('touchend', ende);
    document.addEventListener('touchcancel', ende);
}
