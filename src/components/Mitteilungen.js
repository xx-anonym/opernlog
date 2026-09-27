// Push-Mitteilungen im Fenster "Profil bearbeiten": ein- und ausschalten,
// Probe schicken.
//
// Gilt für dieses Gerät, nicht fürs Konto – wer iPhone und Mac hat, schaltet
// auf beiden ein. Die Anlässe legt der Server fest (supabase/migrations/
// push_migration.sql); hier stehen sie nur zum Nachlesen.

import * as sb from '../store/supabase.js';
import { icon } from './Icon.js';
import { pushZustand, pushAn, pushEinschalten, pushAusschalten } from '../push.js';

const STANDARD = {
    zustand: () => pushZustand(),
    istAn: () => pushAn(),
    schluessel: () => sb.pushSchluessel(),
    einschalten: (schluessel) => pushEinschalten({ schluessel }),
    ausschalten: () => pushAusschalten(),
    probe: () => sb.pushTest(),
};

/**
 * @param {object} [dienste] für Tests austauschbar
 * @returns {HTMLElement|null} null, wenn der Browser gar keine Mitteilungen kann
 */
export function mitteilungenBereich(dienste = {}) {
    const d = { ...STANDARD, ...dienste };
    const zustand = d.zustand();
    if (zustand === 'unmoeglich') return null;

    // Eine schlichte Zeile wie die übrigen im Fenster: Titel links, Knöpfe
    // rechts, darunter klein der Stand. Welche Anlässe es gibt, stand hier
    // früher als Absatz – zu viel für einen Schalter (Jonas, 27.09.2026).
    const bereich = document.createElement('section');
    bereich.className = 'mitteilungen konto-abschnitt';
    bereich.innerHTML = `
      <div class="konto-abschnitt__kopf">
        <h3 class="konto-abschnitt__titel">${icon('bell')}Mitteilungen</h3>
        <div class="mitteilungen__knoepfe"></div>
      </div>
      <p class="mitteilungen__stand konto-abschnitt__stand" aria-live="polite"></p>
      <p class="auth-error mitteilungen__fehler" hidden></p>`;

    const stand = bereich.querySelector('.mitteilungen__stand');
    const fehlerEl = bereich.querySelector('.mitteilungen__fehler');
    const knoepfe = bereich.querySelector('.mitteilungen__knoepfe');

    const zeigeFehler = (text) => { fehlerEl.textContent = text || ''; fehlerEl.hidden = !text; };

    if (zustand === 'installieren') {
        stand.textContent = 'Auf dem iPhone kommen Mitteilungen nur an, wenn OpernLog auf dem Home-Bildschirm liegt: in Safari auf „Teilen“ tippen (neues Safari: im Menü der Adressleiste), dann „Zum Home-Bildschirm“. Danach OpernLog von dort öffnen und hier einschalten.';
        return bereich;
    }
    if (zustand === 'verweigert') {
        stand.textContent = 'In den Einstellungen dieses Geräts gesperrt.';
        return bereich;
    }

    // Vorab holen: Safari stellt die Erlaubnisfrage nur direkt nach dem
    // Tippen, ein Netzaufruf dazwischen kann das verhindern.
    let schluessel = null;
    Promise.resolve().then(() => d.schluessel()).then(s => { schluessel = s; }).catch(() => {});

    function zeigeAus() {
        stand.textContent = 'Auf diesem Gerät ausgeschaltet.';
        knoepfe.innerHTML = `<button type="button" class="btn btn--ghost btn--sm" id="mitteilungenAnBtn">Einschalten</button>`;
        const an = knoepfe.querySelector('#mitteilungenAnBtn');
        an.addEventListener('click', async () => {
            zeigeFehler('');
            an.disabled = true;
            try {
                const ergebnis = await d.einschalten(schluessel);
                if (ergebnis === 'an') zeigeAn();
                else if (ergebnis === 'verweigert') {
                    stand.textContent = 'In den Einstellungen dieses Geräts gesperrt.';
                    knoepfe.innerHTML = '';
                } else an.disabled = false;
            } catch (err) {
                console.error('Mitteilungen einschalten', err);
                zeigeFehler('Mitteilungen ließen sich nicht einschalten. Bitte versuch es noch einmal.');
                an.disabled = false;
            }
        });
    }

    function zeigeAn() {
        stand.textContent = 'Auf diesem Gerät eingeschaltet.';
        knoepfe.innerHTML = `
          <button type="button" class="btn btn--ghost btn--sm" id="mitteilungenProbeBtn">Probe schicken</button>
          <button type="button" class="btn btn--ghost btn--sm" id="mitteilungenAusBtn">Ausschalten</button>`;
        const probe = knoepfe.querySelector('#mitteilungenProbeBtn');
        const aus = knoepfe.querySelector('#mitteilungenAusBtn');

        probe.addEventListener('click', async () => {
            zeigeFehler('');
            probe.disabled = true;
            try {
                const unterwegs = await d.probe();
                stand.textContent = unterwegs
                    ? 'Probe ist unterwegs – sie sollte in ein paar Sekunden erscheinen.'
                    : 'Gerade erst eine geschickt. In einer Minute geht die nächste.';
            } catch (err) {
                console.error('Probemitteilung', err);
                zeigeFehler('Die Probe ließ sich nicht schicken.');
            } finally {
                probe.disabled = false;
            }
        });

        aus.addEventListener('click', async () => {
            zeigeFehler('');
            aus.disabled = true;
            try {
                await d.ausschalten();
                zeigeAus();
            } catch (err) {
                console.error('Mitteilungen ausschalten', err);
                zeigeFehler('Mitteilungen ließen sich nicht ausschalten.');
                aus.disabled = false;
            }
        });
    }

    stand.textContent = 'Wird geprüft …';
    Promise.resolve().then(() => d.istAn())
        .then(an => (an ? zeigeAn() : zeigeAus()))
        .catch(err => {
            console.error('Mitteilungen prüfen', err);
            zeigeAus();
        });

    return bereich;
}
