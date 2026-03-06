// Profile Page – Hybrid (local + cloud)
import { store } from '../store/store.js';
import { ReviewCard } from '../components/ReviewCard.js';
import { RatingsHistogram } from '../components/RatingsHistogram.js';
import * as sb from '../store/supabase.js';
import { operaHouses } from '../data/operaHouses.js';
import { operas } from '../data/operas.js';
import { profileIcons, renderAvatarHTML } from '../data/profileIcons.js';

export function ProfilePage(userId) {
  const page = document.createElement('div');
  page.className = 'page page--profile';

  const isMe = userId === 'user-me' || userId === store._profile?.id;

  if (store.isCloud && !isMe) {
    // Cloud mode: load remote profile
    renderCloudProfile(page, userId);
  } else {
    // Local mode or own profile
    renderLocalProfile(page, userId, isMe);
  }

  return page;
}

async function renderCloudProfile(page, userId) {
  page.innerHTML = '<div class="loading-spinner"><div class="spinner"></div> Lade Profil...</div>';

  try {
    const profile = await sb.getProfile(userId);
    if (!profile) {
      page.innerHTML = '<div class="empty-state">Benutzer nicht gefunden.</div>';
      return;
    }

    const stats = await sb.getUserStatsCloud(userId);
    const visits = await sb.getUserVisitsCloud(userId);
    const following = await sb.isFollowing(userId);
    const userLists = await sb.getUserListsCloud(userId);

    const user = {
      id: profile.id,
      name: profile.username,
      avatar: profile.avatar_initials,
      avatarIcon: profile.avatar_icon || '',
      bio: profile.bio || '',
      joined: profile.created_at?.split('T')[0] || '',
    };

    // Separate wishlist from other lists
    const wishlist = userLists.find(l => l.type === 'wishlist');
    const regularLists = userLists.filter(l => l.type !== 'wishlist');

    page.innerHTML = `
      <div class="profile-hero">
        <div class="profile-hero__avatar" style="background: linear-gradient(135deg, #8b1a2b, #c9a84c)">
          ${renderAvatarHTML(user.avatar, user.avatarIcon)}
        </div>
        <div class="profile-hero__info">
          <h1 class="profile-hero__name">${user.name}</h1>
          <p class="profile-hero__bio">${user.bio}</p>
          <span class="profile-hero__joined">Dabei seit ${formatJoinDate(user.joined)}</span>
          <button class="btn ${following ? 'btn--outline' : 'btn--primary'} btn--sm" id="followBtn">
            ${following ? '✓ Folgst du' : '+ Folgen'}
          </button>
        </div>
      </div>
      
      <div class="profile-stats">
        <div class="stat-card">
          <span class="stat-card__number">${stats.totalVisits || 0}</span>
          <span class="stat-card__label">Besuche</span>
        </div>
        <div class="stat-card">
          <span class="stat-card__number">${stats.averageRating ? stats.averageRating.toFixed(1) : '0'}</span>
          <span class="stat-card__label">Ø Bewertung</span>
        </div>
        <div class="stat-card">
          <span class="stat-card__number">${stats.uniqueHouses || 0}</span>
          <span class="stat-card__label">Häuser besucht</span>
        </div>
        <div class="stat-card">
          <span class="stat-card__number">${stats.uniqueOperas || 0}</span>
          <span class="stat-card__label">Werke gesehen</span>
        </div>
      </div>
      
      <div id="cloudHistogram" class="profile-histogram"></div>

      ${wishlist && wishlist.items.length > 0 ? `
        <h2 class="section-title">🌟 Wunschliste</h2>
        <div id="cloudWishlist" class="lists-grid"></div>
      ` : ''}

      ${regularLists.length > 0 ? `
        <h2 class="section-title">📋 Listen</h2>
        <div id="cloudLists" class="lists-grid"></div>
      ` : ''}
      
      <h2 class="section-title">Besuche von ${user.name}</h2>
      <div id="cloudVisits"></div>
    `;

    // Follow button
    page.querySelector('#followBtn').addEventListener('click', async () => {
      const btn = page.querySelector('#followBtn');
      const nowFollowing = btn.textContent.includes('Folgst');
      if (nowFollowing) {
        await sb.unfollow(userId);
        btn.textContent = '+ Folgen';
        btn.className = 'btn btn--primary btn--sm';
      } else {
        await sb.follow(userId);
        btn.textContent = '✓ Folgst du';
        btn.className = 'btn btn--outline btn--sm';
      }
    });

    // Render ratings histogram
    const histogramContainer = page.querySelector('#cloudHistogram');
    const cloudRatings = visits.filter(v => v.rating).map(v => parseFloat(v.rating));
    if (cloudRatings.length > 0) {
      histogramContainer.appendChild(RatingsHistogram(cloudRatings));
    }

    // Render wishlist items
    if (wishlist && wishlist.items.length > 0) {
      const wlContainer = page.querySelector('#cloudWishlist');
      const wishlistItems = wishlist.items.map(id => operas.find(o => o.id === id)).filter(Boolean);
      wishlistItems.forEach(opera => {
        const card = document.createElement('div');
        card.className = 'list-card fade-in';
        card.style.cursor = 'pointer';
        card.innerHTML = `
          <h3 class="list-card__name">${opera.title}</h3>
          <p class="list-card__desc">🎼 ${opera.composer}</p>
          <div class="list-card__meta"><span>${opera.genre || ''}</span></div>
        `;
        card.addEventListener('click', () => window.location.hash = `#/opera/${opera.id}`);
        wlContainer.appendChild(card);
      });
    }

    // Render regular lists
    if (regularLists.length > 0) {
      const listsContainer = page.querySelector('#cloudLists');
      regularLists.forEach(list => {
        const isOpera = list.type === 'operas';
        const items = isOpera
          ? list.items.map(id => operas.find(o => o.id === id)).filter(Boolean)
          : list.items.map(id => operaHouses.find(h => h.id === id)).filter(Boolean);

        const card = document.createElement('div');
        card.className = 'list-card fade-in';
        card.style.cursor = 'pointer';
        card.innerHTML = `
          <h3 class="list-card__name">${list.name}</h3>
          <p class="list-card__desc">${list.description || ''}</p>
          <div class="list-card__items">
            ${items.slice(0, 5).map(item => `<span class="list-card__item">${item.title || item.name}</span>`).join('')}
            ${items.length > 5 ? `<span class="list-card__more">+${items.length - 5} weitere</span>` : ''}
          </div>
          <div class="list-card__meta"><span>${list.items.length} Einträge</span></div>
        `;
        card.addEventListener('click', () => window.location.hash = `#/list/${list.id}`);
        listsContainer.appendChild(card);
      });
    }

    // Render visits
    const visitsContainer = page.querySelector('#cloudVisits');
    if (visits.length === 0) {
      visitsContainer.innerHTML = '<div class="empty-state">Noch keine Besuche geloggt.</div>';
    } else {
      const feedList = document.createElement('div');
      feedList.className = 'feed-list';

      visits.forEach(item => {
        const house = operaHouses.find(h => h.id === item.house_id);
        const opera = operas.find(o => o.id === item.opera_id);

        const card = document.createElement('div');
        card.className = 'feed-card fade-in';
        card.innerHTML = `
          <div class="feed-card__body">
            <h3>${opera?.title || item.opera_id}</h3>
            <p class="text-muted">${house?.name || item.house_id}, ${house?.city || ''}</p>
            <div class="feed-card__rating">${'★'.repeat(Math.round(item.rating))}${'☆'.repeat(5 - Math.round(item.rating))} ${parseFloat(item.rating).toFixed(1)}</div>
            <p class="text-muted">${new Date(item.date).toLocaleDateString('de-DE')}</p>
            ${item.review ? `<p class="feed-card__review">${item.review}</p>` : ''}
          </div>
        `;
        feedList.appendChild(card);
      });

      visitsContainer.appendChild(feedList);
    }
  } catch (err) {
    page.innerHTML = `<div class="empty-state">Fehler beim Laden: ${err.message}</div>`;
  }
}

