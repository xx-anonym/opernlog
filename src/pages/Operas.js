// Operas Browse Page
import { operas } from '../data/operas.js';
import { store } from '../store/store.js';

export function OperasPage() {
  const page = document.createElement('div');
  page.className = 'page page--operas';

  // Restore persisted filter state
  const savedComposer = sessionStorage.getItem('operas_activeComposer') || '';
  const savedSort = sessionStorage.getItem('operas_sort') || 'title';
  const savedSearch = sessionStorage.getItem('operas_search') || '';
  const savedLang = sessionStorage.getItem('operas_language') || '';

  page.innerHTML = `
    <div class="page-header">
      <h1 class="page-header__title">🎵 Opernwerke</h1>
      <p class="page-header__subtitle">${operas.length} Werke im Katalog</p>
    </div>
    <div class="filters">
      <div class="search-box">
        <svg class="search-box__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" class="search-box__input" placeholder="Oper, Komponist suchen..." id="operaSearch" value="${savedSearch}" />
      </div>
      <div class="filter-chips" id="composerFilter"></div>
      <div class="filter-row">
        <select class="select" id="languageFilter">
          <option value="">Alle Sprachen</option>
        </select>
        <select class="select" id="operaSort">
          <option value="title"${savedSort === 'title' ? ' selected' : ''}>Titel A–Z</option>
          <option value="composer"${savedSort === 'composer' ? ' selected' : ''}>Komponist A–Z</option>
          <option value="year"${savedSort === 'year' ? ' selected' : ''}>Kompositionsjahr</option>
          <option value="rating"${savedSort === 'rating' ? ' selected' : ''}>Beste Bewertung</option>
          <option value="popular"${savedSort === 'popular' ? ' selected' : ''}>Beliebteste</option>
        </select>
      </div>
    </div>
    <div class="card-grid card-grid--operas" id="operasGrid"></div>
  `;

  // Composer filter chips
  const composers = [...new Set(operas.map(o => o.composer))].sort();
  const topComposers = ['Wolfgang Amadeus Mozart', 'Giuseppe Verdi', 'Richard Wagner', 'Giacomo Puccini', 'Richard Strauss', 'Georg Friedrich Händel'];
  const composerFilter = page.querySelector('#composerFilter');
  let activeComposer = savedComposer || null;

  function saveFilterState() {
    sessionStorage.setItem('operas_activeComposer', activeComposer || '');
    sessionStorage.setItem('operas_sort', page.querySelector('#operaSort').value);
    sessionStorage.setItem('operas_search', page.querySelector('#operaSearch').value);
    sessionStorage.setItem('operas_language', page.querySelector('#languageFilter').value);
  }

  const allChip = document.createElement('button');
  allChip.className = `chip${!activeComposer ? ' chip--active' : ''}`;
  allChip.textContent = 'Alle';
  allChip.addEventListener('click', () => {
    activeComposer = null;
    saveFilterState();
    renderOperas();
    page.querySelectorAll('.chip').forEach(c => c.classList.remove('chip--active'));
    allChip.classList.add('chip--active');
  });
  composerFilter.appendChild(allChip);

  topComposers.forEach(composer => {
    const chip = document.createElement('button');
    chip.className = `chip${activeComposer === composer ? ' chip--active' : ''}`;
    chip.textContent = composer.split(' ').pop(); // Last name only
    chip.title = composer;
    chip.addEventListener('click', () => {
      activeComposer = composer;
      saveFilterState();
      renderOperas();
      page.querySelectorAll('.chip').forEach(c => c.classList.remove('chip--active'));
      chip.classList.add('chip--active');
    });
    composerFilter.appendChild(chip);
  });

  // Language filter
  const languages = [...new Set(operas.map(o => o.language))].sort();
  const langSelect = page.querySelector('#languageFilter');
  languages.forEach(lang => {
    const opt = document.createElement('option');
    opt.value = lang;
    opt.textContent = lang;
    if (lang === savedLang) opt.selected = true;
    langSelect.appendChild(opt);
  });

  const composerColors = {
    'Wolfgang Amadeus Mozart': '#c9a84c',
    'Giuseppe Verdi': '#2d7d46',
    'Richard Wagner': '#7d2d2d',
    'Giacomo Puccini': '#2d5a7d',
    'Richard Strauss': '#7d5a2d',
    'Georges Bizet': '#7d2d5a',
    'Georg Friedrich Händel': '#5a2d7d',
    'Gioachino Rossini': '#2d7d7d',
    'Gaetano Donizetti': '#7d7d2d',
    'Leoš Janáček': '#4a7d2d',
    'Benjamin Britten': '#2d4a7d',
    'Claudio Monteverdi': '#6d3a1a',
  };

  function renderOperas() {
    const grid = page.querySelector('#operasGrid');
    const search = page.querySelector('#operaSearch').value.toLowerCase();
    const sort = page.querySelector('#operaSort').value;
    const lang = page.querySelector('#languageFilter').value;

    let filtered = operas.filter(o => {
      const matchesSearch = !search || o.title.toLowerCase().includes(search) || o.composer.toLowerCase().includes(search);
      const matchesComposer = !activeComposer || o.composer === activeComposer;
      const matchesLang = !lang || o.language === lang;
      return matchesSearch && matchesComposer && matchesLang;
    });

    filtered.sort((a, b) => {
      switch (sort) {
        case 'title': return a.title.localeCompare(b.title);
        case 'composer': return a.composer.localeCompare(b.composer);
        case 'year': return a.yearComposed - b.yearComposed;
        case 'rating': {
          const rA = store.getAverageRatingForOpera(a.id) || 0;
          const rB = store.getAverageRatingForOpera(b.id) || 0;
          return rB - rA;
        }
        case 'popular': {
          const cA = store.getVisitsByOpera(a.id).length;
          const cB = store.getVisitsByOpera(b.id).length;
          return cB - cA;
        }
        default: return 0;
      }
    });

    grid.innerHTML = '';
    filtered.forEach((opera, i) => {
      const avgRating = store.getAverageRatingForOpera(opera.id);
      const visitCount = store.getVisitsByOpera(opera.id).length;
      const color = composerColors[opera.composer] || '#8b1a2b';

      const card = document.createElement('div');
      card.className = 'opera-card fade-in';
      card.style.animationDelay = `${i * 0.03}s`;
      card.innerHTML = `
        <div class="opera-card__color" style="${opera.image ? `background-image: linear-gradient(to bottom, rgba(0,0,0,0.15), rgba(20,24,28,0.85)), url('${opera.image}'); background-size: cover; background-position: center;` : `background: linear-gradient(135deg, ${color}, #14181c)`}">
          <span class="opera-card__year">${opera.yearComposed}</span>
        </div>
        <div class="opera-card__content">
          <h3 class="opera-card__title">${opera.title}</h3>
          <p class="opera-card__composer">${opera.composer}</p>
          <div class="opera-card__meta">
            <span class="opera-card__genre">${opera.genre}</span>
            <span class="opera-card__lang">${opera.language}</span>
          </div>
          <div class="opera-card__footer">
            ${avgRating ? `<span class="opera-card__rating">★ ${avgRating.toFixed(1)}</span>` : ''}
            ${visitCount > 0 ? `<span class="opera-card__visits">${visitCount}×</span>` : ''}
          </div>
        </div>
      `;
      card.addEventListener('click', () => window.location.hash = `#/opera/${opera.id}`);
      grid.appendChild(card);
    });

    if (filtered.length === 0) {
      grid.innerHTML = '<div class="empty-state">Keine Opern gefunden.</div>';
    }
  }

  page.querySelector('#operaSearch').addEventListener('input', () => { saveFilterState(); renderOperas(); });
  page.querySelector('#operaSort').addEventListener('change', () => { saveFilterState(); renderOperas(); });
  page.querySelector('#languageFilter').addEventListener('change', () => { saveFilterState(); renderOperas(); });

  setTimeout(renderOperas, 0);

  return page;
}
