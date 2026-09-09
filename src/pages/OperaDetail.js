// Opera Detail Page
import { operas } from '../data/operas.js';
import { icon } from '../components/Icon.js';
import { coverBackground, escapeHTML, datumKurz } from '../utils.js';
import { werkVerlauf } from '../data/werkVerlauf.js';
import { composerLink } from './ComposerDetail.js';
import { runWithFeedback, showError } from '../components/Toast.js';
import { operaHouses } from '../data/operaHouses.js';
import { store } from '../store/store.js';
import { ReviewCard } from '../components/ReviewCard.js';
import { StarRating } from '../components/StarRating.js';
import { RatingsHistogram } from '../components/RatingsHistogram.js';
import { isSupabaseConfigured } from '../config.js';

/** Eine Bewertung als "4,5" – im Fließtext, wo ganze Sterne zu breit wären. */
function note(n) {
    return n === null || n === undefined ? '' : n.toFixed(1).replace('.', ',');
}

/**
 * "Deine Abende mit diesem Werk" – erst ab dem zweiten Abend.
 *
 * Ein Film bleibt derselbe, eine Oper wird jedes Mal neu gemacht. Interessant
 * ist deshalb nicht, ob jemand Tosca mag, sondern welche Tosca – und das steht
 * bisher über einzelne Tagebucheinträge verstreut, obwohl jeder Besuch Haus,
 * Datum, Bewertung und Mitwirkende führt.
 *
 * Beim ersten Abend gibt es nichts zu vergleichen; eine Liste mit einem
 * Eintrag stünde bloß im Weg, und der Abend selbst steht ohnehin unten bei den
 * Reviews.
 *
 * Aus den eigenen Besuchen, die lokal vorliegen – der Block steht damit
 * sofort da und wartet nicht auf die Bewertungen der Community.
 */
function werkVerlaufAbschnitt(operaId) {
    const v = werkVerlauf(store.getVisitsByOpera(operaId), operaId);
    if (!v || v.anzahl < 2) return '';

    const zeilen = v.abende.map(a => {
        // Dirigent und Regie prägen den Abend; die Besetzung ist zu lang für
        // eine Zeile und steht vollständig auf der Review-Karte.
        const wer = [a.credits.conductor, a.credits.director]
            .filter(Boolean).map(escapeHTML).join(' · ');
        return `
          <li class="werkverlauf__abend">
            <a class="werkverlauf__zeile" href="#/visit/${encodeURIComponent(a.visit.id)}">
              <span class="werkverlauf__datum">${datumKurz(a.datum)}</span>
              <span class="werkverlauf__haus">${a.haus
                ? escapeHTML(a.haus.name)
                : '<span class="text-muted">Haus nicht im Katalog</span>'}</span>
              <span class="werkverlauf__note">${a.note === null
                ? '<span class="text-muted">ohne Bewertung</span>'
                : `${icon('star', { filled: true, className: 'icon--meta' })}${note(a.note)}`}</span>
            </a>
            ${wer ? `<p class="werkverlauf__credits">${wer}</p>` : ''}
          </li>`;
    }).join('');

    const bewertet = v.abende.filter(a => a.note !== null);
    const teile = [];
    // entwicklung ist nur gesetzt, wenn mindestens zwei Abende bewertet sind –
    // sonst gäbe es nichts zu vergleichen. "immer 4,0" stand sonst auch dann
    // da, wenn genau ein Abend eine Note hatte, und behauptete eine
    // Beständigkeit, für die es keinen zweiten Wert gab.
    if (v.entwicklung !== null && v.entwicklung !== 0) {
        teile.push(`von ${note(bewertet[0].note)} auf ${note(bewertet[bewertet.length - 1].note)}`);
    } else if (v.entwicklung === 0) {
        teile.push(`immer ${note(v.schnitt)}`);
    }
    if (v.haeuser > 1) teile.push(`${v.haeuser} Häuser`);
    if (v.erste.jahr && v.letzte.jahr && v.erste.jahr !== v.letzte.jahr) {
        teile.push(`${v.erste.jahr} bis ${v.letzte.jahr}`);
    }

    return `
      <div class="detail-section">
        <!-- Kurz gehalten: auf der Werkseite ist "mit diesem Werk" gesagt,
             und mit dem Zusatz brach die Zahl bei 375 px in eine eigene
             Zeile und stand dort als Waise. -->
        <h2 class="section__title">
          ${icon('calendar')}Deine Abende
          <span class="section__count">${v.anzahl}×</span>
        </h2>
        <ol class="werkverlauf">${zeilen}</ol>
        ${teile.length ? `<p class="werkverlauf__fazit">${teile.join(' · ')}</p>` : ''}
      </div>`;
}

