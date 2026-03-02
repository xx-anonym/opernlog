// Log Visit Page
import { operaHouses } from '../data/operaHouses.js';
import { operas } from '../data/operas.js';
import { store } from '../store/store.js';
import { StarRating } from '../components/StarRating.js';

export function LogVisitPage(params = {}) {
  const page = document.createElement('div');
  page.className = 'page page--log';

  let selectedRating = 0;
  let editVisit = null;
  if (params.edit) {
    editVisit = store.getVisitsByUser('user-me').find(v => v.id === params.edit);
    if (editVisit) selectedRating = editVisit.rating;
  }

  page.innerHTML = `
    <div class="page-header">
      <h1 class="page-header__title">${editVisit ? '✏️ Besuch bearbeiten' : '✨ Besuch loggen'}</h1>
      <p class="page-header__subtitle">${editVisit ? 'Korrigiere deine Eintragung' : 'Halte deinen Opernbesuch fest'}</p>
    </div>
    
    <form class="log-form" id="logForm">
      <div class="form-group">
        <label class="form-label">🏛️ Opernhaus</label>
        <div class="autocomplete" id="houseAutocomplete">
          <input type="text" class="input" id="houseInput" placeholder="Opernhaus suchen..." autocomplete="off" />
          <div class="autocomplete__list" id="houseList"></div>
        </div>
        <input type="hidden" id="houseId" />
      </div>
      
      <div class="form-group">
        <label class="form-label">🎵 Opernwerk</label>
        <div class="autocomplete" id="operaAutocomplete">
          <input type="text" class="input" id="operaInput" placeholder="Oper suchen..." autocomplete="off" />
          <div class="autocomplete__list" id="operaList"></div>
        </div>
        <input type="hidden" id="operaId" />
      </div>
      
      <div class="form-group">
        <label class="form-label">📅 Datum</label>
        <input type="date" class="input" id="visitDate" value="${editVisit ? editVisit.date : new Date().toISOString().split('T')[0]}" />
      </div>
      
      <div class="form-group">
        <label class="form-label">⭐ Bewertung</label>
        <div id="ratingWidget"></div>
      </div>
      
      <div class="form-group">
        <label class="form-label">📝 Review (optional)</label>
        <textarea class="input textarea" id="reviewText" rows="4" placeholder="Wie war die Vorstellung? Was hat dir gefallen? Was nicht?">${editVisit && editVisit.review ? editVisit.review : ''}</textarea>
      </div>
      
      <div class="form-actions">
        <button type="submit" class="btn btn--primary btn--lg">${editVisit ? 'Änderungen speichern' : 'Besuch speichern'}</button>
        <button type="button" class="btn btn--outline" id="cancelBtn">Abbrechen</button>
      </div>
    </form>
  `;

  // Rating widget
  const ratingWidget = page.querySelector('#ratingWidget');
  const starWidget = StarRating(editVisit ? editVisit.rating : 0, true, (rating) => { selectedRating = rating; }, 'lg');
  ratingWidget.appendChild(starWidget);

  // Autocomplete for houses
  const houseInput = page.querySelector('#houseInput');
  const houseList = page.querySelector('#houseList');
  const houseIdInput = page.querySelector('#houseId');

  // Pre-select if passed via URL
  if (params.house) {
    const preHouse = operaHouses.find(h => h.id === params.house);
    if (preHouse) {
      houseInput.value = `${preHouse.name} (${preHouse.city})`;
      houseIdInput.value = preHouse.id;
    }
  }
  if (params.opera) {
    const preOpera = operas.find(o => o.id === params.opera);
    if (preOpera) {
      page.querySelector('#operaInput').value = `${preOpera.title} – ${preOpera.composer}`;
      page.querySelector('#operaId').value = preOpera.id;
    }
  }

  // Pre-fill if editing
  if (editVisit) {
    const preHouse = operaHouses.find(h => h.id === editVisit.houseId);
    if (preHouse) {
      houseInput.value = `${preHouse.name} (${preHouse.city})`;
      houseIdInput.value = preHouse.id;
    }
    const preOpera = operas.find(o => o.id === editVisit.operaId);
    if (preOpera) {
      page.querySelector('#operaInput').value = `${preOpera.title} – ${preOpera.composer}`;
      page.querySelector('#operaId').value = preOpera.id;
    }
  }

  houseInput.addEventListener('input', () => {
    const query = houseInput.value.toLowerCase();
    if (query.length < 1) { houseList.innerHTML = ''; houseList.style.display = 'none'; return; }

    const matches = operaHouses.filter(h =>
      h.name.toLowerCase().includes(query) || h.city.toLowerCase().includes(query)
    ).slice(0, 8);

    houseList.innerHTML = '';
    houseList.style.display = matches.length ? 'block' : 'none';

    matches.forEach(house => {
      const item = document.createElement('div');
      item.className = 'autocomplete__item';
      item.innerHTML = `<strong>${house.name}</strong> <span class="text-muted">– ${house.city}</span>`;
      item.addEventListener('click', () => {
        houseInput.value = `${house.name} (${house.city})`;
        houseIdInput.value = house.id;
        houseList.style.display = 'none';
      });
      houseList.appendChild(item);
    });
  });

  // Autocomplete for operas
  const operaInput = page.querySelector('#operaInput');
  const operaList = page.querySelector('#operaList');
  const operaIdInput = page.querySelector('#operaId');

  operaInput.addEventListener('input', () => {
    const query = operaInput.value.toLowerCase();
    if (query.length < 1) { operaList.innerHTML = ''; operaList.style.display = 'none'; return; }

    const matches = operas.filter(o =>
      o.title.toLowerCase().includes(query) || o.composer.toLowerCase().includes(query)
    ).slice(0, 8);

    operaList.innerHTML = '';
    operaList.style.display = matches.length ? 'block' : 'none';

    matches.forEach(opera => {
      const item = document.createElement('div');
      item.className = 'autocomplete__item';
      item.innerHTML = `<strong>${opera.title}</strong> <span class="text-muted">– ${opera.composer}</span>`;
      item.addEventListener('click', () => {
        operaInput.value = `${opera.title} – ${opera.composer}`;
        operaIdInput.value = opera.id;
        operaList.style.display = 'none';
      });
      operaList.appendChild(item);
    });
  });

  // Close dropdowns when clicking elsewhere
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#houseAutocomplete')) houseList.style.display = 'none';
    if (!e.target.closest('#operaAutocomplete')) operaList.style.display = 'none';
  });

  // Form submit
  const form = page.querySelector('#logForm');
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const houseId = houseIdInput.value;
    const operaId = operaIdInput.value;
    const date = page.querySelector('#visitDate').value;
    const review = page.querySelector('#reviewText').value.trim();

    if (!houseId) { shakeElement(houseInput); return; }
    if (!operaId) { shakeElement(operaInput); return; }
    if (!selectedRating) { shakeElement(ratingWidget); return; }

    if (editVisit) {
      store.updateVisit(editVisit.id, { houseId, operaId, date, rating: selectedRating, review });
      showToast('✅ Besuch erfolgreich aktualisiert!');
    } else {
      store.addVisit({ houseId, operaId, date, rating: selectedRating, review });
      showToast('✅ Besuch erfolgreich geloggt!');
    }

    setTimeout(() => { window.location.hash = '#/diary'; }, 800);
  });

  // Cancel
  page.querySelector('#cancelBtn').addEventListener('click', () => {
    window.history.back();
  });

  return page;
}

function shakeElement(el) {
  el.classList.add('shake');
  setTimeout(() => el.classList.remove('shake'), 500);
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'toast fade-in';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => { toast.classList.add('toast--hide'); }, 2000);
  setTimeout(() => { toast.remove(); }, 2500);
}
