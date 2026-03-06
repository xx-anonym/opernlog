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
      <div style="margin-top: 1rem;">
          <button class="btn btn--outline btn--sm" id="suggestOperaBtn">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;margin-right:4px;vertical-align:text-bottom;">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Fehlendes Werk vorschlagen
          </button>
      </div>
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

  page.querySelector('#suggestOperaBtn').addEventListener('click', () => {
    if (!store.isCloud) {
      alert('Bitte logge dich ein, um einen Vorschlag zu machen.');
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal modal--active';

    if (store.hasPendingSuggestion('opera')) {
      modal.innerHTML = `
          <div class="modal__overlay"></div>
          <div class="modal__content">
            <h2 class="modal__title">Vorschlag in Prüfung</h2>
            <p>Vielen Dank! Du hast bereits einen Vorschlag für ein fehlendes Werk eingereicht. Sobald die Administratoren deinen Vorschlag bearbeitet haben, hast du wieder einen frei.</p>
            <div class="modal__actions" style="margin-top: 1.5rem;">
              <button class="btn btn--primary close-modal">Verstanden</button>
            </div>
          </div>
        `;
    } else {
      modal.innerHTML = `
          <div class="modal__overlay"></div>
          <div class="modal__content">
            <h2 class="modal__title">Fehlendes Werk vorschlagen</h2>
            <p style="margin-bottom: 1.5rem; color: var(--text-muted); font-size: 0.9rem;">Du kannst jeweils einen Vorschlag einreichen. Ein Administrator wird den Vorschlag prüfen und das Werk ggf. hinzufügen.</p>
            <form id="suggestOperaForm">
              <div class="form-group">
                <label class="form-label">Titel der Oper</label>
                <input class="input" type="text" id="suggName" required />
              </div>
              <div class="form-group">
                <label class="form-label">Komponist</label>
                <input class="input" type="text" id="suggComposer" required />
              </div>
              <div class="modal__actions" style="margin-top: 1.5rem;">
                <button type="button" class="btn btn--secondary close-modal">Abbrechen</button>
                <button type="submit" class="btn btn--primary" id="submitSuggBtn">Vorschlag senden</button>
              </div>
            </form>
          </div>
        `;

      setTimeout(() => {
        const form = modal.querySelector('#suggestOperaForm');
        if (form) {
          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = modal.querySelector('#submitSuggBtn');
            btn.disabled = true;
            btn.textContent = 'Wird gespeichert...';

            const name = form.querySelector('#suggName').value.trim();
            const composer = form.querySelector('#suggComposer').value.trim();

            try {
              await store.submitSuggestion('opera', { name, composer });

              modal.innerHTML = `
                          <div class="modal__overlay"></div>
                          <div class="modal__content">
                            <h2 class="modal__title">Vielen Dank!</h2>
                            <p>Dein Vorschlag wurde gespeichert und wird in Kürze geprüft.</p>
                            <div class="modal__actions" style="margin-top: 1.5rem;">
                              <button class="btn btn--primary close-modal">Schließen</button>
                            </div>
                          </div>
                        `;
              modal.querySelector('.close-modal').addEventListener('click', () => modal.remove());
              modal.querySelector('.modal__overlay').addEventListener('click', () => modal.remove());
            } catch (err) {
              alert('Fehler beim Senden: ' + err.message);
              btn.disabled = false;
              btn.textContent = 'Vorschlag senden';
            }
          });
        }
      }, 0);
    }

    // Fallback for direct close bindings
    setTimeout(() => {
      modal.querySelectorAll('.close-modal').forEach(btn => btn.addEventListener('click', () => modal.remove()));
      const overlay = modal.querySelector('.modal__overlay');
      if (overlay) overlay.addEventListener('click', () => modal.remove());
    }, 0);

    page.appendChild(modal);
  });

  setTimeout(renderOperas, 0);

  return page;
}
