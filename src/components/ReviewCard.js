// Review Card Component
import { StarRating } from './StarRating.js';
import { store } from '../store/store.js';
import { operaHouses } from '../data/operaHouses.js';
import { operas } from '../data/operas.js';
import * as sb from '../store/supabase.js';
import { isSupabaseConfigured } from '../config.js';

export function ReviewCard(visit, options = {}) {
  const { showHouse = true, showOpera = true, compact = false } = options;

  const user = store.getUser(visit.userId);
  const house = operaHouses.find(h => h.id === visit.houseId);
  const opera = operas.find(o => o.id === visit.operaId);

  const card = document.createElement('div');
  card.className = `review-card ${compact ? 'review-card--compact' : ''} fade-in`;

  const isLiked = visit.likedBy && visit.likedBy.includes('user-me');

  card.innerHTML = `
    <div class="review-card__header">
      <div class="review-card__user" data-action="profile" data-user-id="${visit.userId}">
        <div class="avatar avatar--sm" style="background: linear-gradient(135deg, #8b1a2b, #c9a84c)">${user ? user.avatar : '??'}</div>
        <div class="review-card__user-info">
          <span class="review-card__username">${user ? user.name : 'Unbekannt'}</span>
          <span class="review-card__date">${formatDate(visit.date)}</span>
        </div>
      </div>
      <div class="review-card__rating"></div>
    </div>
    ${showOpera && opera ? `
      <div class="review-card__opera" data-action="opera" data-opera-id="${opera.id}">
        <span class="review-card__opera-title">${opera.title}</span>
        <span class="review-card__opera-composer">${opera.composer}</span>
      </div>
    ` : ''}
    ${showHouse && house ? `
      <div class="review-card__house" data-action="house" data-house-id="${house.id}">
        <span class="icon-pin">📍</span> ${house.name}, ${house.city}
      </div>
    ` : ''}
    ${visit.review && !compact ? `
      <p class="review-card__text">${visit.review}</p>
    ` : ''}
    <div class="review-card__actions">
      <button class="btn-icon ${isLiked ? 'btn-icon--active' : ''}" data-action="like" data-visit-id="${visit.id}">
        <span>${isLiked ? '❤️' : '🤍'}</span>
        <span class="btn-icon__count">${visit.likes || 0}</span>
      </button>
      <button class="btn-icon" data-action="comment" data-visit-id="${visit.id}">
        <span>💬</span>
        <span class="btn-icon__count">${visit.comments ? visit.comments.length : 0}</span>
      </button>
    </div>
    ${visit.comments && visit.comments.length > 0 && !compact ? `
      <div class="review-card__comments">
        ${visit.comments.map(c => {
    const commenter = store.getUser(c.userId);
    return `
            <div class="comment">
              <span class="comment__user">${commenter ? commenter.name : 'Unbekannt'}</span>
              <span class="comment__text">${c.text}</span>
            </div>
          `;
  }).join('')}
      </div>
    ` : ''}
    <div class="review-card__comment-input" style="display:none">
      <input type="text" placeholder="Kommentar schreiben..." class="input input--sm comment-input" />
      <button class="btn btn--sm btn--accent submit-comment">Senden</button>
    </div>
  `;

  // Rating
  const ratingContainer = card.querySelector('.review-card__rating');
  ratingContainer.appendChild(StarRating(visit.rating, false, null, 'sm'));

  // Event listeners
  card.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]');
    if (!action) return;

    const actionType = action.dataset.action;

    if (actionType === 'like') {
      const btn = action;
      const visitId = action.dataset.visitId;

      if (isSupabaseConfigured() && store.isCloud) {
        // Optimistic UI update
        const wasLiked = btn.classList.contains('btn-icon--active');
        btn.classList.toggle('btn-icon--active');
        btn.querySelector('span:first-child').textContent = wasLiked ? '🤍' : '❤️';
        const countEl = btn.querySelector('.btn-icon__count');
        countEl.textContent = Math.max(0, parseInt(countEl.textContent) + (wasLiked ? -1 : 1));
        sb.toggleLike('visit', visitId).catch(e => console.warn('Like failed:', e));
      } else {
        store.toggleLikeVisit(visitId);
        const isNowLiked = visit.likedBy && visit.likedBy.includes('user-me');
        btn.querySelector('span:first-child').textContent = isNowLiked ? '❤️' : '🤍';
        btn.querySelector('.btn-icon__count').textContent = visit.likes || 0;
        btn.classList.toggle('btn-icon--active', isNowLiked);
      }
    }

    if (actionType === 'comment') {
      const input = card.querySelector('.review-card__comment-input');
      input.style.display = input.style.display === 'none' ? 'flex' : 'none';
      if (input.style.display === 'flex') {
        input.querySelector('input').focus();
      }
    }

    if (actionType === 'profile') {
      window.location.hash = `#/profile/${action.dataset.userId}`;
    }

    if (actionType === 'opera') {
      window.location.hash = `#/opera/${action.dataset.operaId}`;
    }

    if (actionType === 'house') {
      window.location.hash = `#/house/${action.dataset.houseId}`;
    }
  });

  // Comment submit
  const submitBtn = card.querySelector('.submit-comment');
  if (submitBtn) {
    submitBtn.addEventListener('click', () => {
      const input = card.querySelector('.comment-input');
      if (input.value.trim()) {
        store.addComment(visit.id, input.value.trim());
        input.value = '';
        card.querySelector('.review-card__comment-input').style.display = 'none';
        // Show new comment
        const commentsDiv = card.querySelector('.review-card__comments') || document.createElement('div');
        commentsDiv.className = 'review-card__comments';
        const user = store.getCurrentUser();
        commentsDiv.innerHTML += `
          <div class="comment fade-in">
            <span class="comment__user">${user.name}</span>
            <span class="comment__text">${store.getUser('user-me').name}: gerade kommentiert</span>
          </div>
        `;
        if (!card.querySelector('.review-card__comments')) {
          card.querySelector('.review-card__actions').after(commentsDiv);
        }
        // Update count
        const countEl = card.querySelector('[data-action="comment"] .btn-icon__count');
        countEl.textContent = parseInt(countEl.textContent) + 1;
      }
    });

    const commentInput = card.querySelector('.comment-input');
    if (commentInput) {
      commentInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submitBtn.click();
      });
    }
  }

  return card;
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const months = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  return `${date.getDate()}. ${months[date.getMonth()]} ${date.getFullYear()}`;
}
