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
import { coverBackground, escapeHTML, einblendVerzoegerung } from '../utils.js';

/** Eine Bewertung als "4,2". */
function note(n) {
    return n.toFixed(1).replace('.', ',');
}

export function ComposerDetailPage(composerId) {
    const komponist = composers.find(c => c.id === composerId) || null;

    const page = document.createElement('div');
    page.className = 'page page--composer-detail';

    if (!komponist) {
        page.innerHTML = '<div class="empty-state">Komponist nicht gefunden.</div>';
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
    const gesehen = new Set(abende.map(v => v.operaId)).size;

    const bildStil = coverBackground(
        komponist.bild,
        // Ohne freies Porträt bleibt der Verlauf – dieselbe Rückfallebene wie
        // bei den Häusern. Vier Komponisten trifft das: ihre Fotos sind noch
        // geschützt, Wikipedia hat keins, das hier stehen dürfte.
        'linear-gradient(135deg, #8b1a2b, #14181c)',
        'rgba(0,0,0,0.15), rgba(20,24,28,0.6)'
    );

    page.innerHTML = `
      <div class="composer-hero">
        <a href="javascript:void(0)" class="back-link" onclick="history.back()">← Zurück</a>
        <div class="composer-hero__row">
          <div class="composer-hero__portrait" style="${bildStil}" role="img"
               aria-label="${komponist.bild ? `Porträt von ${escapeHTML(komponist.name)}` : 'Kein Porträt vorhanden'}"></div>
          <div class="composer-hero__text">
            <h1 class="composer-hero__name">${escapeHTML(komponist.name)}</h1>
            <p class="composer-hero__kurz">${escapeHTML(komponist.kurz)}</p>
            <div class="composer-hero__zahlen">
              <span>${icon('music', { className: 'icon--meta' })}${werke.length} ${werke.length === 1 ? 'Werk' : 'Werke'} im Katalog</span>
              ${abende.length ? `<span>${icon('calendar', { className: 'icon--meta' })}${abende.length} ${abende.length === 1 ? 'Abend' : 'Abende'} von dir</span>` : ''}
              ${schnitt !== null ? `<span>${icon('star', { filled: true, className: 'icon--meta' })}${note(schnitt)} im Schnitt</span>` : ''}
            </div>
          </div>
        </div>
      </div>

      <div class="detail-body">
        <div class="detail-section">
          <p class="detail-description">${escapeHTML(komponist.bio)}</p>
          <!-- Pflicht, keine Höflichkeit: der Text stammt aus der Wikipedia und
               steht unter CC BY-SA 4.0. Ohne Herkunft, Lizenz und Link dürfte
               er hier nicht stehen. -->
          <p class="composer-quelle">
            Text aus der <a href="${komponist.wikipedia}" target="_blank" rel="noopener noreferrer">deutschen Wikipedia</a>,
            <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.de" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>.
            ${komponist.bild ? `Porträt: ${escapeHTML(komponist.bildUrheber || 'unbekannt')}${komponist.bildLizenz ? `, ${escapeHTML(komponist.bildLizenz)}` : ''}.` : ''}
          </p>
        </div>

        <div class="detail-section">
          <h2 class="section__title">
            ${icon('music')}Werke
            <span class="section__count">${werke.length}</span>
          </h2>
          <ul class="composer-werke">
            ${werke.map((o, i) => {
                const eigene = abende.filter(v => v.operaId === o.id).length;
                return `
              <li class="composer-werke__eintrag fade-in" style="animation-delay:${einblendVerzoegerung(i)}">
                <a class="composer-werke__zeile" href="#/opera/${o.id}">
                  <span class="composer-werke__jahr">${o.yearComposed || ''}</span>
                  <span class="composer-werke__titel">${escapeHTML(o.title)}</span>
                  ${eigene
                    ? `<span class="composer-werke__abende">${eigene}×</span>`
                    : '<span class="composer-werke__abende composer-werke__abende--leer"></span>'}
                </a>
              </li>`;
            }).join('')}
          </ul>
          ${gesehen
            ? `<p class="composer-werke__fazit">${gesehen} von ${werke.length} ${werke.length === 1 ? 'Werk' : 'Werken'} gesehen</p>`
            : ''}
        </div>
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
