// House Detail Page
import { operaHouses } from '../data/operaHouses.js';
import { icon } from '../components/Icon.js';
import { istAdmin } from '../store/supabase.js';
import { loeschSchalter } from '../components/KatalogLoeschen.js';
import { coverBackground, escapeHTML } from '../utils.js';
import { showError, showToast } from '../components/Toast.js';
import { operas } from '../data/operas.js';
import { kurzname } from '../data/composers.js';
import { store } from '../store/store.js';
import { ReviewCard } from '../components/ReviewCard.js';
import { StarRating } from '../components/StarRating.js';
import { RatingsHistogram } from '../components/RatingsHistogram.js';
import { isSupabaseConfigured } from '../config.js';
import { abendeImHaus, terminMitWochentag, zeitText, heuteIso } from '../data/spielplanAbfrage.js';
import { spielplanQuelle } from '../components/SpielplanBlock.js';
import { kalenderEintrag, kalenderDateiname, kalenderHerunterladen } from '../kalender.js';

// Die nächsten zwei Abende stehen da, der Rest klappt auf (Jonas'
// Vorgabe: die Seite soll das Haus zeigen, nicht einen ganzen Spielplan).
const ABENDE_SICHTBAR = 2;

/**
 * "Demnächst hier": was das Haus in dieser Spielzeit spielt, aus dem
 * Spielplan (src/data/spielplan.js). Vorher stand auf der Seite eines Hauses
 * nur, was Nutzer dort geloggt hatten – obwohl die Termine vorlagen.
 */
function demnaechstHier(bereich, house) {
  const heute = heuteIso();
  // Nur Werke, die der Katalog gerade kennt – die aus der Datenbank kommen
  // erst mit ihr; sonst stimmte die Zahl oben nicht mit den Zeilen überein.
  const abende = abendeImHaus(house.id, { heute }).filter(a => operas.some(o => o.id === a.werk));
  const titel = `<h2 class="section__title">${icon('calendar')}Demnächst hier</h2>`;
  if (!abende.length) {
    bereich.innerHTML = `${titel}
      <p class="haus-spielplan__leer">Für dieses Haus liegen gerade keine Termine vor – etwa weil das Programm
        noch nicht veröffentlicht ist. Maßgeblich ist die Seite des Hauses.</p>`;
    return;
  }

  const merkliste = new Set(store.getWishlist()?.items || []);
  const werke = new Set(abende.map(a => a.werk)).size;
  let alle = false;

  const zeile = (a) => {
    const werk = operas.find(o => o.id === a.werk);
    const zeit = zeitText(a.zeit);

    // Nur https wird ein Link: die Adressen stammen von fremden Seiten.
    const beimHaus = /^https:\/\//i.test(a.url)
      ? ` · <a class="naehe-abend__haus" href="${escapeHTML(a.url)}" target="_blank" rel="noopener">zur Produktion</a>` : '';
    return `
      <div class="naehe-abend">
        <span class="naehe-abend__zeit">${zeit ? escapeHTML(zeit.slice(0, 5)) : '–'}</span>
        <div class="naehe-abend__was">
          <a class="naehe-abend__werk" href="#/opera/${escapeHTML(werk.id)}">${merkliste.has(werk.id)
            ? `<span class="naehe-abend__stern" title="Auf deiner Wunschliste">${icon('star', { filled: true })}</span>` : ''}${escapeHTML(werk.title)}</a>
          <span class="naehe-abend__wo">${escapeHTML(kurzname(werk.composer))}${beimHaus}</span>
        </div>
        <button type="button" class="naehe-abend__kalender" data-werk="${escapeHTML(werk.id)}" data-datum="${a.datum}"
          title="In den Kalender" aria-label="${escapeHTML(`In den Kalender: ${werk.title}, ${a.datum}`)}">${icon('calendar')}</button>
      </div>`;
  };

  const zeichnen = () => {
    const gezeigt = alle ? abende : abende.slice(0, ABENDE_SICHTBAR);
    const tage = new Map();
    for (const a of gezeigt) {
      if (!tage.has(a.datum)) tage.set(a.datum, []);
      tage.get(a.datum).push(a);
    }
    bereich.innerHTML = `${titel}
      <p class="haus-spielplan__anzahl">${abende.length} ${abende.length === 1 ? 'Abend' : 'Abende'}
        · ${werke} ${werke === 1 ? 'Werk' : 'Werke'} aus dem Katalog</p>
      ${[...tage].map(([datum, zeilen]) => `
        <section class="naehe-tag">
          <h3 class="naehe-tag__datum">${terminMitWochentag(datum, heute)}</h3>
          ${zeilen.map(zeile).join('')}
        </section>`).join('')}
      ${abende.length > ABENDE_SICHTBAR ? `
        <button type="button" class="btn btn--outline naehe-mehr" data-aktion="alle" aria-expanded="${alle}">
          ${alle ? 'Weniger zeigen' : `Alle ${abende.length} Abende zeigen`}
        </button>` : ''}`;
    bereich.appendChild(spielplanQuelle());
  };

  bereich.addEventListener('click', (e) => {
    if (e.target.closest('[data-aktion="alle"]')) {
      alle = !alle;
      zeichnen();
      if (!alle) bereich.scrollIntoView({ block: 'start', behavior: 'smooth' });
      return;
    }
    const knopf = e.target.closest('.naehe-abend__kalender');
    if (!knopf) return;
    const abend = abende.find(a => a.werk === knopf.dataset.werk && a.datum === knopf.dataset.datum);
    const werk = operas.find(o => o.id === knopf.dataset.werk);
    if (!abend || !werk) return;
    kalenderHerunterladen(
      kalenderEintrag({ werk, haus: house, datum: abend.datum, zeit: abend.zeit, url: abend.url }),
      kalenderDateiname(werk, house, abend.datum));
    showToast('Kalendereintrag erstellt');
  });

  zeichnen();
}

