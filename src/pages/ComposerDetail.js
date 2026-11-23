// Komponistenseite – Kurzbiografie, Porträt und die eigenen Abende
//
// Der Anfang der Künstlerseiten, und bewusst nur die Komponisten: ihre Namen
// stehen im Werkkatalog und werden von einer Prüfung einheitlich gehalten.
// Für Dirigenten, Regie und Besetzung gilt das nicht – die stehen als Freitext
// in den Besuchen, wo "J. Kaufmann" und "Jonas Kaufmann" zwei Personen wären.

import { operas } from '../data/operas.js';
import { composerByName } from '../data/composers.js';
import { composers } from '../data/composers.js';
import { store } from '../store/store.js';
import { icon } from '../components/Icon.js';
import { escapeHTML, einblendVerzoegerung } from '../utils.js';
import { zurueckLink } from '../components/ZurueckLink.js';

/** Ein Wikimedia-Vorschaubild in einer der festen Breiten, sonst wie es ist. */
const vorschau = (bild, breite) => String(bild || '').replace(/\/\d+px-([^/]+)$/, `/${breite}px-$1`);

/** Eine Bewertung als "4,2". */
function note(n) {
    return n.toFixed(1).replace('.', ',');
}

/**
 * Die Initialen eines Komponistennamens, höchstens drei: aus "Bernd Alois
 * Zimmermann" wird BAZ.
 *
 * Namenszusätze fallen heraus. "von" und "van" fangen klein an, das genügt als
 * Regel – "Carl Maria von Weber" ergibt CMW und nicht CMV. Ordnungszahlen
 * müssen eigens weg, sonst stünde bei "Johann Strauss II" ein I am Ende.
 */
export function initialen(name) {
    return String(name || '')
        .split(/[\s-]+/)
        .filter(teil => /^[A-ZÄÖÜÀ-Þ]/.test(teil) && !/^[IVXLC]+$/.test(teil))
        .map(teil => teil[0])
        .slice(0, 3)
        .join('');
}

