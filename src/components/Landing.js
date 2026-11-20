// Die Werbeseite für Besucher ohne Konto (Jonas, 20.11.2026, nach Vorschau).
//
// Wer opernlog.de ohne Konto öffnet, sah bisher gleich die App – mit leeren
// Feldern für Feed und Tagebuch. Konkurrenten wie Stagelog zeigen zuerst, was
// das ist und warum es sich lohnt. Hier: große Zeile, eine gedämpfte Wand aus
// Plakaten und Titelblättern aus dem Katalog, der Vorhang an den Rändern,
// "Kostenlos starten" und "Erst mal stöbern", darunter, was OpernLog kann.
//
// main.js zeigt sie auf #/ und #/home, solange niemand angemeldet ist und
// "Erst mal stöbern" in dieser Sitzung noch nicht getippt wurde (dann kommt
// die gewohnte Startseite). Leiste und Menü der App blendet die Klasse
// mit-landing am body aus; die Seite hat ihren eigenen Kopf.

import { operas } from '../data/operas.js';
import { icon } from './Icon.js';
import { brandMarkSVG } from '../data/brandMark.js';

export const STOEBERN = 'opernlog:stoebern';

// Plakate und Titelblätter, die in der Wand hängen – Bilder aus dem Katalog.
const WAND = ['tosca', 'la-boheme', 'aida', 'la-traviata', 'madama-butterfly', 'rigoletto', 'turandot',
    'fidelio', 'nabucco', 'salome', 'lohengrin', 'tristan', 'don-giovanni', 'carmen'];

/**
 * Die Bilder der Wand in der kleinen 250er-Fassung (Wikimedia liefert nur
 * feste Breiten). Bilder ohne Vorschaufassung bleiben weg – das Original
 * wäre für eine gedämpfte Kachel viel zu groß.
 */
export function wandBilder(liste = operas) {
    return WAND
        .map(id => liste.find(o => o.id === id)?.image || '')
        .filter(u => /\/thumb\/.+\/500px-[^/]+$/.test(u))
        .map(u => u.replace(/\/500px-([^/]+)$/, '/250px-$1'));
}

/** Ob die Werbeseite statt der Startseite kommt. */
export function landingZeigen({ angemeldet, offlineNutzer, umgebung = globalThis }) {
    if (angemeldet || offlineNutzer) return false;
    try { return umgebung.sessionStorage?.getItem(STOEBERN) !== '1'; } catch { return true; }
}

export function LandingPage({ stoebern } = {}) {
    const bilder = wandBilder();
    // Genug Kacheln, dass die schräge Wand auch hohe Bildschirme füllt.
    const kacheln = Array.from({ length: 48 }, (_, i) => bilder[i % bilder.length]).filter(Boolean);
    const merkmal = (name, titel, text) => `
        <div class="landing__merkmal">${icon(name)}<h3>${titel}</h3><p>${text}</p></div>`;

    const page = document.createElement('div');
    page.className = 'landing';
    page.innerHTML = `
        <section class="landing__buehne">
            <div class="landing__wand" aria-hidden="true">${kacheln.map(u => `<img src="${u}" alt="" decoding="async" fetchpriority="low">`).join('')}</div>
            <div class="landing__schleier" aria-hidden="true"></div>
            <div class="landing__vorhang landing__vorhang--links" aria-hidden="true"></div>
            <div class="landing__vorhang landing__vorhang--rechts" aria-hidden="true"></div>
            <header class="landing__kopf">
                <span class="landing__marke">OpernLog</span>
                <a class="landing__anmelden" href="#/auth">Anmelden</a>
            </header>
            <div class="landing__mitte">
                <div class="landing__masken" aria-hidden="true">${brandMarkSVG({ className: "landing__masken-svg" })}</div>
                <h1 class="landing__titel">Jeder Opernabend, <em>festgehalten.</em></h1>
                <p class="landing__unter">Dein Operntagebuch: Abende loggen und bewerten, sehen, was wo läuft, mit Freunden teilen.</p>
                <div class="landing__knoepfe">
                    <a class="landing__knopf landing__knopf--haupt" href="#/auth" data-registrieren>Kostenlos starten</a>
                    <button type="button" class="landing__knopf landing__knopf--leise" data-stoebern>Erst mal stöbern</button>
                </div>
                <p class="landing__vertrauen">Kostenlos · ohne Werbung · ohne Passwort</p>
            </div>
        </section>
        <section class="landing__teil">
            <h2>Was OpernLog kann</h2>
            <div class="landing__merkmale">
                ${merkmal('book', 'Dein Tagebuch', 'Jeder Abend mit Haus, Besetzung, Sternen und ein paar Sätzen – auch Jahre später noch da.')}
                ${merkmal('calendar', 'Spielpläne von über 90 Häusern', 'Was wann wo läuft, in Deutschland, Österreich und der Schweiz.')}
                ${merkmal('music', 'Handlung und bekannte Stellen', 'Zu jedem Werk: worum es geht, Akt für Akt, und welche Stellen man kennen sollte.')}
                ${merkmal('star', 'Dein Saisonrückblick', 'Am Ende der Spielzeit deine Häuser, Komponisten und dein Lieblingsabend – als Story zum Teilen.')}
            </div>
            ${bilder[0] ? `
            <p class="landing__beispiel-kopf">So sieht ein Abend im Tagebuch aus</p>
            <div class="landing__zettel">
                <img src="${bilder[0]}" alt="" loading="lazy" decoding="async">
                <div><b>Tosca</b><span>Semperoper Dresden · Samstag, 28. November</span><div class="landing__sterne" aria-label="4,5 von 5 Sternen">★★★★½</div></div>
            </div>` : ''}
        </section>
        <section class="landing__schluss">
            <a class="landing__knopf landing__knopf--haupt" href="#/auth" data-registrieren>Kostenlos starten</a>
            <p class="landing__fuss"><a href="/oper/">Opern</a> · <a href="/stadt/">Städte</a> · <a href="#/bildnachweise">Bildnachweise</a> · <a href="#/datenschutz">Datenschutz</a></p>
        </section>`;

    // "Kostenlos starten" öffnet die Anmeldung gleich beim Registrieren.
    page.querySelectorAll('[data-registrieren]').forEach(a => a.addEventListener('click', () => {
        try { sessionStorage.setItem('opernlog:authTab', 'register'); } catch { /* dann eben Anmelden */ }
    }));
    page.querySelector('[data-stoebern]').addEventListener('click', () => {
        try { sessionStorage.setItem(STOEBERN, '1'); } catch { /* ohne Speicher: einmal stöbern */ }
        stoebern?.();
    });
    return page;
}
