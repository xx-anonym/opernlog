// House Detail Page
import { operaHouses } from '../data/operaHouses.js';
import { operas } from '../data/operas.js';
import { store } from '../store/store.js';
import { ReviewCard } from '../components/ReviewCard.js';
import { StarRating } from '../components/StarRating.js';
import { RatingsHistogram } from '../components/RatingsHistogram.js';

export function HouseDetailPage(houseId) {
  const house = operaHouses.find(h => h.id === houseId);
  if (!house) {
    const page = document.createElement('div');
    page.className = 'page';
    page.innerHTML = '<div class="empty-state">Opernhaus nicht gefunden.</div>';
    return page;
  }

  const page = document.createElement('div');
  page.className = 'page page--house-detail';

  const avgRating = store.getAverageRatingForHouse(house.id);
  const visits = store.getVisitsByHouse(house.id);

  // Unique operas performed
  const operaIds = [...new Set(visits.map(v => v.operaId))];
  const performedOperas = operaIds.map(id => operas.find(o => o.id === id)).filter(Boolean);

  page.innerHTML = `
    <div class="detail-hero" style="background: linear-gradient(135deg, ${house.color}, #14181c)">
      <a href="#/houses" class="back-link">← Alle Opernhäuser</a>
      <div class="detail-hero__content">
        <h1 class="detail-hero__title">${house.name}</h1>
        <div class="detail-hero__meta">
          <span>📍 ${house.city}, ${house.state}</span>
          <span>🎭 ${house.capacity} Plätze</span>
          <span>📅 Gegründet ${house.founded}</span>
        </div>
        <div class="detail-hero__rating" id="houseRating"></div>
      </div>
    </div>
    
    <div class="detail-body">
      <div class="detail-section">
        <div id="houseHistogram" class="detail-histogram"></div>
        <p class="detail-description">${house.description}</p>
        <a href="#/log?house=${house.id}" class="btn btn--primary">+ Besuch hier loggen</a>
      </div>
      
      ${performedOperas.length > 0 ? `
        <div class="detail-section">
          <h2 class="section__title">🎵 Aufgeführte Werke</h2>
          <div class="tag-list" id="performedOperas"></div>
        </div>
      ` : ''}
      
      <div class="detail-section">
        <h2 class="section__title">📝 Reviews (${visits.length})</h2>
        <div class="feed-list" id="houseReviews"></div>
      </div>
    </div>
  `;

  // Rating
  const ratingEl = page.querySelector('#houseRating');
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
  const histogramEl = page.querySelector('#houseHistogram');
  const houseRatings = visits.filter(v => v.rating).map(v => parseFloat(v.rating));
  if (houseRatings.length > 0) {
    histogramEl.appendChild(RatingsHistogram(houseRatings, {
      accentColor: house.color || '#8b1a2b'
    }));
  }

  // Performed operas tags
  const tagsContainer = page.querySelector('#performedOperas');
  if (tagsContainer) {
    performedOperas.forEach(opera => {
      const tag = document.createElement('a');
      tag.className = 'tag';
      tag.href = `#/opera/${opera.id}`;
      tag.textContent = opera.title;
      tagsContainer.appendChild(tag);
    });
  }

  // Reviews
  const reviewsContainer = page.querySelector('#houseReviews');
  if (visits.length === 0) {
    reviewsContainer.innerHTML = '<div class="empty-state">Noch keine Reviews. Sei der Erste!</div>';
  } else {
    visits.forEach(visit => {
      reviewsContainer.appendChild(ReviewCard(visit, { showHouse: false }));
    });
  }

  return page;
}
