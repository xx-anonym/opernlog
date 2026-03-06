// List Detail Page – shows all items of a list
import { store } from '../store/store.js';
import { operas } from '../data/operas.js';
import { operaHouses } from '../data/operaHouses.js';
import * as sb from '../store/supabase.js';
import { isSupabaseConfigured } from '../config.js';

export function ListDetailPage(listId) {
  const page = document.createElement('div');
  page.className = 'page page--list-detail fade-in';

  async function render() {
    // Try local first, then cloud
    const allLists = store.getMyLists();
    let list = allLists.find(l => l.id === listId);

    if (!list && isSupabaseConfigured()) {
      page.innerHTML = '<div class="loading-spinner"><div class="spinner"></div> Lade Liste...</div>';
      try {
        list = await sb.getListByIdCloud(listId);
      } catch (e) {
        console.warn('Cloud list load failed:', e);
      }
    }

    if (!list) {
      page.innerHTML = `
        <div class="empty-state">
          <p>Liste nicht gefunden.</p>
          <a href="#/lists" class="btn btn--primary">← Zurück zu Listen</a>
        </div>
      `;
      return;
    }

    // Resolve items based on type
    const isOpera = list.type === 'operas' || list.type === 'wishlist';
    const items = isOpera
      ? list.items.map(id => operas.find(o => o.id === id)).filter(Boolean)
      : list.items.map(id => operaHouses.find(h => h.id === id)).filter(Boolean);

    const isWishlist = list.type === 'wishlist';
    const isOwner = list.userId === 'user-me' || list.user_id === store._profile?.id;

    const isLiked = list.liked_by && list.liked_by.includes('user-me');

    page.innerHTML = `
      <div class="page-header">
        <a href="javascript:void(0)" class="back-link" onclick="history.back()">← Zurück</a>
        <h1 class="page-header__title">${isWishlist ? '🌟' : '📋'} ${list.name}</h1>
        ${list.description ? `<p class="page-header__subtitle">${list.description}</p>` : ''}
        <div style="display: flex; align-items: center; gap: 1rem; margin-top: 0.5rem">
          <p class="list-detail-count" style="margin: 0">${items.length} ${items.length === 1 ? 'Eintrag' : 'Einträge'}</p>
          ${!isWishlist ? `
            <button class="btn-icon ${isLiked ? 'btn-icon--active' : ''}" id="listLikeBtn">
              <span>${isLiked ? '❤️' : '🤍'}</span>
              <span class="btn-icon__count" id="listLikeCount">${list.likes || 0}</span>
            </button>
          ` : ''}
        </div>
      </div>
      <div id="listDetailContent"></div>
    `;

    const likeBtn = page.querySelector('#listLikeBtn');
    if (likeBtn) {
      likeBtn.addEventListener('click', async () => {
        if (!store.isCloud || !isSupabaseConfigured()) {
          alert('Likes für Listen erfordern Cloud-Sync.');
          return;
        }

        const countSpan = page.querySelector('#listLikeCount');
        const iconSpan = likeBtn.querySelector('span:first-child');
        const currentlyLiked = likeBtn.classList.contains('btn-icon--active');
        const change = currentlyLiked ? -1 : 1;

        const dbLikeAction = sb.toggleLike('list', list.id);

        likeBtn.classList.toggle('btn-icon--active');
        iconSpan.textContent = currentlyLiked ? '🤍' : '❤️';
        countSpan.textContent = parseInt(countSpan.textContent) + change;

        await dbLikeAction; // Await sync operation without blocking UI
      });
    }

    const content = page.querySelector('#listDetailContent');

    if (items.length === 0) {
      content.innerHTML = `
        <div class="empty-state">
          <p>Diese Liste ist noch leer.</p>
          ${isWishlist && isOwner
          ? '<p class="text-muted">Stöbere durch die <a href="#/operas" class="link">Opern</a> und füge Werke hinzu!</p>'
          : ''}
        </div>
      `;
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'list-detail-grid';

    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'list-detail-card';

      if (isOpera) {
        const composerColors = {
          'Wolfgang Amadeus Mozart': '#c9a84c',
          'Giuseppe Verdi': '#2d7d46',
          'Richard Wagner': '#7d2d2d',
          'Giacomo Puccini': '#2d5a7d',
          'Richard Strauss': '#7d5a2d',
        };
        const color = composerColors[item.composer] || '#8b1a2b';

        card.innerHTML = `
          <div class="list-detail-card__image" style="${item.image ? `background-image: linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(20,24,28,0.85)), url('${item.image}'); background-size: cover; background-position: center;` : `background: linear-gradient(135deg, ${color}, #14181c);`}">
            ${isWishlist && isOwner ? `<button class="list-detail-card__remove" title="Entfernen">✕</button>` : ''}
          </div>
          <div class="list-detail-card__body">
            <h3 class="list-detail-card__title">${item.title}</h3>
            <p class="list-detail-card__subtitle">🎼 ${item.composer}</p>
            <div class="list-detail-card__meta">
              <span>${item.genre || ''}</span>
              <span>${item.yearComposed || ''}</span>
              <span>${item.language || ''}</span>
            </div>
            <div class="list-detail-card__actions">
              <a href="#/opera/${item.id}" class="btn btn--outline btn--sm">Details</a>
              ${isWishlist && isOwner ? `<a href="#/log?opera=${item.id}" class="btn btn--primary btn--sm">+ Loggen</a>` : ''}
            </div>
          </div>
        `;

        if (isWishlist && isOwner) {
          const removeBtn = card.querySelector('.list-detail-card__remove');
          if (removeBtn) {
            removeBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              store.removeFromWishlist(item.id);
              render();
            });
          }
        }
      } else {
        // Opera house
        card.innerHTML = `
          <div class="list-detail-card__image" style="${item.image ? `background-image: linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(20,24,28,0.85)), url('${item.image}'); background-size: cover; background-position: center;` : `background: linear-gradient(135deg, #8b1a2b, #14181c);`}">
          </div>
          <div class="list-detail-card__body">
            <h3 class="list-detail-card__title">${item.name}</h3>
            <p class="list-detail-card__subtitle">📍 ${item.city}, ${item.country}</p>
            ${item.capacity ? `<div class="list-detail-card__meta"><span>🪑 ${item.capacity} Plätze</span><span>📅 ${item.yearBuilt || ''}</span></div>` : ''}
            <div class="list-detail-card__actions">
              <a href="#/house/${item.id}" class="btn btn--outline btn--sm">Details</a>
            </div>
          </div>
        `;
      }

      grid.appendChild(card);
    });

    content.appendChild(grid);

    // Comments Section (if not wishlist)
    if (!isWishlist) {
      const commentsDiv = document.createElement('div');
      commentsDiv.className = 'list-detail-comments';
      commentsDiv.style.marginTop = '3rem';

      const commentsHtml = (list.comments || []).map(c => {
        let commenter = store.getUser(c.userId);
        if (!commenter && c.user) commenter = c.user;
        return `
          <div class="comment">
            <span class="comment__user">${commenter ? commenter.name : 'Unbekannt'}</span>
            <span class="comment__text">${c.text}</span>
          </div>
        `;
      }).join('');

      commentsDiv.innerHTML = `
        <h3 style="margin-bottom: 1rem;">Kommentare (${list.comments ? list.comments.length : 0})</h3>
        <div class="comments-list" style="margin-bottom: 1.5rem;">
          ${commentsHtml || '<p class="text-muted">Noch keine Kommentare. Schreibe den ersten!</p>'}
        </div>
        <div class="comment-input-area" style="display: flex; gap: 0.5rem;">
          <input type="text" class="input input--sm" id="newCommentText" placeholder="Kommentar schreiben..." style="flex: 1;" />
          <button class="btn btn--sm btn--accent" id="submitCommentBtn">Senden</button>
        </div>
      `;

      content.appendChild(commentsDiv);

      const submitBtn = commentsDiv.querySelector('#submitCommentBtn');
      const input = commentsDiv.querySelector('#newCommentText');

      submitBtn.addEventListener('click', async () => {
        const text = input.value.trim();
        if (!text) return;

        if (!isSupabaseConfigured()) {
          alert('Kommentare erfordern Cloud-Sync.');
          return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = '...';

        try {
          await sb.addCommentCloud(list.id, text);
          store.addComment(list.id, text);
          render(); // Re-render to show new comment
        } catch (e) {
          console.error('Comment failed:', e);
          alert('Kommentar schreiben fehlgeschlagen.');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Senden';
        }
      });

      input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') submitBtn.click();
      });
    }
  }

  setTimeout(() => render(), 0);
  return page;
}
