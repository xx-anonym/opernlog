// Diary Page
import { store } from '../store/store.js';
import { icon } from '../components/Icon.js';
import { runWithFeedback } from '../components/Toast.js';
import { operaHouses } from '../data/operaHouses.js';
import { operas } from '../data/operas.js';
import { StarRating } from '../components/StarRating.js';
import { visitCredits } from '../utils.js';
import { seasonLabel } from '../data/season.js';
import { gruppiereBesuche, nachNote } from '../data/tagebuch.js';

export function DiaryPage() {
  const page = document.createElement('div');
  page.className = 'page page--diary';

  const myVisits = store.getVisitsByUser('user-me');

  page.innerHTML = `
    <div class="page-header">
      <h1 class="page-header__title">${icon('book')}Mein Tagebuch</h1>
      <p class="page-header__subtitle" id="diarySubtitle">Lade Besuche...</p>
    </div>
    
    <div id="diaryFilters" style="display:none">
    <div class="filters">
      <div class="filter-row">
        <input type="text" class="input search-input" id="diarySearch" placeholder="Oper, Komponist, Haus, Mitwirkende …" />
        <select class="select" id="diaryYear">
          <option value="">Alle Jahre</option>
        </select>
        <select class="select" id="diarySort">
          <option value="date-desc">Neueste zuerst</option>
          <option value="date-asc">Älteste zuerst</option>
          <option value="rating-desc">Beste Bewertung zuerst</option>
          <option value="rating-asc">Schlechteste zuerst</option>
        </select>
      </div>
    </div>
    </div>
    
    <div id="diaryContent"></div>
  `;

  // Removed top-level empty check; Handled inside renderDiary

  // Year filter
  const years = [...new Set(myVisits.map(v => new Date(v.date).getFullYear()))].sort((a, b) => b - a);
  const yearSelect = page.querySelector('#diaryYear');
  years.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    yearSelect.appendChild(opt);
  });

  function renderDiary() {
    const myVisits = store.getVisitsByUser('user-me');

    const subtitle = page.querySelector('#diarySubtitle');
    if (subtitle) {
      subtitle.textContent = `${myVisits.length} ${myVisits.length === 1 ? 'Besuch' : 'Besuche'} geloggt`;
    }

    if (myVisits.length === 0) {
      page.querySelector('#diaryFilters').style.display = 'none';
      page.querySelector('#diaryContent').innerHTML = `
                <div class="empty-state">
                    <div class="empty-state__icon">${icon('book')}</div>
                    <h3>Dein Tagebuch ist noch leer</h3>
                    <p>Logge deinen ersten Opernbesuch, um dein Tagebuch zu starten!</p>
                    <a href="#/log" class="btn btn--primary btn--lg">+ Ersten Besuch loggen</a>
                </div>
            `;
      return;
    }

    page.querySelector('#diaryFilters').style.display = 'block';

    const content = page.querySelector('#diaryContent');
    const yearFilter = page.querySelector('#diaryYear').value;
    const sort = page.querySelector('#diarySort').value;
    const searchFilter = page.querySelector('#diarySearch').value.toLowerCase().trim();

    let filtered = [...myVisits];

    if (searchFilter) {
      filtered = filtered.filter(v => {
        const house = operaHouses.find(h => h.id === v.houseId);
        const opera = operas.find(o => o.id === v.operaId);
        const credits = visitCredits(v);

        // Alles Durchsuchbare an einer Stelle. Vorher stand für jedes Feld
        // eine eigene Variable in der Rückgabezeile – mit den Mitwirkenden
        // wären daraus sieben geworden.
        //
        // Die Besetzung ist mehrzeilig; includes läuft über den ganzen Text,
        // also findet eine Suche nach einem Namen auch die Zeile mittendrin.
        const durchsuchbar = [
          opera?.title, opera?.composer,
          house?.name, house?.city,
          credits.conductor, credits.director, credits.castList,
        ];

        return durchsuchbar.some(feld => feld && feld.toLowerCase().includes(searchFilter));
      });
    }

    if (yearFilter) {
      filtered = filtered.filter(v => new Date(v.date).getFullYear() === parseInt(yearFilter));
    }

    content.innerHTML = '';

    // Sortieren und Gruppieren gehören zusammen: nach Bewertung sortiert
    // stehen über den Blöcken die Noten, nicht die Monate. Warum, steht in
    // src/data/tagebuch.js.
    const gruppen = gruppiereBesuche(filtered, sort);

    const monatsNamen = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
      'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

    // Die Spielzeit läuft von August bis Juli, nicht von Januar bis Dezember.
    // Zwischen Juli und August liegt also der Einschnitt, den ein Opernjahr
    // kennt – die Monatsüberschriften allein zeigen ihn nicht.
    //
    // Nur bei chronologischer Sortierung. Nach Bewertung geordnet gibt es gar
    // keine Monatsblöcke mehr, zwischen die eine Linie passte.
    const chronologisch = !nachNote(sort);
    let vorigeSpielzeit = null;

    gruppen.forEach(gruppe => {
      if (chronologisch && vorigeSpielzeit !== null && gruppe.spielzeit !== vorigeSpielzeit) {
        const trenner = document.createElement('div');
        trenner.className = 'saison-trenner';
        // Beschriftet wird die Spielzeit, die unterhalb der Linie beginnt –
        // egal ob von neu nach alt sortiert wird oder umgekehrt.
        trenner.innerHTML = `<span class="saison-trenner__text">Spielzeit ${seasonLabel(gruppe.spielzeit)}</span>`;
        content.appendChild(trenner);
      }
      vorigeSpielzeit = gruppe.spielzeit;

      // Ein Block heißt nach dem, was über ihm steht: bei chronologischer
      // Sortierung ein Monat, sonst eine Note.
      const block = document.createElement('div');
      block.className = `${chronologisch ? 'diary-month' : 'diary-bewertung'} fade-in`;
      const titelKlasse = chronologisch ? 'diary-month__title' : 'diary-bewertung__title';
      block.innerHTML = `<h3 class="${titelKlasse}">${gruppe.titel}</h3>`;

      const list = document.createElement('div');
      list.className = 'diary-list';

      gruppe.besuche.forEach(visit => {
        const house = operaHouses.find(h => h.id === visit.houseId);
        const opera = operas.find(o => o.id === visit.operaId);
        const date = new Date(visit.date);

        const entry = document.createElement('div');
        entry.className = 'diary-entry';
        entry.innerHTML = `
          <div class="diary-entry__date${chronologisch ? '' : ' diary-entry__date--lang'}">
            <span class="diary-entry__day">${date.getDate()}</span>
            <span class="diary-entry__weekday">${chronologisch
              ? ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][date.getDay()]
              : `${monatsNamen[date.getMonth()]} ${date.getFullYear()}`}</span>
          </div>
          <div class="diary-entry__color" style="background: linear-gradient(135deg, ${house ? house.color : '#8b1a2b'}, #14181c)"></div>
          <div class="diary-entry__info">
            <div class="diary-entry__title">${opera ? opera.title : 'Unbekannt'}</div>
            <div class="diary-entry__house">${house ? `${house.name}, ${house.city}` : 'Unbekannt'}</div>
          </div>
          <div class="diary-entry__rating" id="rating-${visit.id}"></div>
          ${visit.review ? `<div class="diary-entry__review-icon" title="Review geschrieben">${icon('note')}</div>` : ''}
          <div class="diary-entry__actions">
            <button class="btn-icon diary-entry__edit" data-visit-id="${visit.id}" title="Eintrag bearbeiten">${icon('pencil')}</button>
            <button class="btn-icon diary-entry__delete" data-visit-id="${visit.id}" title="Eintrag löschen">${icon('trash')}</button>
          </div>
        `;

        const ratingEl = entry.querySelector(`#rating-${visit.id}`);
        ratingEl.appendChild(StarRating(visit.rating, false, null, 'sm'));

        // Click to navigate based on review existence
        entry.querySelector('.diary-entry__info').addEventListener('click', () => {
          if (visit.review) {
              window.location.hash = `#/visit/${visit.id}`;
          } else if (opera) {
              window.location.hash = `#/opera/${opera.id}`;
          }
        });
        entry.querySelector('.diary-entry__info').style.cursor = 'pointer';

        const reviewIcon = entry.querySelector('.diary-entry__review-icon');
        if (reviewIcon) {
            reviewIcon.addEventListener('click', () => {
                window.location.hash = `#/visit/${visit.id}`;
            });
        }

        // Edit
        entry.querySelector('.diary-entry__edit').addEventListener('click', (e) => {
          e.stopPropagation();
          window.location.hash = `#/log?edit=${visit.id}`;
        });

        // Delete
        entry.querySelector('.diary-entry__delete').addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm('Möchtest du diesen Eintrag wirklich löschen?')) return;
          const ok = await runWithFeedback(() => store.deleteVisit(visit.id), {
            failure: 'Eintrag konnte nicht gelöscht werden',
          });
          if (ok) renderDiary();
        });

        list.appendChild(entry);
      });

      block.appendChild(list);
      content.appendChild(block);
    });

    if (filtered.length === 0) {
      content.innerHTML = '<div class="empty-state">Keine Einträge für diesen Zeitraum.</div>';
    }
  }

  if (yearSelect) yearSelect.addEventListener('change', renderDiary);
  const sortSelect = page.querySelector('#diarySort');
  if (sortSelect) sortSelect.addEventListener('change', renderDiary);
  const searchInput = page.querySelector('#diarySearch');
  if (searchInput) searchInput.addEventListener('input', renderDiary);

  setTimeout(renderDiary, 0);

  return page;
}
