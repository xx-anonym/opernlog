// Log Visit Page
import { operaHouses, nearestOperaHouse } from '../data/operaHouses.js';
import { icon } from '../components/Icon.js';
import { operas } from '../data/operas.js';
import { store } from '../store/store.js';
import { escapeHTML, getCachedPosition, requestPosition, requestPositionByIP, visitCredits } from '../utils.js';
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

  // Dirigent, Regie, Besetzung. Alle drei dürfen leer bleiben – deshalb stehen
  // sie zusammengeklappt hinter einer eigenen Zeile und verlängern das
  // Formular nicht für alle, die sie nicht ausfüllen wollen. Beim Bearbeiten
  // klappt der Block auf, sobald eines der Felder etwas enthält.
  const credits = visitCredits(editVisit || {});

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
      
      <details class="form-collapse"${credits.any ? ' open' : ''}>
        <summary class="form-collapse__summary">
          ${icon('users', { className: 'icon--meta' })}Mitwirkende <span class="form-collapse__optional">(optional)</span>
        </summary>
        <div class="form-collapse__body">
          <div class="form-group">
            <label class="form-label" for="conductorInput">${icon('music', { className: 'icon--meta' })}Dirigent</label>
            <input type="text" class="input" id="conductorInput" placeholder="z.B. Kirill Petrenko"
              value="${escapeHTML(credits.conductor)}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="directorInput">${icon('bookOpen', { className: 'icon--meta' })}Regie</label>
            <input type="text" class="input" id="directorInput" placeholder="z.B. Barrie Kosky"
              value="${escapeHTML(credits.director)}" />
          </div>
          <div class="form-group">
            <label class="form-label" for="castInput">${icon('users', { className: 'icon--meta' })}Besetzung</label>
            <textarea class="input textarea" id="castInput" rows="3"
              placeholder="Eine Zeile pro Person, z.B.&#10;Anna Netrebko (Tosca)&#10;Jonas Kaufmann (Cavaradossi)">${escapeHTML(credits.castList)}</textarea>
          </div>
        </div>
      </details>

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

  // ── Opernhaus vorbelegen ────────────────────────────────────────────
  //
  // Nur im leeren Formular: kommt das Haus aus der URL (#/log?house=...) oder
  // aus dem bearbeiteten Besuch, bleibt es unangetastet. Die Vorbelegung ist
  // ein Vorschlag, keine Korrektur.
  //
  // Drei Quellen, absteigend nach Verlässlichkeit. Jede darf nur überschreiben,
  // was eine gleich gute oder schlechtere Quelle gesetzt hat – und nichts, was
  // von Hand eingetragen wurde.
  const QUELLEN = {
    // Standortfreigabe: auf wenige Meter genau, das Haus steht damit fest.
    standort: {
      rang: 3,
      maxKm: 150,
      hinweis: (km) => `${icon('pin', { className: 'icon--meta' })}Nächstgelegenes Haus`
        + ` (${formatDistance(km)}) – nach deinem Standort vorausgewählt.`,
    },
    // Eigenes Tagebuch: keine Ortung, sondern Gewohnheit. Wer regelmäßig geht,
    // hat meist ein Stammhaus.
    tagebuch: {
      rang: 2,
      hinweis: () => `${icon('book', { className: 'icon--meta' })}Zuletzt besucht`
        + ` – aus deinem Tagebuch vorausgewählt.`,
    },
    // IP-Ortung: stadtgenau im besten Fall, im Mobilfunk oft weit daneben.
    // Deshalb ein engerer Umkreis als beim echten Standort – lieber gar kein
    // Vorschlag als ein falscher – und ein Hinweis, der zum Prüfen auffordert.
    ip: {
      rang: 1,
      maxKm: 60,
      hinweis: () => `${icon('globe', { className: 'icon--meta' })}Grobe Schätzung nach deiner`
        + ` Internetverbindung – bitte prüfen.`,
    },
  };

  const houseHint = page.querySelector('#houseHint');

  // Merkt sich, was die Automatik gesetzt hat und aus welcher Quelle. Nur das
  // darf sie später selbst wieder überschreiben – eine Eingabe von Hand ist tabu.
  let autoSelected = null;

  function clearAutoSelection() {
    autoSelected = null;
    houseHint.hidden = true;
  }

  // Sobald das Feld einmal von Hand angefasst wurde, hält sich die Automatik
  // vollständig heraus – auch wenn es danach leer ist. Eine spät eintreffende
  // Ortung soll nicht wieder hineinschreiben, was gerade gelöscht wurde.
  let houseTouched = false;

  function fieldIsFree() {
    if (houseTouched) return false;
    if (!houseIdInput.value && !houseInput.value.trim()) return true;
    return !!autoSelected
      && houseIdInput.value === autoSelected.id
      && houseInput.value === autoSelected.label;
  }

  function fillHouse(house, quelle, distanzKm) {
    if (!house || !fieldIsFree()) return false;
    if (autoSelected && autoSelected.rang > quelle.rang) return false;

    const label = `${house.name} (${house.city})`;
    houseInput.value = label;
    houseIdInput.value = house.id;
    autoSelected = { id: house.id, label, rang: quelle.rang };

    houseHint.innerHTML = quelle.hinweis(distanzKm);
    houseHint.hidden = false;
    return true;
  }

  function fillFromPosition(position, quelle) {
    if (!position) return false;
    const nearest = nearestOperaHouse(position.lat, position.lon, quelle.maxKm);
    if (!nearest) return false;
    return fillHouse(nearest.house, quelle, nearest.distanceKm);
  }

  // Zuletzt besuchtes Haus. Liegen mehrere Besuche auf demselben – also dem
  // jüngsten – Datum, gewinnt das Haus, in dem insgesamt am häufigsten war.
  function lastVisitedHouse() {
    const visits = store.getVisitsByUser('user-me') || [];
    if (!visits.length) return null;

    const neuestesDatum = visits.reduce((max, v) => (v.date > max ? v.date : max), '');
    const haeufigkeit = {};
    visits.forEach(v => { haeufigkeit[v.houseId] = (haeufigkeit[v.houseId] || 0) + 1; });

    const kandidaten = visits
      .filter(v => v.date === neuestesDatum)
      .sort((a, b) => (haeufigkeit[b.houseId] || 0) - (haeufigkeit[a.houseId] || 0));

    for (const v of kandidaten) {
      const house = operaHouses.find(h => h.id === v.houseId);
      if (house) return house;
    }
    return null;
  }

  async function preselectHouse() {
    // 1. Gespeicherter Standort: die Vorauswahl steht damit sofort und auch
    //    offline, ohne dass jemand auf das GPS wartet.
    fillFromPosition(getCachedPosition(), QUELLEN.standort);

    // 2. Tagebuch, solange noch nichts steht.
    if (!autoSelected) fillHouse(lastVisitedHouse(), QUELLEN.tagebuch);

    // 3. Frische Standortabfrage – sie darf das Tagebuch überstimmen.
    const position = await requestPosition();
    if (!page.isConnected) return;   // Seite längst verlassen
    if (position && fillFromPosition(position, QUELLEN.standort)) return;

    // 4. Erst wenn gar nichts greift, die grobe Ortung über die IP. Damit
    //    bleibt sie für alle mit Tagebucheinträgen unangetastet – der Dienst
    //    wird dann überhaupt nicht kontaktiert.
    if (autoSelected || houseIdInput.value || houseInput.value.trim()) return;

    const ipPosition = await requestPositionByIP();
    if (!page.isConnected) return;
    fillFromPosition(ipPosition, QUELLEN.ip);
  }

  if (!params.house && !editVisit) preselectHouse();

  // Löschtaste räumt die gewählte Zeile am Stück – siehe selectionField().
  const houseField = selectionField({
    input: houseInput,
    idInput: houseIdInput,
    list: houseList,
    labelFor: (id) => {
      const house = operaHouses.find(h => h.id === id);
      return house ? `${house.name} (${house.city})` : null;
    },
    onChange: () => { houseTouched = true; clearAutoSelection(); },
  });

  houseInput.addEventListener('input', () => {
    if (houseField.consumedInput()) return;

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
        houseTouched = true;
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

  const operaField = selectionField({
    input: operaInput,
    idInput: operaIdInput,
    list: operaList,
    labelFor: (id) => {
      const opera = operas.find(o => o.id === id);
      return opera ? `${opera.title} – ${opera.composer}` : null;
    },
  });

  operaInput.addEventListener('input', () => {
    if (operaField.consumedInput()) return;

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

    const payload = {
      houseId, operaId, date, rating: selectedRating, review,
      // Dürfen leer sein – dann werden sie später schlicht nicht angezeigt.
      conductor: page.querySelector('#conductorInput').value.trim(),
      director: page.querySelector('#directorInput').value.trim(),
      castList: page.querySelector('#castInput').value.trim(),
    };
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

/**
 * Verdrahtet ein Autocomplete-Feld so, dass eine fertige Auswahl mit einem
 * Druck auf die Löschtaste am Stück verschwindet.
 *
 * Solange im Feld genau der Name des gewählten Eintrags steht, ist der Inhalt
 * keine frei getippte Zeichenkette, sondern eine Auswahl – und die löscht man
 * am Stück. Sich durch „Bayerische Staatsoper (München)“ zurückzulöschen, nur
 * um ein anderes Haus einzutragen, sind 31 Anschläge für nichts. Wer die
 * Löschtaste ansetzt, will den Eintrag ohnehin ersetzen. Weicht der Text von
 * der Auswahl ab, arbeitet sie wieder Zeichen für Zeichen wie überall sonst.
 *
 * @param {object}   o
 * @param {HTMLInputElement} o.input     sichtbares Textfeld
 * @param {HTMLInputElement} o.idInput   verstecktes Feld mit der gewählten ID
 * @param {HTMLElement}      o.list      Vorschlagsliste
 * @param {(id: string) => string|null} o.labelFor  Name zur ID
 * @param {() => void} [o.onChange]      läuft bei jeder Änderung von Hand
 */
function selectionField({ input, idInput, list, labelFor, onChange = () => {} }) {
  // Der Stand unmittelbar vor dem Tastendruck – gebraucht für den Rückfall
  // in consumedInput().
  let labelBefore = null;

  function selectedLabel() {
    const label = idInput.value ? labelFor(idInput.value) : null;
    return label && input.value === label ? label : null;
  }

  function clear() {
    input.value = '';
    idInput.value = '';
    list.innerHTML = '';
    list.style.display = 'none';
    onChange();
  }

  input.addEventListener('keydown', (e) => {
    labelBefore = selectedLabel();
    if (e.key !== 'Backspace' && e.key !== 'Delete') return;
    if (!labelBefore) return;   // frei getippter Text: Zeichen für Zeichen

    e.preventDefault();
    labelBefore = null;
    clear();
  });

  // Fehlt gegenüber der Auswahl genau ein Zeichen, war das die Löschtaste.
  function oneCharShorter(short, long) {
    if (short.length !== long.length - 1) return false;
    let i = 0;
    while (i < short.length && short[i] === long[i]) i++;
    return short.slice(i) === long.slice(i + 1);
  }

  return {
    /**
     * Am Anfang jedes input-Ereignisses aufrufen. true heißt: die Eingabe war
     * ein Löschen und ist bereits erledigt, der Rest des Handlers entfällt.
     */
    consumedInput() {
      const before = labelBefore;
      labelBefore = null;

      // Rückfall für Bildschirmtastaturen: Android meldet für die Löschtaste
      // oft key 'Unidentified', der keydown-Zweig oben greift dann nicht.
      // Der Vergleich mit dem Stand vor dem Tastendruck erkennt sie trotzdem.
      if (before && oneCharShorter(input.value, before)) {
        clear();
        return true;
      }

      // Der Text ist von Hand geändert, die gemerkte ID gehört nicht mehr
      // dazu. Ohne das würde beim Speichern der alte Eintrag landen, während
      // im Feld längst ein anderer Name steht.
      idInput.value = '';
      onChange();
      return false;
    },
  };
}
