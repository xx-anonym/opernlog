// Die Zurück-Geste schließt ein offenes Fenster, statt die Seite zu verlassen.
//
// Auf Android schließt man Dialoge gewohnheitsmäßig mit "Zurück", ebenso mit
// der Wisch-Geste in Safari. Vorher verließ diese Geste die ganze Seite – ein
// halb ausgefülltes "Profil bearbeiten" war dann weg.
//
// Wie es geht: Jedes offene Fenster (.modal) bekommt einen eigenen Eintrag im
// Verlauf, mit derselben Adresse und der Tiefe im state. "Zurück" landet dann
// auf dem Eintrag darunter, und hier wird das oberste Fenster geschlossen.
// Schließt jemand ein Fenster auf anderem Weg (Abbrechen, Klick daneben,
// Escape), wird der eigene Eintrag wieder vom Verlauf genommen – sonst müsste
// man danach einmal zu oft zurück.
//
// Geschlossen wird über einen Klick auf die Fläche neben dem Fenster
// (.modal__overlay). Den gibt es bei jedem Fenster der App, und er macht
// überall dasselbe wie "Abbrechen".
//
// Kein Fenster muss dafür etwas tun: welche offen sind, liest diese Datei aus
// dem DOM. Auch künftige Fenster sind damit abgedeckt, solange sie .modal
// heißen und einen .modal__overlay haben.

const SCHLUESSEL = 'opernlogFenster';

function offeneFenster() {
    return [...document.querySelectorAll('.modal')]
        .filter(el => el.isConnected && getComputedStyle(el).display !== 'none');
}

const tiefe = () => Number(history.state?.[SCHLUESSEL]) || 0;

let gestartet = false;
let wartet = false;
let geplant = false;

/**
 * Bringt Verlauf und offene Fenster in Einklang: je Fenster ein Eintrag.
 * Läuft nach jeder Änderung am DOM, gebündelt.
 */
function abgleichen() {
    geplant = false;
    if (wartet) return;
    const offen = offeneFenster().length;
    const d = tiefe();

    if (offen > d) {
        for (let i = d + 1; i <= offen; i++) {
            history.pushState({ ...(history.state || {}), [SCHLUESSEL]: i }, '');
        }
        return;
    }

    if (offen < d) {
        // Erst im nächsten Durchlauf und dann noch einmal nachsehen: führt der
        // Klick, der das Fenster schloss, gleichzeitig woandershin (eine Zeile
        // im Listenfenster), liegt dann schon der neue Eintrag obenauf. Ein
        // "Zurück" ginge dann von der neuen Seite wieder weg.
        setTimeout(() => {
            const jetzt = offeneFenster().length;
            const dJetzt = tiefe();
            if (wartet || jetzt >= dJetzt) return;
            wartet = true;
            // Falls kein popstate kommt, nicht für immer stehenbleiben.
            setTimeout(() => { wartet = false; }, 1000);
            history.go(jetzt - dJetzt);
        }, 0);
    }
}

function planen() {
    if (geplant) return;
    geplant = true;
    queueMicrotask(abgleichen);
}

function beiZurueck() {
    wartet = false;
    const fenster = offeneFenster();
    const d = tiefe();
    if (fenster.length > d) {
        // Die obersten schließen – das zuletzt geöffnete steht im DOM hinten.
        fenster.slice(d).reverse().forEach(el => {
            el.querySelector('.modal__overlay')?.click();
        });
    }
    // Liegt jetzt ein Eintrag für ein Fenster obenauf, das es nicht mehr gibt
    // (etwa nach einem Wechsel auf eine andere Seite aus dem Fenster heraus),
    // räumt abgleichen() ihn weg.
    planen();
}

/** Einmal beim Start aufrufen. */
export function zurueckGesteEinrichten() {
    if (gestartet || typeof MutationObserver !== 'function') return;
    gestartet = true;
    new MutationObserver(planen).observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden'],
    });
    window.addEventListener('popstate', beiZurueck);
    planen();
}
