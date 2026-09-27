// Personenseite: alle eigenen Abende mit einer Sängerin, einem Dirigenten,
// einer Regisseurin – und was sie dort waren.
//
// Nur die eigenen Abende (Jonas, 27.09.2026): das Tagebuch, nicht die
// Community. Die Person kommt aus der Adresse ("#/person/Anna%20Netrebko");
// wiedererkannt wird sie ohne Unterschied in Groß- und Kleinschreibung,
// siehe src/data/besetzung.js. Aufgebaut wie die Komponistenseite.

import { operas } from '../data/operas.js';
import { operaHouses } from '../data/operaHouses.js';
import { personen, personSchluessel } from '../data/besetzung.js';
import { store } from '../store/store.js';
import { icon } from '../components/Icon.js';
import { escapeHTML, datumKurz, einblendVerzoegerung } from '../utils.js';

/** "als Rigoletto und Macbeth", "am Pult", "Regie" – was jemand an einem Abend war. */
export function alsText(als) {
    const rollen = als.filter(a => a && a !== 'Dirigat' && a !== 'Regie');
    const teile = [];
    if (rollen.length) teile.push(rollen.join(', '));
    if (als.includes('Dirigat')) teile.push('am Pult');
    if (als.includes('Regie')) teile.push('Regie');
    return teile.join(' · ');
}

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

    // Wie oft in welcher Funktion – für die Zeile unter dem Namen.
    const zaehle = was => abende.filter(a => was(a.als)).length;
    const buehne = zaehle(als => als.some(x => x !== 'Dirigat' && x !== 'Regie') || !als.length);
    const pult = zaehle(als => als.includes('Dirigat'));
    const regie = zaehle(als => als.includes('Regie'));
    const mal = n => `${n} ${n === 1 ? 'Abend' : 'Abende'}`;

    page.innerHTML = `
      <div class="composer-hero">
        <a href="javascript:void(0)" class="back-link" onclick="history.back()">← Zurück</a>
        <h1 class="composer-hero__name">${escapeHTML(anzeigeName)}</h1>
        <div class="composer-hero__zahlen">
          ${abende.length ? `<span>${icon('calendar', { className: 'icon--meta' })}${mal(abende.length)} von dir</span>` : ''}
          ${buehne && (pult || regie) ? `<span>${icon('users', { className: 'icon--meta' })}${mal(buehne)} auf der Bühne</span>` : ''}
          ${pult ? `<span>${icon('music', { className: 'icon--meta' })}${mal(pult)} am Pult</span>` : ''}
          ${regie ? `<span>${icon('bookOpen', { className: 'icon--meta' })}${mal(regie)} Regie</span>` : ''}
        </div>
      </div>

      <div class="detail-body">
        ${abende.length ? `
        <ul class="person-abende">
          ${abende.map((a, i) => {
              const v = a.visit;
              const werk = operas.find(o => o.id === v.operaId);
              const haus = operaHouses.find(h => h.id === v.houseId);
              const als = alsText(a.als);
              return `
          <li class="person-abende__eintrag fade-in" style="animation-delay:${einblendVerzoegerung(i)}">
            <a class="person-abende__zeile" href="#/visit/${encodeURIComponent(v.id)}">
              <span class="person-abende__datum">${escapeHTML(datumKurz(v.date))}</span>
              <span class="person-abende__text">
                <span class="person-abende__werk">${escapeHTML(werk?.title || 'Unbekanntes Werk')}</span>
                <span class="person-abende__haus">${escapeHTML(haus?.name || '')}</span>
              </span>
              <span class="person-abende__als">${escapeHTML(als)}</span>
            </a>
          </li>`;
          }).join('')}
        </ul>` : `
        <div class="empty-state"><p>Noch kein Abend mit ${escapeHTML(anzeigeName)} in deinem Tagebuch.</p></div>`}
      </div>
    `;
    return page;
}
