// Operas Browse Page
import { operas } from '../data/operas.js';
import { icon } from '../components/Icon.js';
import { coverBackground, einblendVerzoegerung } from '../utils.js';
import { store } from '../store/store.js';
import { BlindSpots } from '../components/BlindSpots.js';
import { isSupabaseConfigured } from '../config.js';
import { istAdmin } from '../store/supabase.js';
import { katalogModal } from '../components/KatalogFormular.js';
import { composerFarbe } from '../data/composerFarben.js';
import { gesehenIds } from '../data/seenOperas.js';

export function OperasPage() {
  const page = document.createElement('div');
  page.className = 'page page--operas';

  // Restore persisted filter state
  const savedComposer = sessionStorage.getItem('operas_activeComposer') || '';
  const savedSort = sessionStorage.getItem('operas_sort') || 'title';
  const savedSearch = sessionStorage.getItem('operas_search') || '';
  const savedLang = sessionStorage.getItem('operas_language') || '';
  const savedSeen = sessionStorage.getItem('operas_seen') || '';

  page.innerHTML = `
    <div class="page-header">
      <h1 class="page-header__title">${icon('music')}Opernwerke</h1>
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
        <select class="select" id="seenFilter">
          <option value=""${savedSeen === '' ? ' selected' : ''}>Alles</option>
          <option value="gesehen"${savedSeen === 'gesehen' ? ' selected' : ''}>Schon gesehen</option>
          <option value="offen"${savedSeen === 'offen' ? ' selected' : ''}>Noch nicht gesehen</option>
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
    <div id="blindSpotsSlot"></div>
    <div class="card-grid card-grid--operas" id="operasGrid"></div>
  `;

  // Blinde Flecken über dem Katalog: hier steht ohnehin die Frage, was man als
  // Nächstes sehen könnte. Ohne eigene Besuche fällt der Abschnitt ganz weg.
  const blinde = BlindSpots(store.getVisitsByUser('user-me') || [], store.getSeenOperas());
  if (blinde) page.querySelector('#blindSpotsSlot').appendChild(blinde);

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
    sessionStorage.setItem('operas_seen', page.querySelector('#seenFilter').value);
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

  // Community stats cache (populated async from cloud)
  let communityOperaStats = {};


  function renderOperas() {
    const grid = page.querySelector('#operasGrid');
    const search = page.querySelector('#operaSearch').value.toLowerCase();
    const sort = page.querySelector('#operaSort').value;
    const lang = page.querySelector('#languageFilter').value;
    const seen = page.querySelector('#seenFilter').value;

    // Gesehen heißt geloggt ODER als gesehen markiert – dieselbe Definition
    // wie im Profil. Wer ein Werk vor OpernLog gesehen hat, trägt es ohne
    // Datum und Bewertung ein; es hier nicht mitzuzählen hieße, ihm sein
    // halbes Opernleben nicht anzurechnen.
    //
    // Bei jedem Zeichnen neu, nicht einmal beim Aufbau der Seite: das Häkchen
    // lässt sich auf der Werkseite setzen, und danach kehrt man hierher zurück.
    const gesehen = seen ? gesehenIds(store.getVisitsByUser('user-me'), store.getSeenOperas()) : null;

    let filtered = operas.filter(o => {
      const matchesSearch = !search || o.title.toLowerCase().includes(search) || o.composer.toLowerCase().includes(search);
      const matchesComposer = !activeComposer || o.composer === activeComposer;
      const matchesLang = !lang || o.language === lang;
      const matchesSeen = !seen || (seen === 'gesehen' ? gesehen.has(o.id) : !gesehen.has(o.id));
      return matchesSearch && matchesComposer && matchesLang && matchesSeen;
    });

    filtered.sort((a, b) => {
      switch (sort) {
        case 'title': return a.title.localeCompare(b.title);
        case 'composer': return a.composer.localeCompare(b.composer);
        case 'year': return a.yearComposed - b.yearComposed;
        case 'rating': {
          const rA = (communityOperaStats[a.id]?.avg) || store.getAverageRatingForOpera(a.id) || 0;
          const rB = (communityOperaStats[b.id]?.avg) || store.getAverageRatingForOpera(b.id) || 0;
          return rB - rA;
        }
        case 'popular': {
          const cA = (communityOperaStats[a.id]?.count) || store.getVisitsByOpera(a.id).length;
          const cB = (communityOperaStats[b.id]?.count) || store.getVisitsByOpera(b.id).length;
          return cB - cA;
        }
        default: return 0;
      }
    });

    grid.innerHTML = '';
    filtered.forEach((opera, i) => {
      const avgRating = (communityOperaStats[opera.id]?.avg) || store.getAverageRatingForOpera(opera.id);
      const visitCount = (communityOperaStats[opera.id]?.count) || store.getVisitsByOpera(opera.id).length;
      const color = composerFarbe(opera.composer);

      const card = document.createElement('a');
      card.className = 'opera-card fade-in';
      card.href = `#/opera/${opera.id}`;
      card.style.animationDelay = einblendVerzoegerung(i);
      card.style.textDecoration = 'none';
      card.style.color = 'inherit';
      card.innerHTML = `
        <div class="opera-card__color" style="${coverBackground(opera.image, `linear-gradient(135deg, ${color}, #14181c)`)}">
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
      grid.appendChild(card);
    });

    if (filtered.length === 0) {
      // "Keine Opern gefunden" wäre hier irreführend: gefunden wurde nichts,
      // weil noch nichts geloggt oder markiert ist, nicht weil die Suche
      // danebenging.
      const leer = seen === 'gesehen' && gesehen.size === 0
        ? 'Du hast noch kein Werk geloggt oder als gesehen markiert.'
        : seen === 'offen' && !search && !lang && !activeComposer
          ? 'Du hast jedes Werk im Katalog gesehen.'
          : 'Keine Opern gefunden.';
      grid.innerHTML = `<div class="empty-state">${leer}</div>`;
    }
  }

  page.querySelector('#operaSearch').addEventListener('input', () => { saveFilterState(); renderOperas(); });
  page.querySelector('#operaSort').addEventListener('change', () => { saveFilterState(); renderOperas(); });
  page.querySelector('#languageFilter').addEventListener('change', () => { saveFilterState(); renderOperas(); });
  page.querySelector('#seenFilter').addEventListener('change', () => { saveFilterState(); renderOperas(); });

  // Der Admin schlägt nichts vor, er trägt ein. Bis die Antwort da ist,
  // bleibt der Schalter der Vorschlagsschalter – das ist der Normalfall.
  let adminModus = false;
  istAdmin().then(ja => {
    adminModus = ja;
    if (!ja) return;
    const k = page.querySelector('#suggestOperaBtn');
    if (k) k.innerHTML = k.innerHTML.replace('Fehlendes Werk vorschlagen', 'Werk hinzufügen');
  }).catch(() => {});

  page.querySelector('#suggestOperaBtn').addEventListener('click', () => {
    if (adminModus) {
      document.body.appendChild(katalogModal('werk', () => renderOperas()));
      return;
    }

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

  // Load community stats from cloud and re-render with real data
  if (isSupabaseConfigured()) {
    import('../store/supabase.js').then(async (sbModule) => {
      try {
        const { operaStats } = await sbModule.getAllCommunityStats();
        communityOperaStats = operaStats;
        renderOperas();
      } catch (e) {
        // Nicht blockierend: die Seite funktioniert auch ohne
        // Community-Durchschnitte, sie zeigt dann nur keine an.
        console.error('[Community-Statistiken laden]', e);
      }
    });
  }

  return page;
}
