// Sammlungen: wie weit man bei Ring, Da-Ponte-Opern, Berliner Häusern & Co.
// ist (src/data/sammlungen.js). Gestaltet wie "Deine Komponisten" in "Was
// dir noch fehlt": aufgeklappt die Teile, gesehene mit Haken; läuft ein
// fehlendes Werk demnächst oder hat ein fehlendes Haus Abende, trägt es den
// goldenen Punkt, und der Hinweis nennt das nächste.
//
// #/sammlungen zeigt alle, #/sammlungen/ring öffnet eine.

import { icon } from '../components/Icon.js';
import { eigeneSammlungen, sammlungKopf } from '../components/SammlungBalken.js';
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

function ziel(sammlung, teil) {
    if (sammlung.art === 'werke') return `#/opera/${encodeURIComponent(teil.id)}`;
    if (sammlung.art === 'haeuser') return `#/house/${encodeURIComponent(teil.id)}`;
    return null;
}

function teilHTML(sammlung, teil, position) {
    const hinweis = teil.erledigt ? null : naechstes(sammlung, teil, position);
    const klasse = `blindspot__work${teil.erledigt ? ' sammlung__gesehen' : ''}${hinweis ? ' blindspot__work--laeuft' : ''}`;
    const inhalt = `${teil.erledigt ? icon('check') : ''}${escapeHTML(teil.name)}`;
    const titel = hinweis ? ` title="${escapeHTML(hinweis)}"` : '';
    const link = ziel(sammlung, teil);
    return link ? `<a class="${klasse}" href="${link}"${titel}>${inhalt}</a>` : `<span class="${klasse}"${titel}>${inhalt}</span>`;
}

function zeile(stand, offen, position) {
    const { sammlung } = stand;
    const hinweise = stand.teile.filter(t => !t.erledigt).map(t => naechstes(sammlung, t, position)).filter(Boolean);
    return `
      <details class="sammlung__zeile" id="sammlung-${escapeHTML(sammlung.id)}"${offen ? ' open' : ''}>
        <summary class="sammlung__kopf">${sammlungKopf(stand)}</summary>
        <div class="sammlung__werke">
          ${hinweise.length ? `<p class="sammlung__hinweis"><span class="blindspot__punkt"></span>${escapeHTML(hinweise[0])}</p>` : ''}
          ${stand.teile.map(t => teilHTML(sammlung, t, position)).join('')}
        </div>
      </details>`;
}

export function SammlungenPage(sprungZu = null) {
    const page = document.createElement('div');
    page.className = 'page page--sammlungen';
    const position = getCachedPosition();

    page.innerHTML = `
      <div class="page-header">
        <h1 class="page-header__title">${icon('layers')}Sammlungen</h1>
        <p class="page-header__subtitle">Geloggt oder als gesehen markiert</p>
      </div>
      <div class="sammlung">
        ${eigeneSammlungen().map(stand => zeile(stand, stand.sammlung.id === sprungZu, position)).join('')}
      </div>`;

    const offen = sprungZu && page.querySelector(`#sammlung-${CSS.escape(sprungZu)}`);
    // Nur so weit wie nötig: steht sie schon im Bild, bleibt die Seite stehen.
    if (offen) requestAnimationFrame(() => offen.scrollIntoView({ block: 'nearest' }));
    return page;
}
