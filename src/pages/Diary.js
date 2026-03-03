// Diary Page
import { store } from '../store/store.js';
import { operaHouses } from '../data/operaHouses.js';
import { operas } from '../data/operas.js';
import { StarRating } from '../components/StarRating.js';

export function DiaryPage() {
  const page = document.createElement('div');
  page.className = 'page page--diary';

  const myVisits = store.getVisitsByUser('user-me');

  page.innerHTML = `
    <div class="page-header">
      <h1 class="page-header__title">📔 Mein Tagebuch</h1>
      <p class="page-header__subtitle" id="diarySubtitle">Lade Besuche...</p>
    </div>
    
    <div id="diaryFilters" style="display:none">
    <div class="filters">
      <div class="filter-row">
        <input type="text" class="input search-input" id="diarySearch" placeholder="Oper, Komponist oder Haus suchen..." />
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
                    <div class="empty-state__icon">📔</div>
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

        const titleMatch = opera && opera.title.toLowerCase().includes(searchFilter);
        const composerMatch = opera && opera.composer.toLowerCase().includes(searchFilter);
        const houseMatch = house && house.name.toLowerCase().includes(searchFilter);
        const cityMatch = house && house.city.toLowerCase().includes(searchFilter);

        return titleMatch || composerMatch || houseMatch || cityMatch;
      });
    }

    if (yearFilter) {
      filtered = filtered.filter(v => new Date(v.date).getFullYear() === parseInt(yearFilter));
    }

    filtered.sort((a, b) => {
      switch (sort) {
        case 'date-desc': return new Date(b.date) - new Date(a.date);
        case 'date-asc': return new Date(a.date) - new Date(b.date);
        case 'rating-desc': return b.rating - a.rating;
        case 'rating-asc': return a.rating - b.rating;
        default: return 0;
      }
    });

    content.innerHTML = '';

    // Group by month
    const months = {};
    filtered.forEach(visit => {
      const date = new Date(visit.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!months[key]) months[key] = [];
      months[key].push(visit);
    });

    const monthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

    Object.entries(months).forEach(([key, visits]) => {
      const [year, month] = key.split('-');
      const monthSection = document.createElement('div');
      monthSection.className = 'diary-month fade-in';
      monthSection.innerHTML = `<h3 class="diary-month__title">${monthNames[parseInt(month) - 1]} ${year}</h3>`;

      const list = document.createElement('div');
      list.className = 'diary-list';

      visits.forEach(visit => {
        const house = operaHouses.find(h => h.id === visit.houseId);
        const opera = operas.find(o => o.id === visit.operaId);
        const date = new Date(visit.date);

        const entry = document.createElement('div');
        entry.className = 'diary-entry';
        entry.innerHTML = `
          <div class="diary-entry__date">
            <span class="diary-entry__day">${date.getDate()}</span>
            <span class="diary-entry__weekday">${['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][date.getDay()]}</span>
          </div>
          <div class="diary-entry__color" style="background: linear-gradient(135deg, ${house ? house.color : '#8b1a2b'}, #14181c)"></div>
          <div class="diary-entry__info">
            <div class="diary-entry__title">${opera ? opera.title : 'Unbekannt'}</div>
            <div class="diary-entry__house">${house ? `${house.name}, ${house.city}` : 'Unbekannt'}</div>
            ${visit.review ? `<p class="diary-entry__review">${visit.review.substring(0, 100)}${visit.review.length > 100 ? '...' : ''}</p>` : ''}
          </div>
          <div class="diary-entry__rating" id="rating-${visit.id}"></div>
          <div class="diary-entry__actions">
            <button class="btn-icon diary-entry__edit" data-visit-id="${visit.id}" title="Eintrag bearbeiten">✏️</button>
            <button class="btn-icon diary-entry__delete" data-visit-id="${visit.id}" title="Eintrag löschen">🗑️</button>
          </div>
        `;

        const ratingEl = entry.querySelector(`#rating-${visit.id}`);
        ratingEl.appendChild(StarRating(visit.rating, false, null, 'sm'));

        // Click to navigate
        entry.querySelector('.diary-entry__info').addEventListener('click', () => {
          if (opera) window.location.hash = `#/opera/${opera.id}`;
        });
        entry.querySelector('.diary-entry__info').style.cursor = 'pointer';

        // Edit
        entry.querySelector('.diary-entry__edit').addEventListener('click', (e) => {
          e.stopPropagation();
          window.location.hash = `#/log?edit=${visit.id}`;
        });

        // Delete
        entry.querySelector('.diary-entry__delete').addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm('Möchtest du diesen Eintrag wirklich löschen?')) {
            store.deleteVisit(visit.id);
            renderDiary();
          }
        });

        list.appendChild(entry);
      });

      monthSection.appendChild(list);
      content.appendChild(monthSection);
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
