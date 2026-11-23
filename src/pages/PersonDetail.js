// Personenseite: alle eigenen Abende mit einer Sängerin, einem Dirigenten,
// einer Regisseurin – und was sie dort waren.
//
// Nur die eigenen Abende (Jonas, 27.09.2026): das Tagebuch, nicht die
// Community. Die Person kommt aus der Adresse ("#/person/Anna%20Netrebko");
// wiedererkannt wird sie ohne Unterschied in Groß- und Kleinschreibung,
// siehe src/data/besetzung.js.
//
// Aufbau seit 23.11.2026 (Jonas, nach Vorschau): oben eine Karte mit rundem
// Bild (Wikipedia, sonst Initialen), Name, Kurzbeschreibung und Plaketten;
// darunter die Abende als Karten mit Plakat, Datum, Werk, Haus, Sternen und
// der Funktion.

import { operas } from '../data/operas.js';
import { operaHouses } from '../data/operaHouses.js';
import { personen, personSchluessel } from '../data/besetzung.js';
import { store } from '../store/store.js';
import { icon } from '../components/Icon.js';
import { escapeHTML, datumKurz, einblendVerzoegerung } from '../utils.js';
import { zurueckLink } from '../components/ZurueckLink.js';
import { personBildImKopf } from '../components/PersonBild.js';

/** "als Rigoletto und Macbeth", "am Pult", "Regie" – was jemand an einem Abend war. */
export function alsText(als) {
    const rollen = als.filter(a => a && a !== 'Dirigat' && a !== 'Regie');
    const teile = [];
    if (rollen.length) teile.push(rollen.join(', '));
    if (als.includes('Dirigat')) teile.push('am Pult');
    if (als.includes('Regie')) teile.push('Regie');
    return teile.join(' · ');
}

/** "BS" aus "Bartlett Sher", "AN" aus "Anna Netrebko" – für den Kreis ohne Bild. */
export function initialen(name) {
    const teile = String(name || '').replace(/[()]/g, ' ').split(/\s+/).filter(w => /\p{L}/u.test(w));
    if (!teile.length) return '?';
    const erste = teile[0].match(/\p{L}/u)[0];
    const letzte = teile.length > 1 ? teile[teile.length - 1].match(/\p{L}/u)[0] : '';
    return (erste + letzte).toUpperCase();
}

/** "★★★★½" – volle Sterne und ein halber, ohne leere. */
export function sterneKurz(note) {
    const n = Math.min(5, Math.max(0, Math.round((Number(note) || 0) * 2) / 2));
    return '★'.repeat(Math.floor(n)) + (n % 1 ? '½' : '');
}

/** Das Plakat eines Werks in der kleinen 250er-Fassung, sonst wie es ist. */
const plakat = (bild) => String(bild || '').replace(/\/500px-([^/]+)$/, '/250px-$1');

