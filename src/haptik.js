// Haptisches Feedback: ein kurzes Klicken an wenigen Stellen, wo eine
// Bestätigung guttut – Stern gesetzt, Abend gespeichert, Gefällt mir,
// Vormerken, Wunschliste, nächster Termin unter "Demnächst" (Jonas,
// 3.10.2026). Nicht bei gewöhnlicher Navigation. Die Stellen tragen
// data-haptik.
//
// Android: tippen() ruft die Vibrationsschnittstelle des Browsers.
//
// iPhone: Safari kennt sie nicht. Der Ein/Aus-Schalter (<input
// type="checkbox" switch>) klickt aber haptisch, wenn man ihn umlegt.
// Seit iOS 26.5 nur noch bei einer echten Berührung des Schalters oder
// seines <label> – ein Schalter, den das Programm umlegt, bleibt stumm.
// Auf Jonas' iPhone (iOS 27) blieb es so still. Deshalb liegt auf jeder
// data-haptik-Stelle ein unsichtbares <label> mit Schalter: der Finger
// trifft das Label, das iPhone klickt, und der Klick läuft wie sonst zur
// Stelle weiter. Ein Kniff, kein offizieller Weg: nimmt Apple ihn weg,
// fehlt nur das Klicken.

export const istIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Ein kurzes Vibrieren – nur Android; das iPhone klickt über die Flächen. */
export function tippen() {
    try {
        if (!istIos() && typeof navigator.vibrate === 'function') navigator.vibrate(10);
    } catch { /* kein Klicken – mehr nicht */ }
}

function flaecheAnlegen(stelle) {
    if (stelle.querySelector(':scope > .haptik-flaeche')) return;
    if (getComputedStyle(stelle).position === 'static') stelle.style.position = 'relative';
    const flaeche = document.createElement('label');
    flaeche.className = 'haptik-flaeche';
    flaeche.setAttribute('aria-hidden', 'true');
    const schalter = document.createElement('input');
    schalter.type = 'checkbox';
    schalter.setAttribute('switch', '');
    schalter.tabIndex = -1;
    flaeche.appendChild(schalter);
    // Der Finger trifft das Label. Dessen Klick hält es selbst an; erst
    // legt das Label den Schalter um (dabei klickt das iPhone), dann geht
    // ein Klick an die Stelle – an die Position des Fingers, damit etwa der
    // halbe Stern stimmt. Liefe der Klick gleich weiter, könnte die Stelle
    // sich sperren oder neu zeichnen, bevor der Schalter umliegt – dann
    // bliebe es still.
    schalter.addEventListener('click', e => e.stopPropagation());
    flaeche.addEventListener('click', (e) => {
        e.stopPropagation();
        const lage = { clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY };
        setTimeout(() => {
            if (stelle.disabled || !stelle.isConnected) return;
            stelle.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window, ...lage }));
        }, 0);
    });
    stelle.appendChild(flaeche);
}

function flaechenIn(wurzel) {
    if (!(wurzel instanceof Element)) return;
    if (wurzel.matches('[data-haptik]')) flaecheAnlegen(wurzel);
    wurzel.querySelectorAll('[data-haptik]').forEach(flaecheAnlegen);
}

/**
 * Auf dem iPhone die Flächen anlegen und anlegen lassen – auch für Stellen,
 * die später entstehen oder ihren Inhalt neu bekommen (das Lesezeichen
 * tauscht beim Umschalten sein Zeichen aus). Einmal beim Start.
 */
export function haptikEinrichten() {
    if (!istIos()) return;
    flaechenIn(document.body);
    new MutationObserver((aenderungen) => {
        for (const a of aenderungen) {
            a.addedNodes.forEach(flaechenIn);
            const stelle = a.target instanceof Element ? a.target.closest('[data-haptik]') : null;
            if (stelle) flaecheAnlegen(stelle);
        }
    }).observe(document.body, { childList: true, subtree: true });
}
