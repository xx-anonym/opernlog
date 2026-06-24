// Profile Page – Hybrid (local + cloud)
import { store } from '../store/store.js';
import { ReviewCard } from '../components/ReviewCard.js';
import { RatingsHistogram } from '../components/RatingsHistogram.js';
import * as sb from '../store/supabase.js';
import { operaHouses } from '../data/operaHouses.js';
import { operas } from '../data/operas.js';
import { profileIcons, renderAvatarHTML } from '../data/profileIcons.js';

function renderGroupedVisits(visitsArray, container) {
  if (visitsArray.length === 0) {
    container.innerHTML = '<div class="empty-state">Noch keine Besuche geloggt.</div>';
    return;
  }

  const sorted = [...visitsArray].sort((a, b) => {
    const da = new Date(a.date || a.created_at || 0);
    const db = new Date(b.date || b.created_at || 0);
    return db - da;
  });

  const months = {};
  sorted.forEach(visit => {
    const dateStr = visit.date || visit.created_at;
    if (!dateStr) return;
    const date = new Date(dateStr);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!months[key]) months[key] = [];
    months[key].push(visit);
  });

  const monthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

  container.innerHTML = '';
  
  Object.keys(months).sort().reverse().forEach(key => {
    const visitsGroup = months[key];
    const [year, month] = key.split('-');
    
    const monthSection = document.createElement('div');
    monthSection.className = 'diary-month fade-in';
    monthSection.innerHTML = `<h3 class="diary-month__title">${monthNames[parseInt(month) - 1]} ${year}</h3>`;
    
    const feedList = document.createElement('div');
    feedList.className = 'feed-list';
    
    visitsGroup.forEach(visit => {
      feedList.appendChild(ReviewCard(visit, { compact: false }));
    });
    
    monthSection.appendChild(feedList);
    container.appendChild(monthSection);
  });
}

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

    const [stats, visits, relationshipInitial, userLists, privacy] = await Promise.all([
      sb.getUserStatsCloud(userId),
      sb.getUserVisitsCloud(userId),
      sb.getRelationship(userId),
      sb.getUserListsCloud(userId),
      sb.getFriendRequestPrivacy(userId),
    ]);
    let relationship = relationshipInitial;

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

    // Compute favorites from cloud visits
    const composerData = {};
    const houseCount = {};

    visits.forEach(v => {
      const oId = v.opera_id || v.operaId;
      const hId = v.house_id || v.houseId;
      const rating = parseFloat(v.rating) || 0;

      const opera = operas.find(o => o.id === oId);
      if (opera) {
        if (!composerData[opera.composer]) {
          composerData[opera.composer] = { count: 0, totalRating: 0 };
        }
        composerData[opera.composer].count += 1;
        composerData[opera.composer].totalRating += rating;
      }

      if (hId) {
        houseCount[hId] = (houseCount[hId] || 0) + 1;
      }
    });

    const topComposerArr = Object.entries(composerData)
      .sort((a, b) => {
        if (b[1].count !== a[1].count) return b[1].count - a[1].count;
        return (b[1].totalRating / b[1].count) - (a[1].totalRating / a[1].count);
      })[0];
    const topComposer = topComposerArr ? topComposerArr[0] : '-';

    const topHouseIdArr = Object.entries(houseCount).sort((a, b) => b[1] - a[1])[0];
    const topHouseObj = topHouseIdArr ? operaHouses.find(h => h.id === topHouseIdArr[0]) : null;
    const topHouse = topHouseObj ? topHouseObj.name : '-';

    // Build the relationship button HTML
    function getRelationshipButtonHTML(rel, priv) {
      switch (rel) {
        case 'friends':
          return '<button class="btn--friend" id="friendActionBtn" title="Freundschaft beenden">✓ Befreundet</button>';
        case 'request_sent':
          return '<button class="btn--pending" id="friendActionBtn" title="Anfrage zurückziehen">⏳ Anfrage gesendet</button>';
        case 'request_received':
          return `<div class="friend-request-card__actions" id="friendActionBtns">
            <button class="btn--accept" id="acceptRequestBtn">✓ Annehmen</button>
            <button class="btn--decline" id="declineRequestBtn">✕ Ablehnen</button>
          </div>`;
        case 'none':
        default:
          if (priv === 'nobody') return '<span class="text-muted" style="font-size:0.85rem">Nimmt keine Anfragen an</span>';
          if (priv === 'link_only') return '<span class="text-muted" style="font-size:0.85rem">🔗 Nur über Einladungslink</span>';
          return '<button class="btn--send-request" id="friendActionBtn">👋 Freundschaftsanfrage</button>';
      }
    }

    page.innerHTML = `
      <div class="profile-hero">
        <div class="profile-hero__avatar" style="background: linear-gradient(135deg, #8b1a2b, #c9a84c)">
          ${renderAvatarHTML(user.avatar, user.avatarIcon)}
        </div>
        <div class="profile-hero__info">
          <h1 class="profile-hero__name">${user.name}</h1>
          <p class="profile-hero__bio">${user.bio}</p>
          <span class="profile-hero__joined">Dabei seit ${formatJoinDate(user.joined)}</span>
          <div id="relationshipArea">
            ${getRelationshipButtonHTML(relationship, privacy)}
          </div>
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

      ${topComposer !== '-' ? `
      <div class="profile-favorites">
        <div class="favorite-item">
          <span class="favorite-item__label">Lieblingskomponist</span>
          <span class="favorite-item__value">${topComposer}</span>
        </div>
        <div class="favorite-item">
          <span class="favorite-item__label">Meistbesuchtes Haus</span>
          <span class="favorite-item__value">${topHouse}</span>
        </div>
      </div>
      ` : ''}

      <div class="profile-tabs">
        <button class="tab tab--active" data-cloud-tab="reviews">Reviews (${visits.length})</button>
        <button class="tab" data-cloud-tab="lists">Listen (${userLists.length})</button>
      </div>

      <div id="cloudTabReviews">
        <div id="cloudVisits"></div>
      </div>

      <div id="cloudTabLists" style="display: none;">
        ${wishlist && wishlist.items.length > 0 ? `
          <h2 class="section-title">🌟 Wunschliste</h2>
          <div id="cloudWishlist" class="lists-grid"></div>
        ` : ''}

        ${regularLists.length > 0 ? `
          <h2 class="section-title">📋 Listen</h2>
          <div id="cloudLists" class="lists-grid"></div>
        ` : ''}

        ${!wishlist && regularLists.length === 0 ? `
          <div class="empty-state">Noch keine Listen.</div>
        ` : ''}
      </div>
    `;

    // Tab switching logic
    const cloudTabs = page.querySelectorAll('[data-cloud-tab]');
    const tabReviews = page.querySelector('#cloudTabReviews');
    const tabLists = page.querySelector('#cloudTabLists');

    cloudTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        cloudTabs.forEach(t => t.classList.remove('tab--active'));
        tab.classList.add('tab--active');
        
        if (tab.dataset.cloudTab === 'reviews') {
          tabReviews.style.display = 'block';
          tabLists.style.display = 'none';
        } else {
          tabReviews.style.display = 'none';
          tabLists.style.display = 'block';
        }
      });
    });

    // Friend request / relationship buttons
    const area = page.querySelector('#relationshipArea');

    function attachRelationshipHandlers() {
      const actionBtn = area.querySelector('#friendActionBtn');
      const acceptBtn = area.querySelector('#acceptRequestBtn');
      const declineBtn = area.querySelector('#declineRequestBtn');

      if (actionBtn) {
        if (relationship === 'friends') {
          // Unfriend
          actionBtn.addEventListener('click', async () => {
            if (confirm(`Freundschaft mit ${user.name} wirklich beenden?`)) {
              actionBtn.disabled = true;
              actionBtn.textContent = '...';
              try {
                await sb.unfriend(userId);
                area.innerHTML = getRelationshipButtonHTML('none', privacy);
                relationship = 'none';
                attachRelationshipHandlers();
              } catch (e) {
                actionBtn.textContent = '✓ Befreundet';
                actionBtn.disabled = false;
              }
            }
          });
        } else if (relationship === 'request_sent') {
          // Cancel request (not directly supported by RPC, but user can click)
          actionBtn.addEventListener('click', () => {
            // Show subtle feedback that request is pending
            actionBtn.style.animation = 'pulse 1s ease-in-out';
            setTimeout(() => actionBtn.style.animation = '', 1000);
          });
        } else if (relationship === 'none') {
          // Send friend request
          actionBtn.addEventListener('click', async () => {
            actionBtn.disabled = true;
            actionBtn.textContent = 'Wird gesendet...';
            try {
              await sb.sendFriendRequest(userId);
              // Check if auto-accepted (if they had sent us a request)
              const newRel = await sb.getRelationship(userId);
              if (newRel === 'friends') {
                area.innerHTML = '<div class="friend-request-success">🎉 Ihr seid jetzt Freunde!</div>';
                setTimeout(() => {
                  area.innerHTML = getRelationshipButtonHTML('friends', privacy);
                  relationship = 'friends';
                  attachRelationshipHandlers();
                }, 2000);
              } else {
                area.innerHTML = getRelationshipButtonHTML('request_sent', privacy);
                relationship = 'request_sent';
                attachRelationshipHandlers();
              }
            } catch (e) {
              const msg = e.message || '';
              if (msg.includes('link')) {
                actionBtn.textContent = '🔗 Nur über Einladungslink';
                actionBtn.className = 'btn--pending';
              } else if (msg.includes('not accept')) {
                actionBtn.textContent = 'Nimmt keine Anfragen an';
                actionBtn.className = 'btn--pending';
              } else {
                actionBtn.textContent = '👋 Freundschaftsanfrage';
                actionBtn.disabled = false;
              }
            }
          });
        }
      }

      if (acceptBtn && declineBtn) {
        acceptBtn.addEventListener('click', async () => {
          acceptBtn.disabled = true;
          acceptBtn.textContent = '...';
          try {
            // Get the request ID
            const reqs = await sb.getPendingRequestsReceived();
            const req = reqs.find(r => r.sender_id === userId);
            if (req) {
              await sb.acceptFriendRequest(req.id);
              area.innerHTML = '<div class="friend-request-success">🎉 Ihr seid jetzt Freunde!</div>';
              setTimeout(() => {
                area.innerHTML = getRelationshipButtonHTML('friends', privacy);
                relationship = 'friends';
                attachRelationshipHandlers();
              }, 2000);
            }
          } catch (e) {
            acceptBtn.textContent = '✓ Annehmen';
            acceptBtn.disabled = false;
          }
        });

        declineBtn.addEventListener('click', async () => {
          declineBtn.disabled = true;
          try {
            const reqs = await sb.getPendingRequestsReceived();
            const req = reqs.find(r => r.sender_id === userId);
            if (req) {
              await sb.declineFriendRequest(req.id);
              area.innerHTML = getRelationshipButtonHTML('none', privacy);
              relationship = 'none';
              attachRelationshipHandlers();
            }
          } catch (e) {
            declineBtn.disabled = false;
          }
        });
      }
    }

    attachRelationshipHandlers();

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
          <div class="list-card__meta">
            <span>${list.items.length} Einträge</span>
            ${list.likes && list.type !== 'wishlist' ? `<span>❤️ ${list.likes}</span>` : ''}
          </div>
        `;
        card.addEventListener('click', () => window.location.hash = `#/list/${list.id}`);
        listsContainer.appendChild(card);
      });
    }

    // Render visits
    const visitsContainer = page.querySelector('#cloudVisits');
    renderGroupedVisits(visits, visitsContainer);
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
        ${store.isCloud ? `
        <div class="form-group">
          <label class="form-label">Freundschaftsanfragen</label>
          <select class="privacy-select" id="editPrivacy">
            <option value="everyone">Jeder kann anfragen</option>
            <option value="link_only">Nur über Einladungslink</option>
            <option value="nobody">Niemand</option>
          </select>
          <p class="privacy-hint">Bestimme, wer dir Freundschaftsanfragen senden darf.</p>
        </div>
        ` : ''}
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
        renderGroupedVisits(visits, content);
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

    // Load current privacy setting into dropdown
    if (store.isCloud) {
      sb.getFriendRequestPrivacy(store._profile?.id).then(priv => {
        const privSelect = page.querySelector('#editPrivacy');
        if (privSelect) privSelect.value = priv;
      });
    }

    page.querySelector('#saveProfileBtn').addEventListener('click', async () => {
      const name = page.querySelector('#editName').value.trim();
      const bio = page.querySelector('#editBio').value.trim();
      const avatar = page.querySelector('#editAvatar').value.trim().toUpperCase();
      const activeIconBtn = page.querySelector('.icon-picker__option--active');
      const avatarIcon = activeIconBtn ? activeIconBtn.dataset.icon : '';
      if (name) {
        store.updateProfile({ name, bio, avatar: avatar || name.substring(0, 2).toUpperCase(), avatarIcon });

        // Save privacy setting if in cloud mode
        const privSelect = page.querySelector('#editPrivacy');
        if (privSelect && store.isCloud) {
          await sb.updateFriendRequestPrivacy(privSelect.value);
        }

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