export function PersonDetailPage(param) {
    let name = '';
    try { name = decodeURIComponent(param || ''); } catch { name = param || ''; }

    const person = personen(store.getVisitsByUser('user-me')).get(personSchluessel(name));
    const anzeigeName = person?.name || name.replace(/\s+/g, ' ').trim();
    const abende = (person?.abende || [])
        .slice()
        .sort((a, b) => String(b.visit.date).localeCompare(String(a.visit.date)));

    const page = document.createElement('div');
    page.className = 'page page--person-detail';

    // Wie oft in welcher Funktion – für die Plaketten unter dem Namen.
    const zaehle = was => abende.filter(a => was(a.als)).length;
    const buehne = zaehle(als => als.some(x => x !== 'Dirigat' && x !== 'Regie') || !als.length);
    const pult = zaehle(als => als.includes('Dirigat'));
    const regie = zaehle(als => als.includes('Regie'));
    const mal = n => `${n} ${n === 1 ? 'Abend' : 'Abende'}`;
    const jahre = abende.map(a => String(a.visit.date).slice(0, 4)).filter(j => /^\d{4}$/.test(j)).sort();
    const zeitraum = jahre.length ? (jahre[0] === jahre.at(-1) ? jahre[0] : `zuerst ${jahre[0]} · zuletzt ${jahre.at(-1)}`) : '';
    const haeuser = new Set(abende.map(a => a.visit.houseId).filter(Boolean)).size;
    const plakette = (inhalt) => `<span class="person-hero__plakette">${inhalt}</span>`;

    page.innerHTML = `
      ${zurueckLink('#/')}
      <section class="person-hero">
        <div class="person-hero__bild"><span class="person-hero__initialen" aria-hidden="true">${escapeHTML(initialen(anzeigeName))}</span></div>
        <div class="person-hero__text">
          <h1 class="person-hero__name">${escapeHTML(anzeigeName)}</h1>
          <p class="person-hero__beschreibung" hidden></p>
          <div class="person-hero__zahlen">
            ${abende.length ? plakette(`<b>${abende.length}</b> ${abende.length === 1 ? 'Abend' : 'Abende'} mit dir`) : ''}
            ${buehne && (pult || regie) ? plakette(`${mal(buehne)} auf der Bühne`) : ''}
            ${pult ? plakette(`${mal(pult)} am Pult`) : ''}
            ${regie ? plakette(`${mal(regie)} Regie`) : ''}
            ${zeitraum && abende.length > 1 ? plakette(escapeHTML(zeitraum)) : ''}
          </div>
        </div>
        <p class="person-hero__quelle" hidden></p>
      </section>

      <div class="detail-body">
        ${abende.length ? `
        <h2 class="person-abende__titel">Deine Abende</h2>
        <p class="person-abende__unter">${mal(abende.length)} an ${haeuser} ${haeuser === 1 ? 'Haus' : 'Häusern'}</p>
        <ul class="person-abende">
          ${abende.map((a, i) => {
              const v = a.visit;
              const werk = operas.find(o => o.id === v.operaId);
              const haus = operaHouses.find(h => h.id === v.houseId);
              const als = alsText(a.als);
              const [tag, ...rest] = datumKurz(v.date).split(' ');
              const bild = plakat(werk?.image);
              const sterne = sterneKurz(v.rating);
              return `
          <li class="person-abende__eintrag fade-in" style="animation-delay:${einblendVerzoegerung(i)}">
            <a class="person-abende__zeile" href="#/visit/${encodeURIComponent(v.id)}">
              ${bild ? `<img class="person-abende__plakat" src="${escapeHTML(bild)}" alt="" loading="lazy" decoding="async">` : '<span class="person-abende__plakat person-abende__plakat--leer" aria-hidden="true"></span>'}
              <span class="person-abende__datum"><b>${escapeHTML(String(tag || '').replace(/\.$/, ''))}</b><span>${escapeHTML(rest.join(' '))}</span></span>
              <span class="person-abende__text">
                <span class="person-abende__werk">${escapeHTML(werk?.title || 'Unbekanntes Werk')}</span>
                <span class="person-abende__haus">${escapeHTML([haus?.name, haus?.city].filter(Boolean).join(' · '))}</span>
                ${sterne ? `<span class="person-abende__sterne" aria-label="${escapeHTML(String(v.rating))} von 5 Sternen">${sterne}</span>` : ''}
              </span>
              ${als ? `<span class="person-abende__als">${escapeHTML(als)}</span>` : ''}
            </a>
          </li>`;
          }).join('')}
        </ul>` : `
        <p class="person-abende__leer">Noch kein Abend mit ${escapeHTML(anzeigeName)} in deinem Tagebuch.</p>`}
      </div>
    `;
    // Bild und Kurzbeschreibung von Wikipedia in den Kopf, wenn es ein Bild
    // gibt und der Artikel zu dem passt, was sie an diesen Abenden war. Ohne
    // eigene Abende – etwa über die Review eines Freundes hierher gekommen –
    // genügt irgendein Opernberuf: Regie, Dirigat oder Gesang (Jonas,
    // 23.11.2026). Der gleichnamige Fußballer bleibt so trotzdem draußen.
    const als = abende.length ? abende.flatMap(a => a.als.length ? a.als : ['']) : ['Regie', 'Dirigat', ''];
    personBildImKopf(page.querySelector('.person-hero'), anzeigeName, als);
    return page;
}
