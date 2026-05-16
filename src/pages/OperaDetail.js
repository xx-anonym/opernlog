// Opera Detail Page
import { operas } from '../data/operas.js';
import { operaHouses } from '../data/operaHouses.js';
import { store } from '../store/store.js';
import { ReviewCard } from '../components/ReviewCard.js';
import { StarRating } from '../components/StarRating.js';
import { RatingsHistogram } from '../components/RatingsHistogram.js';
import { isSupabaseConfigured } from '../config.js';

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
    <div class="detail-hero" style="${opera.image ? `background-image: linear-gradient(to bottom, rgba(0,0,0,0.25), rgba(20,24,28,0.95)), url('${opera.image}'); background-size: cover; background-position: center;` : `background: linear-gradient(135deg, ${color}, #14181c)`}">
      <a href="javascript:void(0)" class="back-link" onclick="history.back()">← Zurück</a>
      <div class="detail-hero__content">
        <h1 class="detail-hero__title">${opera.title}</h1>
        <div class="detail-hero__meta">
          <span>🎼 ${opera.composer}</span>
          <span>📅 ${opera.yearComposed}</span>
          <span>🌐 ${opera.language}</span>
          <span>🎭 ${opera.acts} ${opera.acts === 1 ? 'Akt' : 'Akte'}</span>
          <span>📖 ${opera.genre}</span>
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
            ${store.isOnWishlist(opera.id) ? '✅ Auf der Wunschliste' : '⭐ Auf die Wunschliste'}
          </button>
        </div>
      </div>
      
      <div class="detail-section" id="performedAtSection" style="display:none">
        <h2 class="section__title">🏛️ Aufgeführt in</h2>
        <div class="tag-list" id="performedAt"></div>
      </div>
      
      <div class="detail-section">
        <h2 class="section__title" id="reviewsHeading">📝 Reviews</h2>
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
        allVisits = [...store.getVisitsByOpera(opera.id)];
      }
    } catch (e) {
      console.warn('Failed to load cloud visits for opera', e);
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
      heading.textContent = `📝 Reviews (${allVisits.length})`;
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
