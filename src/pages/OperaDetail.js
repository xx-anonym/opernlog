// Opera Detail Page
import { operas } from '../data/operas.js';
import { operaHouses } from '../data/operaHouses.js';
import { store } from '../store/store.js';
import { ReviewCard } from '../components/ReviewCard.js';
import { StarRating } from '../components/StarRating.js';
import { RatingsHistogram } from '../components/RatingsHistogram.js';

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

  const avgRating = store.getAverageRatingForOpera(opera.id);
  const visits = store.getVisitsByOpera(opera.id);

  const composerColors = {
    'Wolfgang Amadeus Mozart': '#c9a84c',
    'Giuseppe Verdi': '#2d7d46',
    'Richard Wagner': '#7d2d2d',
    'Giacomo Puccini': '#2d5a7d',
    'Richard Strauss': '#7d5a2d',
  };
  const color = composerColors[opera.composer] || '#8b1a2b';

  // Houses where it was performed
  const houseIds = [...new Set(visits.map(v => v.houseId))];
  const performedAt = houseIds.map(id => operaHouses.find(h => h.id === id)).filter(Boolean);

  page.innerHTML = `
    <div class="detail-hero" style="${opera.image ? `background-image: linear-gradient(to bottom, rgba(0,0,0,0.25), rgba(20,24,28,0.95)), url('${opera.image}'); background-size: cover; background-position: center;` : `background: linear-gradient(135deg, ${color}, #14181c)`}">
      <a href="#/operas" class="back-link">← Alle Opern</a>
      <div class="detail-hero__content">
        <h1 class="detail-hero__title">${opera.title}</h1>
        <div class="detail-hero__meta">
          <span>🎼 ${opera.composer}</span>
          <span>📅 ${opera.yearComposed}</span>
          <span>🌐 ${opera.language}</span>
          <span>🎭 ${opera.acts} ${opera.acts === 1 ? 'Akt' : 'Akte'}</span>
          <span>📖 ${opera.genre}</span>
        </div>
        <div class="detail-hero__rating" id="operaRating"></div>
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
            ${store.isOnWishlist(opera.id) ? '✅ Auf der Wunschliste' : '⭐ Auf die Wunschliste'}
          </button>
        </div>
      </div>
      
      ${performedAt.length > 0 ? `
        <div class="detail-section">
          <h2 class="section__title">🏛️ Aufgeführt in</h2>
          <div class="tag-list" id="performedAt"></div>
        </div>
      ` : ''}
      
      <div class="detail-section">
        <h2 class="section__title">📝 Reviews (${visits.length})</h2>
        <div class="feed-list" id="operaReviews"></div>
      </div>
    </div>
  `;

  // Rating display
  const ratingEl = page.querySelector('#operaRating');
  if (avgRating) {
    ratingEl.appendChild(StarRating(avgRating, false, null, 'lg'));
    const countEl = document.createElement('span');
    countEl.className = 'detail-hero__rating-count';
    countEl.textContent = `${visits.length} ${visits.length === 1 ? 'Bewertung' : 'Bewertungen'}`;
    ratingEl.appendChild(countEl);
  } else {
    ratingEl.innerHTML = '<span class="text-muted">Noch keine Bewertungen</span>';
  }

  // Ratings histogram
  const histogramEl = page.querySelector('#operaHistogram');
  const operaRatings = visits.filter(v => v.rating).map(v => parseFloat(v.rating));
  if (operaRatings.length > 0) {
    histogramEl.appendChild(RatingsHistogram(operaRatings, {
      accentColor: color
    }));
  }

  // Performed at tags
  const tagsContainer = page.querySelector('#performedAt');
  if (tagsContainer) {
    performedAt.forEach(house => {
      const tag = document.createElement('a');
      tag.className = 'tag';
      tag.href = `#/house/${house.id}`;
      tag.textContent = `${house.name} (${house.city})`;
      tagsContainer.appendChild(tag);
    });
  }

  // Reviews
  const reviewsContainer = page.querySelector('#operaReviews');
  if (visits.length === 0) {
    reviewsContainer.innerHTML = '<div class="empty-state">Noch keine Reviews für dieses Werk.</div>';
  } else {
    visits.forEach(visit => {
      reviewsContainer.appendChild(ReviewCard(visit, { showOpera: false }));
    });
  }

  // Wishlist toggle
  const wishlistBtn = page.querySelector('#wishlistToggle');
  if (wishlistBtn) {
    wishlistBtn.addEventListener('click', () => {
      if (store.isOnWishlist(opera.id)) {
        store.removeFromWishlist(opera.id);
        wishlistBtn.className = 'btn btn--outline';
        wishlistBtn.textContent = '⭐ Auf die Wunschliste';
      } else {
        store.addToWishlist(opera.id);
        wishlistBtn.className = 'btn btn--wishlist-active';
        wishlistBtn.textContent = '✅ Auf der Wunschliste';
      }
    });
  }

  return page;
}
