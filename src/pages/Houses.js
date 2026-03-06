// Opera Houses Browse Page
import { operaHouses } from '../data/operaHouses.js';
import { store } from '../store/store.js';

export function HousesPage() {
  const page = document.createElement('div');
  page.className = 'page page--houses';

  // Restore persisted filter state
  const savedState = sessionStorage.getItem('houses_activeState') || '';
  const savedSort = sessionStorage.getItem('houses_sort') || 'name';
  const savedSearch = sessionStorage.getItem('houses_search') || '';

  page.innerHTML = `
    <div class="page-header">
      <h1 class="page-header__title">🏛️ Opernhäuser</h1>
      <p class="page-header__subtitle">${operaHouses.length} Häuser entdecken</p>
      <div style="margin-top: 1rem;">
          <button class="btn btn--ghost btn--sm" id="suggestHouseBtn">Fehlendes Haus vorschlagen</button>
      </div>
    </div>
    <div class="filters">
      <div class="search-box">
        <svg class="search-box__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input type="text" class="search-box__input" placeholder="Opernhaus oder Stadt suchen..." id="houseSearch" value="${savedSearch}" />
      </div>
      <div class="filter-chips" id="stateFilter"></div>
      <div class="sort-controls">
        <select class="select" id="houseSort">
          <option value="name"${savedSort === 'name' ? ' selected' : ''}>Name A–Z</option>
          <option value="city"${savedSort === 'city' ? ' selected' : ''}>Stadt A–Z</option>
          <option value="capacity-desc"${savedSort === 'capacity-desc' ? ' selected' : ''}>Kapazität ↓</option>
          <option value="founded"${savedSort === 'founded' ? ' selected' : ''}>Gründungsjahr</option>
          <option value="rating"${savedSort === 'rating' ? ' selected' : ''}>Beste Bewertung</option>
        </select>
      </div>
    </div>
    <div class="card-grid card-grid--houses" id="housesGrid"></div>
  `;

  // State filter chips
  const states = [...new Set(operaHouses.map(h => h.state))].sort();
  const stateFilter = page.querySelector('#stateFilter');
  let activeState = savedState || null;

  function saveFilterState() {
    sessionStorage.setItem('houses_activeState', activeState || '');
    sessionStorage.setItem('houses_sort', page.querySelector('#houseSort').value);
    sessionStorage.setItem('houses_search', page.querySelector('#houseSearch').value);
  }

  const allChip = document.createElement('button');
  allChip.className = `chip${!activeState ? ' chip--active' : ''}`;
  allChip.textContent = 'Alle';
  allChip.addEventListener('click', () => {
    activeState = null;
    saveFilterState();
    renderHouses();
    page.querySelectorAll('.chip').forEach(c => c.classList.remove('chip--active'));
    allChip.classList.add('chip--active');
  });
  stateFilter.appendChild(allChip);

  states.forEach(state => {
    const chip = document.createElement('button');
    chip.className = `chip${activeState === state ? ' chip--active' : ''}`;
    chip.textContent = state;
    chip.addEventListener('click', () => {
      activeState = state;
      saveFilterState();
      renderHouses();
      page.querySelectorAll('.chip').forEach(c => c.classList.remove('chip--active'));
      chip.classList.add('chip--active');
    });
    stateFilter.appendChild(chip);
  });

  function renderHouses() {
    const grid = page.querySelector('#housesGrid');
    const search = page.querySelector('#houseSearch').value.toLowerCase();
    const sort = page.querySelector('#houseSort').value;

    let filtered = operaHouses.filter(h => {
      const matchesSearch = !search || h.name.toLowerCase().includes(search) || h.city.toLowerCase().includes(search);
      const matchesState = !activeState || h.state === activeState;
      return matchesSearch && matchesState;
    });

    // Sort
    filtered.sort((a, b) => {
      switch (sort) {
        case 'name': return a.name.localeCompare(b.name);
        case 'city': return a.city.localeCompare(b.city);
        case 'capacity-desc': return b.capacity - a.capacity;
        case 'founded': return a.founded - b.founded;
        case 'rating': {
          const rA = store.getAverageRatingForHouse(a.id) || 0;
          const rB = store.getAverageRatingForHouse(b.id) || 0;
          return rB - rA;
        }
        default: return 0;
      }
    });

    grid.innerHTML = '';
    filtered.forEach((house, i) => {
      const avgRating = store.getAverageRatingForHouse(house.id);
      const visitCount = store.getVisitsByHouse(house.id).length;

      const bannerBackground = house.imageUrl
        ? `linear-gradient(to bottom, rgba(20, 24, 28, 0.4), #14181c), url('${house.imageUrl}')`
        : `linear-gradient(135deg, ${house.color}, #14181c)`;

      const card = document.createElement('div');
      card.className = 'house-card fade-in';
      card.style.animationDelay = `${i * 0.05}s`;
      card.innerHTML = `
        <div class="house-card__banner" style="background: ${bannerBackground}; background-size: cover; background-position: center;">
          <div class="house-card__city-badge">${house.city}</div>
        </div>
        <div class="house-card__content">
          <h3 class="house-card__name">${house.name}</h3>
          <div class="house-card__meta">
            <span>📍 ${house.city}</span>
            <span>🎭 ${house.capacity} Plätze</span>
            <span>📅 Seit ${house.founded}</span>
          </div>
          <div class="house-card__footer">
            ${avgRating ? `<span class="house-card__rating">★ ${avgRating.toFixed(1)}</span>` : '<span class="house-card__rating house-card__rating--none">Noch keine Bewertung</span>'}
            <span class="house-card__visits">${visitCount} ${visitCount === 1 ? 'Besuch' : 'Besuche'}</span>
          </div>
        </div>
      `;
      card.addEventListener('click', () => window.location.hash = `#/house/${house.id}`);
      grid.appendChild(card);
    });

    if (filtered.length === 0) {
      grid.innerHTML = '<div class="empty-state">Keine Opernhäuser gefunden.</div>';
    }
  }

  // Event listeners
  page.querySelector('#houseSearch').addEventListener('input', () => { saveFilterState(); renderHouses(); });
  page.querySelector('#houseSort').addEventListener('change', () => { saveFilterState(); renderHouses(); });

  page.querySelector('#suggestHouseBtn').addEventListener('click', () => {
    if (!store.isCloud) {
      alert('Bitte logge dich ein, um einen Vorschlag zu machen.');
      return;
    }

    const modal = document.createElement('div');
    modal.className = 'modal modal--active';

    if (store.hasPendingSuggestion('house')) {
      modal.innerHTML = `
          <div class="modal__overlay"></div>
          <div class="modal__content">
            <h2 class="modal__title">Vorschlag in Prüfung</h2>
            <p>Vielen Dank! Du hast bereits einen Vorschlag für ein fehlendes Haus eingereicht. Sobald die Administratoren deinen Vorschlag bearbeitet haben, hast du wieder einen frei.</p>
            <div class="modal__actions" style="margin-top: 1.5rem;">
              <button class="btn btn--primary close-modal">Verstanden</button>
            </div>
          </div>
        `;
    } else {
      modal.innerHTML = `
          <div class="modal__overlay"></div>
          <div class="modal__content">
            <h2 class="modal__title">Fehlendes Haus vorschlagen</h2>
            <p style="margin-bottom: 1.5rem; color: var(--text-muted); font-size: 0.9rem;">Du kannst jeweils einen Vorschlag einreichen. Ein Administrator wird den Vorschlag prüfen und das Haus ggf. hinzufügen.</p>
            <form id="suggestHouseForm">
              <div class="form-group">
                <label class="form-label">Name des Hauses</label>
                <input class="input" type="text" id="suggName" required />
              </div>
              <div class="form-group">
                <label class="form-label">Stadt / Standort</label>
                <input class="input" type="text" id="suggLocation" required />
              </div>
              <div class="modal__actions" style="margin-top: 1.5rem;">
                <button type="button" class="btn btn--secondary close-modal">Abbrechen</button>
                <button type="submit" class="btn btn--primary" id="submitSuggBtn">Vorschlag senden</button>
              </div>
            </form>
          </div>
        `;

      setTimeout(() => {
        const form = modal.querySelector('#suggestHouseForm');
        if (form) {
          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = modal.querySelector('#submitSuggBtn');
            btn.disabled = true;
            btn.textContent = 'Wird gespeichert...';

            const name = form.querySelector('#suggName').value.trim();
            const location = form.querySelector('#suggLocation').value.trim();

            try {
              await store.submitSuggestion('house', { name, location });

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

  // Initial render
  setTimeout(renderHouses, 0);

  return page;
}
