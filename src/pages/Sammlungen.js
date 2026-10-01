// Sammlungen: wie weit man bei Ring, Da-Ponte-Opern, Berliner Häusern & Co.
// ist (src/data/sammlungen.js). Gestaltet wie "Deine Komponisten" in "Was
// dir noch fehlt": aufgeklappt die Teile, gesehene mit Haken; läuft ein
// fehlendes Werk demnächst oder hat ein fehlendes Haus Abende, trägt es den
// goldenen Punkt, und der Hinweis nennt das nächste.
//
// #/sammlungen zeigt alle, #/sammlungen/ring öffnet eine.

import { icon } from '../components/Icon.js';
import { eigeneSammlungen, begonnen, sammlungKopf, teilChip } from '../components/SammlungBalken.js';
import { leerHTML } from '../components/Leer.js';
import { escapeHTML, getCachedPosition } from '../utils.js';
import { operas } from '../data/operas.js';
import { kommendeAuffuehrungen, abendeImHaus, terminKurz } from '../data/spielplanAbfrage.js';

/** Das Nächste zu einem fehlenden Teil, als kurzer Text – oder null. */
function naechstes(sammlung, teil, position) {
    if (sammlung.art === 'werke') {
        const n = kommendeAuffuehrungen(teil.id, { position })[0];
        return n ? `${n.haus.name} · ab ${terminKurz(n.termine[0])}` : null;
    }
    if (sammlung.art === 'haeuser') {
        const abend = abendeImHaus(teil.id)[0];
        const werk = abend && operas.find(o => o.id === abend.werk);
        return werk ? `${werk.title} · ${terminKurz(abend.datum)}` : null;
    }
    return null;
}

function zeile(stand, offen, position) {
    const { sammlung } = stand;
    const hinweise = stand.teile.filter(t => !t.erledigt).map(t => naechstes(sammlung, t, position)).filter(Boolean);
    return `
      <details class="sammlung__zeile" id="sammlung-${escapeHTML(sammlung.id)}"${offen ? ' open' : ''}>
        <summary class="sammlung__kopf">${sammlungKopf(stand)}</summary>
        <div class="sammlung__werke">
          ${hinweise.length ? `<p class="sammlung__hinweis"><span class="blindspot__punkt"></span>${escapeHTML(hinweise[0])}</p>` : ''}
          ${stand.teile.map(t => teilChip(sammlung, t, t.erledigt ? null : naechstes(sammlung, t, position))).join('')}
        </div>
      </details>`;
}

export function SammlungenPage(sprungZu = null) {
    const page = document.createElement('div');
    page.className = 'page page--sammlungen';
    const position = getCachedPosition();

    // Nur begonnene Sammlungen – "0 von 10" demotiviert. Ausnahme: die eine,
    // zu der ein Link ausdrücklich führt (#/sammlungen/ring).
    const alle = eigeneSammlungen();
    const sichtbar = alle.filter(s => begonnen(s) || s.sammlung.id === sprungZu);
    const weitere = alle.length - sichtbar.length;
    page.innerHTML = `
      <div class="page-header">
        <h1 class="page-header__title">${icon('layers')}Sammlungen</h1>
        <p class="page-header__subtitle">Geloggt oder als gesehen markiert</p>
      </div>
      ${sichtbar.length ? `
      <div class="sammlung">
        ${sichtbar.map(stand => zeile(stand, stand.sammlung.id === sprungZu, position)).join('')}
      </div>
      ${weitere ? `<p class="sammlung__weitere">${weitere} weitere erscheinen mit dem ersten passenden Abend.</p>` : ''}`
        : leerHTML({
            zeichen: 'layers',
            titel: 'Noch keine Sammlung begonnen',
            text: 'Mit dem ersten passenden Abend erscheint hier die erste – etwa der Ring oder Mozarts Da-Ponte-Opern.',
            knopf: { text: 'Abend loggen', href: '#/log' },
        })}`;

    const offen = sprungZu && page.querySelector(`#sammlung-${CSS.escape(sprungZu)}`);
    // Nur so weit wie nötig: steht sie schon im Bild, bleibt die Seite stehen.
    if (offen) requestAnimationFrame(() => offen.scrollIntoView({ block: 'nearest' }));
    return page;
}
