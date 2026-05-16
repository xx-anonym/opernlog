// House Detail Page
import { operaHouses } from '../data/operaHouses.js';
import { operas } from '../data/operas.js';
import { store } from '../store/store.js';
import { ReviewCard } from '../components/ReviewCard.js';
import { StarRating } from '../components/StarRating.js';
import { RatingsHistogram } from '../components/RatingsHistogram.js';
import { isSupabaseConfigured } from '../config.js';

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

  const heroBackground = house.imageUrl
    ? `linear-gradient(to bottom, rgba(20, 24, 28, 0.3), #14181c), url('${house.imageUrl}')`
    : `linear-gradient(135deg, ${house.color}, #14181c)`;

  page.innerHTML = `
    <div class="detail-hero" style="background: ${heroBackground}; background-size: cover; background-position: center;">
      <a href="javascript:void(0)" class="back-link" onclick="history.back()">← Zurück</a>
      <div class="detail-hero__content">
        <h1 class="detail-hero__title">${house.name}</h1>
        <div class="detail-hero__meta">
          <span>📍 ${house.city}, ${house.state}</span>
          <span>🎭 ${house.capacity} Plätze</span>
          <span>📅 Gegründet ${house.founded}</span>
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
      
      <div class="detail-section" id="performedOperasSection" style="display:none">
        <h2 class="section__title">🎵 Aufgeführte Werke</h2>
        <div class="tag-list" id="performedOperas"></div>
      </div>
      
      <div class="detail-section">
        <h2 class="section__title" id="reviewsHeading">📝 Reviews</h2>
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
        allVisits = cloudData.map(v => ({
          id: v.id,
          userId: v.user_id,
          houseId: v.house_id,
          operaId: v.opera_id,
          date: v.date,
          rating: v.rating,
          review: v.review || '',
          likes: v.likes || 0,
          comments: v.comments || [],
          likedBy: v.liked_by || [],
          user: v.profiles ? {
            id: v.profiles.id,
            name: v.profiles.username,
            avatar: v.profiles.avatar_initials,
            avatarIcon: v.profiles.avatar_icon
          } : null
        }));
      } else {
        allVisits = [...store.getVisitsByHouse(house.id)];
      }
    } catch (e) {
      console.warn('Failed to load cloud visits for house', e);
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

    // Update "Aufgeführte Werke" section
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
      heading.textContent = `📝 Reviews (${allVisits.length})`;
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
  loadVisits();

  return page;
}
