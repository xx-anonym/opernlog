// Haptisches Feedback: ein kurzes Klicken an wenigen Stellen, wo eine
// Bestätigung guttut – Stern gesetzt, Abend gespeichert, Gefällt mir,
// Vormerken, Wunschliste, nächster Termin unter "Demnächst" (Jonas,
// 3.10.2026). Nicht bei gewöhnlicher Navigation.
//
// Android: die Vibrationsschnittstelle des Browsers.
// iPhone: Safari kennt sie nicht, auch nicht als App auf dem Home-
// Bildschirm. Seit iOS 18 klickt aber der Ein/Aus-Schalter
// (<input type="checkbox" switch>) beim Umlegen haptisch. Ein unsichtbarer
// Schalter, beim Antippen mit umgelegt, gibt also das Klicken – nur
// unmittelbar nach einer Berührung und nur, wenn "Systemhaptik" an ist.
// Ein Kniff, kein offizieller Weg: nimmt Apple ihn weg, fehlt nur das
// Klicken.

const istIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Für jedes Klicken ein frischer, unsichtbarer Schalter im <head>, gleich
// wieder entfernt – so, wie es die bekannten Umsetzungen tun. Die erste
// Fassung (ein bleibender Schalter im <body>, außerhalb des Bildes) gab auf
// Jonas' iPhone kein Klicken (3.10.2026).
function iosKlick() {
    const schalter = document.createElement('label');
    schalter.className = 'haptik';
    schalter.setAttribute('aria-hidden', 'true');
    schalter.style.display = 'none';
    const feld = document.createElement('input');
    feld.type = 'checkbox';
    feld.setAttribute('switch', '');
    schalter.appendChild(feld);
    // Der Klick des Schalters darf nirgends ankommen: ein Fenster, das bei
    // Klicks außerhalb schließt, hielte ihn sonst für einen.
    for (const art of ['click', 'change', 'input']) schalter.addEventListener(art, e => e.stopPropagation());
    document.head.appendChild(schalter);
    schalter.click();
    schalter.remove();
}

/** Ein kurzes Klicken. Ohne Wirkung, wo das Gerät es nicht kann. */
export function tippen() {
    try {
        if (typeof navigator.vibrate === 'function' && !istIos()) navigator.vibrate(10);
        else if (istIos()) iosKlick();
    } catch { /* kein Klicken – mehr nicht */ }
}