export function ComposerDetailPage(composerId) {
    const komponist = composers.find(c => c.id === composerId) || null;

    const page = document.createElement('div');
    page.className = 'page page--composer-detail';

    if (!komponist) {
        page.innerHTML = '<div class="empty-state"><p>Komponist nicht gefunden.</p><a href="#/operas" class="btn btn--primary">Zu den Opern</a></div>';
        return page;
    }

    const werke = operas
        .filter(o => o.composer === komponist.name)
        .sort((a, b) => (a.yearComposed || 0) - (b.yearComposed || 0));

    // Die eigenen Abende mit diesem Komponisten. Aus den lokalen Besuchen, wie
    // beim Werkverlauf – die Seite steht damit sofort und wartet auf nichts.
    const werkIds = new Set(werke.map(o => o.id));
    const abende = store.getAllVisits().filter(v => werkIds.has(v.operaId));
    const bewertet = abende.map(v => Number(v.rating)).filter(n => Number.isFinite(n) && n > 0);
    const schnitt = bewertet.length ? bewertet.reduce((s, n) => s + n, 0) / bewertet.length : null;

    // Gesehen heißt geloggt oder markiert. Wer ein Werk vor OpernLog gesehen
    // hat, trägt es ohne Datum, Haus und Bewertung ein – es hier wegzulassen
    // hieße, ihm sein halbes Opernleben nicht anzurechnen.
    const geloggt = new Set(abende.map(v => v.operaId));
    const markiert = new Set(werke.filter(o => !geloggt.has(o.id) && store.isSeenOpera(o.id)).map(o => o.id));
    const gesehen = geloggt.size + markiert.size;

    // Ohne freies Porträt die Initialen im Kreis statt eines leeren Verlaufs.
    //
    // Für Bernd Alois Zimmermann gibt es nachweislich keins: weder die
    // deutsche noch sechs weitere Wikipedias führen ein Artikelbild, Wikidata
    // hat kein P18, seine Commons-Kategorie enthält drei Dateien, von denen
    // keine ihn zeigt, und kein Bild ist als "bildet ihn ab" ausgezeichnet.
    // Er starb 1970; Fotos von ihm sind noch geschützt. Ein Bild von einer
    // Verlagsseite zu holen schied aus – der Service Worker kennt fremde
    // Hosts nicht, und die Rechte daran sind ungeklärt.
    //
    // Der Verlauf allein sah aus wie ein Fehler. Die Initialen sagen: hier
    // fehlt nichts, hier ist keins.
    //
    // Aufbau seit 23.11.2026 wie die Personenseite (Jonas): Kopf als Karte
    // mit rundem Bild und Plaketten, die Werke als Karten mit Plakat.
    const portraetHTML = komponist.bild
        ? `<div class="person-hero__bild composer-hero__portrait">
             <img class="person-bild__bild" src="${escapeHTML(vorschau(komponist.bild, 330))}"
                  alt="Porträt von ${escapeHTML(komponist.name)}" decoding="async">
           </div>`
        : `<div class="person-hero__bild composer-hero__portrait composer-hero__portrait--monogramm"
                role="img" aria-label="Kein freies Porträt von ${escapeHTML(komponist.name)} vorhanden">
             <span class="person-hero__initialen" aria-hidden="true">${escapeHTML(initialen(komponist.name))}</span>
           </div>`;
    const plakette = (inhalt) => `<span class="person-hero__plakette">${inhalt}</span>`;
    const anteil = werke.length ? Math.round(gesehen / werke.length * 100) : 0;

    page.innerHTML = `
      ${zurueckLink('#/operas')}
      <section class="person-hero composer-hero">
        ${portraetHTML}
        <div class="person-hero__text">
          <h1 class="person-hero__name composer-hero__name">${escapeHTML(komponist.name)}</h1>
          <p class="person-hero__beschreibung composer-hero__kurz">${escapeHTML(komponist.kurz)}</p>
          <div class="person-hero__zahlen">
            ${plakette(`<b>${werke.length}</b> ${werke.length === 1 ? 'Werk' : 'Werke'} im Katalog`)}
            ${abende.length ? plakette(`<b>${abende.length}</b> ${abende.length === 1 ? 'Abend' : 'Abende'} mit dir`) : ''}
            ${schnitt !== null ? plakette(`<b>${note(schnitt)}</b> ★ im Schnitt`) : ''}
          </div>
        </div>
      </section>

      <div class="detail-body">
        <div class="detail-section">
          <p class="detail-description composer-bio">${escapeHTML(komponist.bio)}</p>
          <!-- Pflicht, keine Höflichkeit: der Text stammt aus der Wikipedia und
               steht unter CC BY-SA 4.0. Ohne Herkunft, Lizenz und Link dürfte
               er hier nicht stehen. -->
          <p class="composer-quelle">
            Text aus der <a href="${komponist.wikipedia}" target="_blank" rel="noopener noreferrer">deutschen Wikipedia</a>,
            <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.de" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>.
            ${komponist.bild ? `Porträt: ${escapeHTML(komponist.bildUrheber || 'unbekannt')}${komponist.bildLizenz ? `, ${escapeHTML(komponist.bildLizenz)}` : ''}.` : ''}
          </p>
        </div>

        <h2 class="person-abende__titel">Werke</h2>
        ${gesehen ? `
        <div class="composer-werke__fortschritt">
          <p class="person-abende__unter composer-werke__fazit">${gesehen} von ${werke.length} ${werke.length === 1 ? 'Werk' : 'Werken'} gesehen</p>
          <div class="composer-werke__balken" role="presentation"><span style="width:${anteil}%"></span></div>
        </div>` : ''}
        <ul class="composer-werke">
          ${werke.map((o, i) => {
              const eigene = abende.filter(v => v.operaId === o.id).length;
              // Drei Zustände, absichtlich verschieden benannt: die Zahl der
              // Abende, das Häkchen für "vor OpernLog gesehen" – ohne Datum,
              // Haus und Bewertung – und nichts.
              const zeichen = eigene
                  ? `<span class="composer-werke__abende" title="${eigene} ${eigene === 1 ? 'Abend' : 'Abende'} geloggt">${eigene}× gesehen</span>`
                  : markiert.has(o.id)
                      ? `<span class="composer-werke__abende composer-werke__abende--markiert"
                               title="Als gesehen markiert, ohne geloggten Abend">${icon('checkCircle', { label: 'Schon gesehen' })}gesehen</span>`
                      : '';
              const bild = vorschau(o.image, 250);
              return `
          <li class="composer-werke__eintrag fade-in${eigene || markiert.has(o.id) ? ' composer-werke__eintrag--gesehen' : ''}" style="animation-delay:${einblendVerzoegerung(i)}">
            <a class="composer-werke__zeile" href="#/opera/${o.id}">
              ${bild ? `<img class="composer-werke__plakat" src="${escapeHTML(bild)}" alt="" loading="lazy" decoding="async">` : '<span class="composer-werke__plakat composer-werke__plakat--leer" aria-hidden="true"></span>'}
              <span class="composer-werke__text">
                <span class="composer-werke__jahr">${o.yearComposed || ''}</span>
                <span class="composer-werke__titel">${escapeHTML(o.title)}</span>
              </span>
              ${zeichen}
            </a>
          </li>`;
          }).join('')}
        </ul>
      </div>
    `;

    return page;
}

/** Der Name als Link auf die Komponistenseite, sonst als bloßer Text. */
export function composerLink(name, inhalt = null) {
    const k = composerByName(name);
    const text = inhalt ?? escapeHTML(name);
    return k ? `<a class="composer-link" href="#/composer/${k.id}">${text}</a>` : text;
}