function renderLocalProfile(page, userId, isMe) {
  const user = store.getCurrentUser();

  if (!user) {
    page.innerHTML = '<div class="empty-state">Benutzer nicht gefunden.</div>';
    return;
  }

  const stats = store.getStats(userId);
  const visits = store.getVisitsByUser(userId);
  const lists = store.getListsByUser(userId);
  const isFollowing = !isMe && store.isFollowing(userId);

  page.innerHTML = `
    <div class="profile-hero">
      <div class="profile-hero__avatar" style="background: linear-gradient(135deg, #8b1a2b, #c9a84c)">
        ${renderAvatarHTML(user.avatar, user.avatarIcon)}
      </div>
      <div class="profile-hero__info">
        <h1 class="profile-hero__name">${user.name}</h1>
        <p class="profile-hero__bio">${user.bio || ''}</p>
        <span class="profile-hero__joined">Dabei seit ${formatJoinDate(user.joined)}</span>
        ${!isMe ? `
          <button class="btn ${isFollowing ? 'btn--outline' : 'btn--primary'} btn--sm" id="followBtn">
            ${isFollowing ? '✓ Folgst du' : '+ Folgen'}
          </button>
        ` : `
          <div class="profile-actions">
            <button class="btn btn--outline btn--sm" id="editProfileBtn">✏️ Profil bearbeiten</button>
            ${store.isConfigured ? `<button class="btn btn--ghost btn--sm" id="logoutBtn">🚪 Abmelden</button>` : ''}
          </div>
        `}
      </div>
    </div>
    
    <div class="profile-stats">
      <div class="stat-card">
        <span class="stat-card__number">${stats.totalVisits}</span>
        <span class="stat-card__label">Besuche</span>
      </div>
      <div class="stat-card">
        <span class="stat-card__number">${stats.avgRating}</span>
        <span class="stat-card__label">Ø Bewertung</span>
      </div>
      <div class="stat-card">
        <span class="stat-card__number">${stats.uniqueHouses}</span>
        <span class="stat-card__label">Häuser besucht</span>
      </div>
      <div class="stat-card">
        <span class="stat-card__number">${stats.uniqueOperas}</span>
        <span class="stat-card__label">Werke gesehen</span>
      </div>
    </div>
    
    <div id="profileHistogram" class="profile-histogram"></div>
    
    ${stats.topComposer !== '-' ? `
    <div class="profile-favorites">
      <div class="favorite-item">
        <span class="favorite-item__label">Lieblingskomponist</span>
        <span class="favorite-item__value">${stats.topComposer}</span>
      </div>
      <div class="favorite-item">
        <span class="favorite-item__label">Meistbesuchtes Haus</span>
        <span class="favorite-item__value">${stats.topHouse}</span>
      </div>
    </div>
    ` : ''}
    
    <div class="profile-tabs">
      <button class="tab tab--active" data-tab="reviews">Reviews (${visits.length})</button>
      <button class="tab" data-tab="lists">Listen (${lists.length})</button>
    </div>
    
    <div class="profile-tab-content" id="tabContent"></div>
    
    ${isMe ? `
    <div id="editProfileModal" class="modal" style="display:none">
      <div class="modal__overlay"></div>
      <div class="modal__content">
        <h2 class="modal__title">Profil bearbeiten</h2>
        <div class="form-group">
          <label class="form-label">Name</label>
          <input type="text" class="input" id="editName" value="${user.name}" />
        </div>
        <div class="form-group">
          <label class="form-label">Bio</label>
          <textarea class="input textarea" id="editBio" rows="3">${user.bio || ''}</textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Initialen (Avatar)</label>
          <input type="text" class="input" id="editAvatar" value="${user.avatar}" maxlength="2" />
        </div>
        <div class="form-group">
          <label class="form-label">Profilbild</label>
          <div class="icon-picker" id="iconPicker">
            <button type="button" class="icon-picker__option icon-picker__option--none${!user.avatarIcon ? ' icon-picker__option--active' : ''}" data-icon="" title="Kein Icon">✕</button>
            ${Object.entries(profileIcons).map(([key, icon]) => `
              <button type="button" class="icon-picker__option${user.avatarIcon === key ? ' icon-picker__option--active' : ''}" data-icon="${key}" title="${icon.label}">
                ${icon.svg}
              </button>
            `).join('')}
          </div>
        </div>
        <div class="form-actions">
          <button class="btn btn--primary" id="saveProfileBtn">Speichern</button>
          <button class="btn btn--outline" id="closeModalBtn">Abbrechen</button>
        </div>
      </div>
    </div>
    ` : ''}
  `;

  // Tab switching
  let activeTab = 'reviews';
  const tabs = page.querySelectorAll('.tab');

  function renderTab() {
    const content = page.querySelector('#tabContent');
    content.innerHTML = '';
    tabs.forEach(t => t.classList.toggle('tab--active', t.dataset.tab === activeTab));

    if (activeTab === 'reviews') {
      if (visits.length === 0) {
        content.innerHTML = `<div class="empty-state">${isMe ? 'Du hast noch keine Besuche geloggt.' : 'Noch keine Besuche.'}</div>`;
      } else {
        const list = document.createElement('div');
        list.className = 'feed-list';
        visits.forEach(visit => {
          list.appendChild(ReviewCard(visit, { compact: false }));
        });
        content.appendChild(list);
      }
    } else if (activeTab === 'lists') {
      if (lists.length === 0) {
        content.innerHTML = `<div class="empty-state">${isMe ? 'Du hast noch keine Listen erstellt.' : 'Noch keine Listen.'}</div>`;
      } else {
        const listGrid = document.createElement('div');
        listGrid.className = 'lists-grid';
        lists.forEach(list => {
          const card = document.createElement('div');
          card.className = 'list-card fade-in';
          card.innerHTML = `
            <h3 class="list-card__name">${list.name}</h3>
            <p class="list-card__desc">${list.description || ''}</p>
            <div class="list-card__meta">
              <span>${list.items.length} Einträge</span>
              <span>❤️ ${list.likes || 0}</span>
            </div>
          `;
          card.addEventListener('click', () => window.location.hash = `#/list/${list.id}`);
          listGrid.appendChild(card);
        });
        content.appendChild(listGrid);
      }
    }
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      activeTab = tab.dataset.tab;
      renderTab();
    });
  });

  // Follow button
  const followBtn = page.querySelector('#followBtn');
  if (followBtn) {
    followBtn.addEventListener('click', () => {
      store.toggleFollow(userId);
      const nowFollowing = store.isFollowing(userId);
      followBtn.textContent = nowFollowing ? '✓ Folgst du' : '+ Folgen';
      followBtn.className = `btn ${nowFollowing ? 'btn--outline' : 'btn--primary'} btn--sm`;
    });
  }

  // Edit profile modal
  const editBtn = page.querySelector('#editProfileBtn');
  if (editBtn) {
    const modal = page.querySelector('#editProfileModal');
    editBtn.addEventListener('click', () => { modal.style.display = 'flex'; });
    page.querySelector('#closeModalBtn').addEventListener('click', () => { modal.style.display = 'none'; });
    page.querySelector('.modal__overlay').addEventListener('click', () => { modal.style.display = 'none'; });

    // Icon picker click handling
    const iconPicker = page.querySelector('#iconPicker');
    if (iconPicker) {
      iconPicker.addEventListener('click', (e) => {
        const btn = e.target.closest('.icon-picker__option');
        if (!btn) return;
        iconPicker.querySelectorAll('.icon-picker__option').forEach(b => b.classList.remove('icon-picker__option--active'));
        btn.classList.add('icon-picker__option--active');
      });
    }

    page.querySelector('#saveProfileBtn').addEventListener('click', () => {
      const name = page.querySelector('#editName').value.trim();
      const bio = page.querySelector('#editBio').value.trim();
      const avatar = page.querySelector('#editAvatar').value.trim().toUpperCase();
      const activeIconBtn = page.querySelector('.icon-picker__option--active');
      const avatarIcon = activeIconBtn ? activeIconBtn.dataset.icon : '';
      if (name) {
        store.updateProfile({ name, bio, avatar: avatar || name.substring(0, 2).toUpperCase(), avatarIcon });
        modal.style.display = 'none';
        page.querySelector('.profile-hero__name').textContent = name;
        page.querySelector('.profile-hero__bio').textContent = bio;
        const avatarEl = page.querySelector('.profile-hero__avatar');
        avatarEl.innerHTML = renderAvatarHTML(avatar || name.substring(0, 2).toUpperCase(), avatarIcon);
      }
    });
  }

  // Logout button
  const logoutBtn = page.querySelector('#logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await store.logout();
      window.location.hash = '#/auth';
      window.location.reload();
    });
  }

  // Ratings histogram
  const histogramEl = page.querySelector('#profileHistogram');
  if (histogramEl && visits.length > 0) {
    const ratings = visits.filter(v => v.rating).map(v => parseFloat(v.rating));
    if (ratings.length > 0) {
      histogramEl.appendChild(RatingsHistogram(ratings));
    }
  }

  setTimeout(renderTab, 0);
}

function formatJoinDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const months = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  return `${months[date.getMonth()]} ${date.getFullYear()}`;
}