export function HouseDetailPage(houseId) {
  const house = operaHouses.find(h => h.id === houseId);
  if (!house) {
    const page = document.createElement('div');
    page.className = 'page';
    page.innerHTML = '<div class="empty-state"><p>Opernhaus nicht gefunden.</p><a href="#/houses" class="btn btn--primary">Zu den Opernhäusern</a></div>';
    return page;
  }

  const page = document.createElement('div');
  page.className = 'page page--house-detail';

  const heroStyle = coverBackground(
    house.imageUrl,
    `linear-gradient(135deg, ${house.color}, #14181c)`,
    'rgba(20, 24, 28, 0.3), #14181c'
  );

  page.innerHTML = `
    <div class="detail-hero" style="${heroStyle}">
      <a href="javascript:void(0)" class="back-link" onclick="history.back()">← Zurück</a>
      <div class="detail-hero__content">
        <h1 class="detail-hero__title">${house.name}</h1>
        <div class="detail-hero__meta">
          <span>${icon('pin', { className: 'icon--meta' })}${house.city}, ${house.state}</span>
          <span>${icon('seat', { className: 'icon--meta' })}${house.capacity} Plätze</span>
          <span>${icon('calendar', { className: 'icon--meta' })}Gegründet ${house.founded}</span>
        </div>
        <div class="detail-hero__rating" id="houseRating">
          <div class="loading-spinner"><div class="spinner"></div></div>
        </div>
      </div>
    </div>
    
    <div class="detail-body">
      <div class="detail-section">
        <div id="houseHistogram" class="detail-histogram"></div>
        <p class="detail-description">${house.description}</p>
        <a href="#/log?house=${house.id}" class="btn btn--primary">+ Besuch hier loggen</a>
      </div>
      
      <div class="detail-section haus-spielplan" id="hausSpielplan"></div>

      <div class="detail-section" id="performedOperasSection" style="display:none">
        <h2 class="section__title">${icon('music')}Hier geloggt</h2>
        <div class="tag-list" id="performedOperas"></div>
      </div>
      
      <div class="detail-section">
        <h2 class="section__title" id="reviewsHeading">${icon('note')}Reviews</h2>
        <div class="feed-list" id="houseReviews">
          <div class="loading-spinner"><div class="spinner"></div></div>
        </div>
      </div>
    </div>
  `;

  async function loadVisits() {
    let allVisits = [];
    try {
      if (isSupabaseConfigured()) {
        const fetchSb = await import('../store/supabase.js');
        const cloudData = await fetchSb.getVisitsByHouseCloud(house.id);
        allVisits = cloudData.map(v => fetchSb.mapCloudVisit(v));
      } else {
        allVisits = [...store.getVisitsByHouse(house.id)];
      }
    } catch (e) {
      console.error('[Community-Bewertungen laden]', e);
      showError('Bewertungen der Community konnten nicht geladen werden.');
      allVisits = [...store.getVisitsByHouse(house.id)];
    }

    // Update rating header
    const ratingEl = page.querySelector('#houseRating');
    if (ratingEl) {
      ratingEl.innerHTML = '';
      if (allVisits.length > 0) {
        const sum = allVisits.reduce((acc, v) => acc + v.rating, 0);
        const avg = sum / allVisits.length;
        ratingEl.appendChild(StarRating(avg, false, null, 'lg'));
        const countEl = document.createElement('span');
        countEl.className = 'detail-hero__rating-count';
        countEl.textContent = `${allVisits.length} ${allVisits.length === 1 ? 'Bewertung' : 'Bewertungen'}`;
        ratingEl.appendChild(countEl);
      } else {
        ratingEl.innerHTML = '<span class="text-muted">Noch keine Bewertungen</span>';
      }
    }

    // Update histogram
    const histogramEl = page.querySelector('#houseHistogram');
    if (histogramEl) {
      histogramEl.innerHTML = '';
      const ratings = allVisits.filter(v => v.rating).map(v => parseFloat(v.rating));
      if (ratings.length > 0) {
        histogramEl.appendChild(RatingsHistogram(ratings, { accentColor: house.color || '#8b1a2b' }));
      }
    }

    // "Hier geloggt": die Werke der Abende, die Nutzer hier eingetragen haben
    const operaIds = [...new Set(allVisits.map(v => v.operaId))];
    const performedOperas = operaIds.map(id => operas.find(o => o.id === id)).filter(Boolean);
    const performedSection = page.querySelector('#performedOperasSection');
    const tagsContainer = page.querySelector('#performedOperas');
    if (performedOperas.length > 0 && performedSection && tagsContainer) {
      performedSection.style.display = '';
      tagsContainer.innerHTML = '';
      performedOperas.forEach(opera => {
        const tag = document.createElement('a');
        tag.className = 'tag';
        tag.href = `#/opera/${opera.id}`;
        tag.textContent = opera.title;
        tagsContainer.appendChild(tag);
      });
    }

    // Update review count heading
    const heading = page.querySelector('#reviewsHeading');
    if (heading) {
      heading.innerHTML = `${icon('note')}Reviews (${allVisits.length})`;
    }

    // Render review cards
    const reviewsContainer = page.querySelector('#houseReviews');
    reviewsContainer.innerHTML = '';
    if (allVisits.length === 0) {
      reviewsContainer.innerHTML = '<div class="empty-state">Noch keine Reviews für dieses Haus.</div>';
    } else {
      allVisits.forEach(visit => {
        reviewsContainer.appendChild(ReviewCard(visit, { showHouse: false }));
      });
    }
  }
  demnaechstHier(page.querySelector('#hausSpielplan'), house);
  loadVisits();

  // Der Schalter zum Entfernen kommt nach, sobald die Adminfrage beantwortet
  // ist – und nur bei Einträgen, die in der Datenbank stehen. Was als Datei im
  // Repo liegt, kann die App nicht löschen.
  istAdmin().then(ja => {
    const schalter = loeschSchalter('haus', house, ja, () => {
      window.location.hash = '#/houses';
    });
    if (schalter) page.appendChild(schalter);
  }).catch(() => {});

  return page;
}
