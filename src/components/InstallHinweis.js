// Der Hinweis in der oberen Leiste: "OpernLog auf den Home-Bildschirm".
//
// Er steht als letzte Zeile in der Navigation, damit er mit ihr oben
// angeheftet bleibt. Wegklicken lässt er sich nicht: solange die App im
// Browser läuft, stimmt er.
//
// Android bietet ein eigenes Installieren an (beforeinstallprompt). Kommt das
// Ereignis, wird daraus ein Knopf; sonst steht der Weg über das Browsermenü da.

import { installHinweisArt } from '../installHinweis.js';

// Das Ereignis kommt kurz nach dem Laden, oft bevor die Navigation steht.
// Deshalb wird es hier schon beim Laden des Moduls abgefangen.
let installAngebot = null;
const beiAngebot = new Set();
if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (e) => {
        // Chromes eigene Einblendung unterdrücken – der Hinweis oben bietet
        // dasselbe an, und zweimal dasselbe verwirrt.
        e.preventDefault();
        installAngebot = e;
        beiAngebot.forEach(f => f());
    });
    window.addEventListener('appinstalled', () => {
        installAngebot = null;
        document.querySelectorAll('.installhinweis').forEach(el => el.remove());
        document.body.classList.remove('mit-installhinweis');
    });
}

const TEILEN = '<svg class="installhinweis__teilen" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-label="Teilen"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>';

/** @returns {HTMLElement|null} */
export function installHinweis(umgebung = globalThis) {
    const art = installHinweisArt(umgebung);
    if (!art) return null;

    const el = document.createElement('div');
    el.className = 'installhinweis';
    el.setAttribute('role', 'note');

    function zeichne() {
        if (art === 'ios') {
            // Seit iOS 26 steht „Teilen“ nicht mehr in der Leiste, sondern im
            // Menü links in der Adressleiste; „Zum Home-Bildschirm“ findet
            // sich dort unter „Mehr anzeigen“. Im iOS-Simulator nachgesehen.
            el.innerHTML = `<span class="installhinweis__text"><strong>Als App nutzen:</strong> Safari ${TEILEN} „Teilen“ (neu: im Menü ≡) → „Zum Home-Bildschirm“. Erst dann gibt es Mitteilungen.</span>`;
        } else if (installAngebot) {
            el.innerHTML = `<span class="installhinweis__text"><strong>Als App nutzen</strong> – mit Mitteilungen und ganzem Bildschirm.</span>
              <button type="button" class="btn btn--primary btn--sm installhinweis__knopf">Installieren</button>`;
            el.querySelector('.installhinweis__knopf').addEventListener('click', async () => {
                const angebot = installAngebot;
                if (!angebot) return;
                installAngebot = null;
                await angebot.prompt();
                // Abgelehnt: das Angebot ist verbraucht, zurück zur Beschreibung.
                const { outcome } = await angebot.userChoice.catch(() => ({ outcome: 'dismissed' }));
                if (outcome !== 'accepted') zeichne();
            });
        } else {
            el.innerHTML = `<span class="installhinweis__text"><strong>Als App nutzen:</strong> Im Menü des Browsers „App installieren“ oder „Zum Startbildschirm hinzufügen“ wählen.</span>`;
        }
    }

    zeichne();
    if (art === 'android') beiAngebot.add(zeichne);
    return el;
}
