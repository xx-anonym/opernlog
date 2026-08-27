// Log Visit Page
import { operaHouses, nearestOperaHouse } from '../data/operaHouses.js';
import { icon } from '../components/Icon.js';
import { operas } from '../data/operas.js';
import { store } from '../store/store.js';
import { escapeHTML, getCachedPosition, requestPosition } from '../utils.js';
import { showToast, runWithFeedback } from '../components/Toast.js';
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
      <h1 class="page-header__title">${editVisit ? icon('pencil') + 'Besuch bearbeiten' : icon('plus') + 'Besuch loggen'}</h1>
      <p class="page-header__subtitle">${editVisit ? 'Korrigiere deine Eintragung' : 'Halte deinen Opernbesuch fest'}</p>
    </div>
    
    <form class="log-form" id="logForm">
      <div class="form-group">
        <label class="form-label">${icon('building', { className: 'icon--meta' })}Opernhaus</label>
        <div class="autocomplete" id="houseAutocomplete">
          <input type="text" class="input" id="houseInput" placeholder="Opernhaus suchen..." autocomplete="off" />
          <div class="autocomplete__list" id="houseList"></div>
        </div>
        <input type="hidden" id="houseId" />
        <p class="form-hint" id="houseHint" hidden></p>
      </div>
      
      <div class="form-group">
        <label class="form-label">${icon('music', { className: 'icon--meta' })}Opernwerk</label>
        <div class="autocomplete" id="operaAutocomplete">
          <input type="text" class="input" id="operaInput" placeholder="Oper suchen..." autocomplete="off" />
          <div class="autocomplete__list" id="operaList"></div>
        </div>
        <input type="hidden" id="operaId" />
      </div>
      
      <div class="form-group">
        <label class="form-label">${icon('calendar', { className: 'icon--meta' })}Datum</label>
        <input type="date" class="input" id="visitDate" value="${editVisit ? editVisit.date : new Date().toISOString().split('T')[0]}" />
      </div>
      
      <div class="form-group">
        <label class="form-label">${icon('star', { className: 'icon--meta' })}Bewertung</label>
        <div id="ratingWidget"></div>
      </div>
      
      <div class="form-group">
        <label class="form-label">${icon('note', { className: 'icon--meta' })}Review (optional)</label>
        <textarea class="input textarea" id="reviewText" rows="4" placeholder="Wie war die Vorstellung? Was hat dir gefallen? Was nicht?">${editVisit && editVisit.review ? escapeHTML(editVisit.review) : ''}</textarea>
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

  // ── Nächstgelegenes Opernhaus vorauswählen ──────────────────────────
  //
  // Nur im leeren Formular: kommt das Haus aus der URL (#/log?house=...) oder
  // aus dem bearbeiteten Besuch, bleibt es unangetastet. Die Vorauswahl ist
  // ein Vorschlag, keine Korrektur.
  const houseHint = page.querySelector('#houseHint');

  // Merkt sich, was die Automatik gesetzt hat. Nur das darf sie später selbst
  // wieder überschreiben – eine Eingabe von Hand ist tabu.
  let autoSelected = null;

  function clearAutoSelection() {
    autoSelected = null;
    houseHint.hidden = true;
  }

  function preselectNearest(position) {
    if (!position) return;

    const untouched = (!houseIdInput.value && !houseInput.value.trim())
      || (autoSelected && houseIdInput.value === autoSelected.id
                       && houseInput.value === autoSelected.label);
    if (!untouched) return;

    const nearest = nearestOperaHouse(position.lat, position.lon);
    if (!nearest) return;

    const label = `${nearest.house.name} (${nearest.house.city})`;
    houseInput.value = label;
    houseIdInput.value = nearest.house.id;
    autoSelected = { id: nearest.house.id, label };

    houseHint.innerHTML = `${icon('pin', { className: 'icon--meta' })}Nächstgelegenes Haus`
      + ` (${formatDistance(nearest.distanceKm)}) – nach deinem Standort vorausgewählt.`;
    houseHint.hidden = false;
  }

  if (!params.house && !editVisit) {
    // Erst der gespeicherte Standort: die Vorauswahl steht damit sofort und
    // auch offline, ohne dass jemand auf das GPS wartet. Die frische Abfrage
    // darf sie danach noch verbessern – solange das Feld unberührt blieb.
    preselectNearest(getCachedPosition());
    requestPosition().then((pos) => {
      // Kommt die Antwort erst, wenn die Seite längst verlassen wurde,
      // gibt es nichts mehr zu füllen.
      if (page.isConnected) preselectNearest(pos);
    });
  }

  houseInput.addEventListener('input', () => {
    clearAutoSelection();
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
        clearAutoSelection();
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

  // Close dropdowns when clicking elsewhere (scoped to page to prevent leaks)
  page.addEventListener('click', (e) => {
    if (!e.target.closest('#houseAutocomplete')) houseList.style.display = 'none';
    if (!e.target.closest('#operaAutocomplete')) operaList.style.display = 'none';
  });

  // Form submit
  const form = page.querySelector('#logForm');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const houseId = houseIdInput.value;
    const operaId = operaIdInput.value;
    const date = page.querySelector('#visitDate').value;
    const review = page.querySelector('#reviewText').value.trim();

    if (!houseId) { shakeElement(houseInput); return; }
    if (!operaId) { shakeElement(operaInput); return; }
    if (!selectedRating) { shakeElement(ratingWidget); return; }
    if (!date) { shakeElement(page.querySelector('#visitDate')); return; }
    if (new Date(date) > new Date()) { shakeElement(page.querySelector('#visitDate')); showToast('Datum darf nicht in der Zukunft liegen'); return; }

    const payload = { houseId, operaId, date, rating: selectedRating, review };
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    const ok = await runWithFeedback(
      () => editVisit ? store.updateVisit(editVisit.id, payload) : store.addVisit(payload),
      {
        failure: editVisit ? 'Änderungen konnten nicht gespeichert werden'
                           : 'Besuch konnte nicht gespeichert werden',
        success: editVisit ? 'Besuch erfolgreich aktualisiert!'
                           : 'Besuch erfolgreich geloggt!',
      }
    );

    if (!ok) {
      submitBtn.disabled = false;
      return;
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

function formatDistance(km) {
  if (km < 1) return 'unter 1 km';
  if (km < 10) return `${km.toFixed(1).replace('.', ',')} km`;
  return `${Math.round(km)} km`;
}
