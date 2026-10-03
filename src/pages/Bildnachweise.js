// Alle Bildnachweise auf einer Seite (#/bildnachweise), unauffällig
// verlinkt im Profil neben "Datenschutz". Werke, Häuser, Komponisten; je
// Zeile der Eintrag, darunter Urheber und Lizenz mit Link zur Datei auf
// Wikimedia Commons. Siehe src/components/Bildnachweis.js.

import { operas } from '../data/operas.js';
import { operaHouses } from '../data/operaHouses.js';
import { composers } from '../data/composers.js';
import { escapeHTML } from '../utils.js';
import { nachweisZeile } from '../data/bildnachweisRegeln.js';
import { nachweisFuer, commonsSeite } from '../components/Bildnachweis.js';
import { STORY_MUSIK } from '../data/musik.js';

const nachName = (a, b) => a.name.localeCompare(b.name, 'de');

function zeile(eintrag, n) {
    const datei = commonsSeite(eintrag.bild);
    const lizenz = n?.lizenz && n.lizenzUrl
        ? `<a href="${escapeHTML(n.lizenzUrl)}" target="_blank" rel="noopener noreferrer">${escapeHTML(n.lizenz)}</a>`
        : escapeHTML(n?.lizenz || '');
    const wer = n ? nachweisZeile({ ...n, lizenz: '' }).replace(/^Bild:\s*/, '') : '';
    return `
      <li class="nachweise__eintrag">
        <a class="nachweise__name" href="${eintrag.ziel}">${escapeHTML(eintrag.name)}</a>
        <span class="nachweise__wer">${n && wer !== 'Wikimedia Commons' ? `${escapeHTML(wer)}${lizenz ? ' · ' : ''}` : ''}${lizenz}${
            datei ? ` · <a href="${escapeHTML(datei)}" target="_blank" rel="noopener noreferrer">Commons</a>` : ''}</span>
      </li>`;
}

// Die Musik unter der Story des Saisonrückblicks (src/data/musik.js).
function musikAbschnitt() {
    const m = STORY_MUSIK;
    const extern = 'target="_blank" rel="noopener noreferrer"';
    return `
      <section class="nachweise">
        <h2 class="nachweise__titel">Musik</h2>
        <ul class="nachweise__liste">
          <li class="nachweise__eintrag">
            <span class="nachweise__name">${escapeHTML(m.komponist)}: ${escapeHTML(m.werk)}</span>
            <span class="nachweise__wer">${escapeHTML(m.aufnahme)} · <a href="${escapeHTML(m.lizenzUrl)}" ${extern}>${escapeHTML(m.lizenz)}</a> · ${escapeHTML(m.bearbeitung)} · <a href="${escapeHTML(m.quelle)}" ${extern}>Commons</a></span>
          </li>
        </ul>
      </section>`;
}

async function abschnitt(titel, eintraege) {
    const mitNachweis = await Promise.all(eintraege.map(async e => [e, e.fertig || await nachweisFuer(e.bild)]));
    return `
      <section class="nachweise">
        <h2 class="nachweise__titel">${titel}</h2>
        <ul class="nachweise__liste">${mitNachweis.map(([e, n]) => zeile(e, n)).join('')}</ul>
      </section>`;
}

export function BildnachweisePage() {
    const page = document.createElement('div');
    page.className = 'page page--nachweise';
    page.innerHTML = `
      <div class="page-header">
        <h1 class="page-header__title">Bildnachweise</h1>
        <p class="page-header__subtitle">Alle Bilder und die Musik stammen von Wikimedia Commons.</p>
      </div>
      <div class="nachweise__inhalt"></div>`;

    const werke = operas.filter(o => o.image).map(o => ({ name: o.title, bild: o.image, ziel: `#/opera/${encodeURIComponent(o.id)}` })).sort(nachName);
    const haeuser = operaHouses.filter(h => h.imageUrl).map(h => ({ name: h.name, bild: h.imageUrl, ziel: `#/house/${encodeURIComponent(h.id)}` })).sort(nachName);
    // Die Komponisten tragen ihre Angaben selbst (composers.js).
    const komponisten = composers.filter(k => k.bild).map(k => ({
        name: k.name, bild: k.bild, ziel: `#/composer/${encodeURIComponent(k.id)}`,
        fertig: { urheber: k.bildUrheber || 'unbekannt', lizenz: k.bildLizenz || '' },
    })).sort(nachName);

    Promise.all([abschnitt('Werke', werke), abschnitt('Häuser', haeuser), abschnitt('Komponisten', komponisten)])
        .then((teile) => { page.querySelector('.nachweise__inhalt').innerHTML = teile.join('') + musikAbschnitt(); });
    return page;
}
