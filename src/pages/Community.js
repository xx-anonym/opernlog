// Freunde & Social Page
import { store } from '../store/store.js';
import { ReviewCard } from '../components/ReviewCard.js';
import * as sb from '../store/supabase.js';
import { operaHouses } from '../data/operaHouses.js';
import { operas } from '../data/operas.js';

export function CommunityPage() {
  const page = document.createElement('div');
  page.className = 'page page--community';

  page.innerHTML = `
    <div class="page-header">
      <h1 class="page-header__title">👥 Freunde</h1>
      <p class="page-header__subtitle">${store.isCloud ? 'Folge Opernfreunden und teile Besuche' : 'Verwalte deine Opernfreunde'}</p>
    </div>
    
    <div class="community-tabs">
      <button class="tab tab--active" data-tab="friends">Freunde</button>
      <button class="tab" data-tab="feed">Feed</button>
      ${store.isCloud ? '<button class="tab" data-tab="invite">Einladen</button>' : ''}
    </div>
    
    <div id="communityContent"></div>
    
    <!-- Add friend modal (local mode) -->
    <div id="addFriendModal" class="modal" style="display:none">
      <div class="modal__overlay"></div>
      <div class="modal__content">
        <h2 class="modal__title">👤 Freund hinzufügen</h2>
        <div class="form-group">
          <label class="form-label">Name</label>
          <input type="text" class="input" id="friendName" placeholder="z.B. Anna Müller" />
        </div>
        <div class="form-group">
          <label class="form-label">Über (optional)</label>
          <textarea class="input textarea" id="friendBio" rows="2" placeholder="z.B. Gemeinsame Opernbesuche seit 2024"></textarea>
        </div>
        <div class="form-actions">
          <button class="btn btn--primary" id="saveFriendBtn">Freund hinzufügen</button>
          <button class="btn btn--outline" id="closeFriendModalBtn">Abbrechen</button>
        </div>
      </div>
    </div>
  `;

  let activeTab = 'friends';
  const tabs = page.querySelectorAll('.community-tabs .tab');

  async function renderContent() {
    const content = page.querySelector('#communityContent');
    content.innerHTML = '';

    tabs.forEach(t => t.classList.toggle('tab--active', t.dataset.tab === activeTab));

    if (activeTab === 'friends') {
      await renderFriends(content, page);
    } else if (activeTab === 'feed') {
      await renderFeed(content);
    } else if (activeTab === 'invite') {
      renderInvite(content);
    }
  }

  async function renderFriends(content, page) {
    if (store.isCloud) {
      // Cloud mode: show followed users
      content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div> Lade Freunde...</div>';

      try {
        const following = await sb.getFollowing();

        content.innerHTML = '';

        // Action buttons
        const actions = document.createElement('div');
        actions.className = 'community-actions';
        actions.innerHTML = `
                    <a href="#/invite" class="btn btn--primary btn--lg">🔗 Freunde einladen</a>
                `;
        content.appendChild(actions);

        if (following.length === 0) {
          const emptyState = document.createElement('div');
          emptyState.className = 'empty-state';
          emptyState.innerHTML = `
                        <p>Du folgst noch niemandem.</p>
                        <p class="text-muted">Lade Freunde ein oder suche nach Nutzern!</p>
                    `;
          content.appendChild(emptyState);
        } else {
          const grid = document.createElement('div');
          grid.className = 'community-grid';

          for (const friend of following) {
            const card = document.createElement('div');
            card.className = 'user-card fade-in';
            card.innerHTML = `
                            <div class="user-card__avatar" style="background: linear-gradient(135deg, #8b1a2b, #c9a84c)">${friend.avatar_initials || '??'}</div>
                            <div class="user-card__info">
                                <h3 class="user-card__name">${friend.username}</h3>
                                <p class="user-card__bio">${friend.bio || ''}</p>
                                <div class="user-card__stats">
                                    <span>Dabei seit ${new Date(friend.created_at).toLocaleDateString('de-DE', { month: 'short', year: 'numeric' })}</span>
                                </div>
                            </div>
                            <div class="user-card__actions">
                                <button class="btn btn--outline btn--sm unfollow-btn">✓ Folgst du</button>
                            </div>
                        `;

            card.querySelector('.unfollow-btn').addEventListener('click', async (e) => {
              e.stopPropagation();
              if (confirm(`${friend.username} wirklich entfolgen?`)) {
                await sb.unfollow(friend.id);
                renderContent();
              }
            });

            // Click on card to view profile
            card.addEventListener('click', () => {
              window.location.hash = `#/profile/${friend.id}`;
            });
            card.style.cursor = 'pointer';

            grid.appendChild(card);
          }

          content.appendChild(grid);
        }
      } catch (err) {
        content.innerHTML = `<div class="empty-state"><p>Fehler beim Laden: ${err.message}</p></div>`;
      }
    } else {
      // Local mode: same as before
      const friends = store.getFriends();
      tabs[0].textContent = `Freunde (${friends.length})`;

      const addBtn = document.createElement('button');
      addBtn.className = 'btn btn--primary btn--lg create-list-btn';
      addBtn.textContent = '+ Freund hinzufügen';
      addBtn.addEventListener('click', () => {
        page.querySelector('#friendName').value = '';
        page.querySelector('#friendBio').value = '';
        page.querySelector('#addFriendModal').style.display = 'flex';
      });
      content.appendChild(addBtn);

      if (friends.length === 0) {
        const emptyState = document.createElement('div');
        emptyState.className = 'empty-state';
        emptyState.innerHTML = `
                    <p>Du hast noch keine Freunde hinzugefügt.</p>
                    <p class="text-muted">Füge Freunde hinzu, mit denen du Opernbesuche teilst!</p>
                `;
        content.appendChild(emptyState);
      } else {
        const grid = document.createElement('div');
        grid.className = 'community-grid';

        friends.forEach(friend => {
          const isFollowing = store.isFollowing(friend.id);
          const card = document.createElement('div');
          card.className = 'user-card fade-in';
          card.innerHTML = `
                        <div class="user-card__avatar" style="background: linear-gradient(135deg, #8b1a2b, #c9a84c)">${friend.avatar}</div>
                        <div class="user-card__info">
                            <h3 class="user-card__name">${friend.name}</h3>
                            <p class="user-card__bio">${friend.bio || ''}</p>
                        </div>
                        <div class="user-card__actions">
                            <button class="btn ${isFollowing ? 'btn--outline' : 'btn--primary'} btn--sm follow-btn">${isFollowing ? '✓ Folgst du' : '+ Folgen'}</button>
                            <button class="btn btn--ghost btn--sm remove-btn" title="Freund entfernen">🗑️</button>
                        </div>
                    `;

          card.querySelector('.follow-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            store.toggleFollow(friend.id);
            renderContent();
          });

          card.querySelector('.remove-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`${friend.name} wirklich als Freund entfernen?`)) {
              store.removeFriend(friend.id);
              renderContent();
            }
          });

          grid.appendChild(card);
        });

        content.appendChild(grid);
      }
    }
  }

  async function renderFeed(content) {
    if (store.isCloud) {
      content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div> Lade Feed...</div>';

      try {
        const feedItems = await sb.getFeedCloud();
        content.innerHTML = '';

        if (feedItems.length === 0) {
          content.innerHTML = `
                        <div class="empty-state">
                            <p>Noch keine Aktivitäten von Freunden.</p>
                            <p class="text-muted">Folge jemandem, um deren Besuche hier zu sehen!</p>
                            <a href="#/invite" class="btn btn--primary">🔗 Freunde einladen</a>
                        </div>
                    `;
        } else {
          const feedList = document.createElement('div');
          feedList.className = 'feed-list';

          feedItems.forEach(item => {
            const house = operaHouses.find(h => h.id === item.house_id);
            const opera = operas.find(o => o.id === item.opera_id);
            const profile = item.profiles;

            const card = document.createElement('div');
            card.className = 'feed-card fade-in';
            card.innerHTML = `
                            <div class="feed-card__header">
                                <div class="feed-card__avatar" style="background: linear-gradient(135deg, #8b1a2b, #c9a84c)">${profile?.avatar_initials || '??'}</div>
                                <div class="feed-card__meta">
                                    <strong>${profile?.username || 'Unbekannt'}</strong>
                                    <span class="text-muted">hat am ${new Date(item.date).toLocaleDateString('de-DE')} besucht</span>
                                </div>
                            </div>
                            <div class="feed-card__body">
                                <h3>${opera?.title || item.opera_id}</h3>
                                <p class="text-muted">${house?.name || item.house_id}, ${house?.city || ''}</p>
                                <div class="feed-card__rating">${'★'.repeat(Math.round(item.rating))}${'☆'.repeat(5 - Math.round(item.rating))} ${parseFloat(item.rating).toFixed(1)}</div>
                                ${item.review ? `<p class="feed-card__review">${item.review}</p>` : ''}
                            </div>
                        `;

            card.querySelector('.feed-card__header').style.cursor = 'pointer';
            card.querySelector('.feed-card__header').addEventListener('click', () => {
              window.location.hash = `#/profile/${profile?.id}`;
            });

            feedList.appendChild(card);
          });

          content.appendChild(feedList);
        }
      } catch (err) {
        content.innerHTML = `<div class="empty-state"><p>Fehler beim Laden: ${err.message}</p></div>`;
      }
    } else {
      // Local mode: show own visits
      const allVisits = store.getAllVisits().slice(0, 20);
      if (allVisits.length === 0) {
        content.innerHTML = `
                    <div class="empty-state">
                        <p>Du hast noch keine Besuche geloggt.</p>
                        <a href="#/log" class="btn btn--primary">Ersten Besuch loggen</a>
                    </div>
                `;
      } else {
        const feedList = document.createElement('div');
        feedList.className = 'feed-list';
        allVisits.forEach(visit => {
          feedList.appendChild(ReviewCard(visit));
        });
        content.appendChild(feedList);
      }
    }
  }

  function renderInvite(content) {
    content.innerHTML = `
            <div class="invite-inline">
                <div class="invite-card">
                    <div class="invite-card__icon">✉️</div>
                    <h2>Freunde einladen</h2>
                    <p class="text-muted">Erstelle einen Einladungslink und teile ihn per WhatsApp, E-Mail oder SMS.</p>
                    <button id="generateInlineBtn" class="btn btn--primary btn--lg">🔗 Link erstellen</button>
                    <div id="inlineInviteResult" style="display:none">
                        <div class="invite-link-box">
                            <input type="text" id="inlineInviteLink" readonly class="invite-link-input" />
                            <button id="inlineCopyBtn" class="btn btn--accent">📋 Kopieren</button>
                        </div>
                        <p class="invite-hint">📲 Der Link ist 30 Tage gültig</p>
                    </div>
                </div>
            </div>
        `;

    content.querySelector('#generateInlineBtn').addEventListener('click', async () => {
      const btn = content.querySelector('#generateInlineBtn');
      btn.disabled = true;
      btn.textContent = 'Wird erstellt...';

      try {
        const code = await sb.createInvite();
        const baseUrl = window.location.origin + window.location.pathname;
        const link = `${baseUrl}#/invite/${code}`;

        content.querySelector('#inlineInviteLink').value = link;
        content.querySelector('#inlineInviteResult').style.display = 'block';
        btn.textContent = '✅ Link erstellt!';

        content.querySelector('#inlineCopyBtn').addEventListener('click', () => {
          navigator.clipboard.writeText(link).then(() => {
            content.querySelector('#inlineCopyBtn').textContent = '✅ Kopiert!';
            setTimeout(() => {
              content.querySelector('#inlineCopyBtn').textContent = '📋 Kopieren';
            }, 2000);
          });
        });
      } catch (err) {
        btn.textContent = 'Fehler – nochmal versuchen';
        btn.disabled = false;
      }
    });
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      activeTab = tab.dataset.tab;
      renderContent();
    });
  });

  // Modal handlers
  const modal = page.querySelector('#addFriendModal');
  page.querySelector('#closeFriendModalBtn').addEventListener('click', () => { modal.style.display = 'none'; });
  page.querySelector('.modal__overlay').addEventListener('click', () => { modal.style.display = 'none'; });

  page.querySelector('#saveFriendBtn').addEventListener('click', () => {
    const name = page.querySelector('#friendName').value.trim();
    const bio = page.querySelector('#friendBio').value.trim();

    if (!name) {
      page.querySelector('#friendName').classList.add('shake');
      setTimeout(() => page.querySelector('#friendName').classList.remove('shake'), 500);
      return;
    }

    store.addFriend(name, bio);
    modal.style.display = 'none';
    renderContent();

    const toast = document.createElement('div');
    toast.className = 'toast fade-in';
    toast.textContent = `✅ ${name} als Freund hinzugefügt!`;
    document.body.appendChild(toast);
    setTimeout(() => { toast.classList.add('toast--hide'); }, 2000);
    setTimeout(() => { toast.remove(); }, 2500);
  });

  setTimeout(renderContent, 0);

  return page;
}
