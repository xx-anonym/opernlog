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
        <p class="page-header__subtitle">Alle Bilder stammen von Wikimedia Commons.</p>
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
        .then((teile) => { page.querySelector('.nachweise__inhalt').innerHTML = teile.join(''); });
    return page;
}