export function OperaDetailPage(operaId) {
  const opera = operas.find(o => o.id === operaId);
  if (!opera) {
    const page = document.createElement('div');
    page.className = 'page';
    page.innerHTML = '<div class="empty-state">Oper nicht gefunden.</div>';
    return page;
  }

  const page = document.createElement('div');
  page.className = 'page page--opera-detail';

  const composerColors = {
    'Wolfgang Amadeus Mozart': '#c9a84c',
    'Giuseppe Verdi': '#2d7d46',
    'Richard Wagner': '#7d2d2d',
    'Giacomo Puccini': '#2d5a7d',
    'Richard Strauss': '#7d5a2d',
  };
  const color = composerColors[opera.composer] || '#8b1a2b';

  page.innerHTML = `
    <div class="detail-hero" style="${coverBackground(opera.image, `linear-gradient(135deg, ${color}, #14181c)`, 'rgba(0,0,0,0.25), rgba(20,24,28,0.95)')}">
      <a href="javascript:void(0)" class="back-link" onclick="history.back()">← Zurück</a>
      <div class="detail-hero__content">
        <h1 class="detail-hero__title">${opera.title}</h1>
        <div class="detail-hero__meta">
          <span>${icon('music', { className: 'icon--meta' })}${composerLink(opera.composer)}</span>
          <span>${icon('calendar', { className: 'icon--meta' })}${opera.yearComposed}</span>
          <span>${icon('globe', { className: 'icon--meta' })}${opera.language}</span>
          <span>${icon('layers', { className: 'icon--meta' })}${opera.acts} ${opera.acts === 1 ? 'Akt' : 'Akte'}</span>
          <span>${icon('bookOpen', { className: 'icon--meta' })}${opera.genre}</span>
        </div>
        <div class="detail-hero__rating" id="operaRating">
          <div class="loading-spinner"><div class="spinner"></div></div>
        </div>
      </div>
    </div>
    
    <div class="detail-body">
      <div class="detail-section">
        <div id="operaHistogram" class="detail-histogram"></div>
        <p class="detail-description">${opera.description}</p>
        ${opera.librettist ? `<p class="detail-librettist"><strong>Libretto:</strong> ${opera.librettist}</p>` : ''}
        <div class="detail-actions">
          <a href="#/log?opera=${opera.id}" class="btn btn--primary">+ Besuch mit diesem Werk loggen</a>
          <button id="wishlistToggle" class="btn ${store.isOnWishlist(opera.id) ? 'btn--wishlist-active' : 'btn--outline'}">
            ${store.isOnWishlist(opera.id)
              ? icon('star', { filled: true }) + ' Auf der Wunschliste'
              : icon('star') + ' Auf die Wunschliste'}
          </button>
          ${store.hasLoggedOpera(opera.id) ? `
            <span class="btn btn--seen-static"
              title="Ergibt sich aus deinem geloggten Besuch – dafür braucht es keine Markierung">
              ${icon('checkCircle')} Gesehen · geloggt
            </span>
          ` : `
            <button id="seenToggle" class="btn ${store.isSeenOpera(opera.id) ? 'btn--seen-active' : 'btn--outline'}"
              title="Für Werke, die du vor OpernLog gesehen hast – ohne Datum, Haus und Bewertung">
              ${store.isSeenOpera(opera.id)
                ? icon('checkCircle') + ' Schon gesehen'
                : icon('check') + ' Schon gesehen'}
            </button>
          `}
        </div>
      </div>
      
      ${werkVerlaufAbschnitt(operaId)}

      <div class="detail-section" id="performedAtSection" style="display:none">
        <h2 class="section__title">${icon('building')}Aufgeführt in</h2>
        <div class="tag-list" id="performedAt"></div>
      </div>
      
      <div class="detail-section">
        <h2 class="section__title" id="reviewsHeading">${icon('note')}Reviews</h2>
        <div class="feed-list" id="operaReviews">
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
        const cloudData = await fetchSb.getVisitsByOperaCloud(opera.id);
        allVisits = cloudData.map(v => fetchSb.mapCloudVisit(v));
      } else {
        allVisits = [...store.getVisitsByOpera(opera.id)];
      }
    } catch (e) {
      console.error('[Community-Bewertungen laden]', e);
      showError('Bewertungen der Community konnten nicht geladen werden.');
      allVisits = [...store.getVisitsByOpera(opera.id)];
    }

    // Update rating header
    const ratingEl = page.querySelector('#operaRating');
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
    const histogramEl = page.querySelector('#operaHistogram');
    if (histogramEl) {
      histogramEl.innerHTML = '';
      const ratings = allVisits.filter(v => v.rating).map(v => parseFloat(v.rating));
      if (ratings.length > 0) {
        histogramEl.appendChild(RatingsHistogram(ratings, { accentColor: color }));
      }
    }

    // Update "Aufgeführt in" section
    const houseIds = [...new Set(allVisits.map(v => v.houseId))];
    const performedAt = houseIds.map(id => operaHouses.find(h => h.id === id)).filter(Boolean);
    const performedSection = page.querySelector('#performedAtSection');
    const tagsContainer = page.querySelector('#performedAt');
    if (performedAt.length > 0 && performedSection && tagsContainer) {
      performedSection.style.display = '';
      tagsContainer.innerHTML = '';
      performedAt.forEach(house => {
        const tag = document.createElement('a');
        tag.className = 'tag';
        tag.href = `#/house/${house.id}`;
        tag.textContent = `${house.name} (${house.city})`;
        tagsContainer.appendChild(tag);
      });
    }

    // Update review count heading
    const heading = page.querySelector('#reviewsHeading');
    if (heading) {
      heading.innerHTML = `${icon('note')}Reviews (${allVisits.length})`;
    }

    // Render review cards
    const reviewsContainer = page.querySelector('#operaReviews');
    reviewsContainer.innerHTML = '';
    if (allVisits.length === 0) {
      reviewsContainer.innerHTML = '<div class="empty-state">Noch keine Reviews für dieses Werk.</div>';
    } else {
      allVisits.forEach(visit => {
        reviewsContainer.appendChild(ReviewCard(visit, { showOpera: false }));
      });
    }
  }
  loadVisits();

  // Wishlist toggle
  const wishlistBtn = page.querySelector('#wishlistToggle');
  if (wishlistBtn) {
    wishlistBtn.addEventListener('click', async () => {
      const wasOn = store.isOnWishlist(opera.id);
      wishlistBtn.disabled = true;
      const ok = await runWithFeedback(
        () => wasOn ? store.removeFromWishlist(opera.id) : store.addToWishlist(opera.id),
        { failure: wasOn ? 'Konnte nicht von der Wunschliste entfernt werden'
                         : 'Konnte nicht auf die Wunschliste gesetzt werden' }
      );
      wishlistBtn.disabled = false;
      // Beschriftung nur ändern, wenn es wirklich geklappt hat
      if (!ok) return;
      wishlistBtn.className = wasOn ? 'btn btn--outline' : 'btn btn--wishlist-active';
      wishlistBtn.innerHTML = wasOn
        ? icon('star') + ' Auf die Wunschliste'
        : icon('star', { filled: true }) + ' Auf der Wunschliste';
    });
  }

  // "Schon gesehen" – für Werke von früher, ohne Besuchseintrag. Bewusst
  // neben dem Loggen und nicht statt dessen: wer Datum, Haus und Bewertung
  // weiß, soll den Abend loggen, nicht bloß ein Häkchen setzen.
  //
  // Bei einem geloggten Werk steht hier statt des Knopfes eine feste Angabe:
  // gesehen ist es dann ohnehin, und umschalten ließe sich daran nichts, ohne
  // den Besuch zu löschen. Deshalb kann seenBtn fehlen.
  const seenBtn = page.querySelector('#seenToggle');
  if (seenBtn) {
    seenBtn.addEventListener('click', async () => {
      const warMarkiert = store.isSeenOpera(opera.id);
      seenBtn.disabled = true;
      const ok = await runWithFeedback(
        () => warMarkiert ? store.unmarkSeenOpera(opera.id) : store.markSeenOpera(opera.id),
        {
          failure: warMarkiert ? 'Markierung konnte nicht entfernt werden'
                               : 'Konnte nicht als gesehen markiert werden',
          success: warMarkiert ? 'Markierung entfernt'
                               : 'Als gesehen markiert',
        }
      );
      seenBtn.disabled = false;
      // Beschriftung nur ändern, wenn es wirklich geklappt hat
      if (!ok) return;
      seenBtn.className = warMarkiert ? 'btn btn--outline' : 'btn btn--seen-active';
      seenBtn.innerHTML = warMarkiert
        ? icon('check') + ' Schon gesehen'
        : icon('checkCircle') + ' Schon gesehen';
    });
  }

  return page;
}
