// Home / Feed Page
import { ReviewCard } from '../components/ReviewCard.js';
import { store } from '../store/store.js';
import { operaHouses } from '../data/operaHouses.js';
import { operas } from '../data/operas.js';
import { isSupabaseConfigured } from '../config.js';
import * as sb from '../store/supabase.js';

export function HomePage() {
  const page = document.createElement('div');
  page.className = 'page page--home';

  // Hero Section
  const hero = document.createElement('section');
  hero.className = 'hero';
  hero.innerHTML = `
    <div class="hero__content">
      <h1 class="hero__title">Willkommen bei <span class="text-accent">OpernLog</span></h1>
      <p class="hero__subtitle">Logge deine Opernbesuche, entdecke neue Werke und teile deine Leidenschaft mit der Community.</p>
      <div class="hero__actions">
        <a href="#/log" class="btn btn--primary btn--lg">+ Besuch loggen</a>
        <a href="#/houses" class="btn btn--outline btn--lg">Opernhäuser entdecken</a>
      </div>
      <div class="hero__stats">
        <div class="hero__stat"><span class="hero__stat-number">${operaHouses.length}</span><span class="hero__stat-label">Opernhäuser</span></div>
        <div class="hero__stat"><span class="hero__stat-number">${operas.length}</span><span class="hero__stat-label">Opernwerke</span></div>
        <div class="hero__stat"><span class="hero__stat-number">${store.getAllVisits().length}</span><span class="hero__stat-label">Besuche geloggt</span></div>
      </div>
    </div>
  `;
  page.appendChild(hero);

  // Feed
  const feedSection = document.createElement('section');
  feedSection.className = 'section';
  feedSection.innerHTML = `<h2 class="section__title">📰 Dein Feed</h2><div class="loading-spinner"><div class="spinner"></div></div>`;
  page.appendChild(feedSection);

  async function loadFeed() {
    let feed = [];
    try {
      if (store.isCloud && isSupabaseConfigured()) {
        const cloudFeed = await sb.getFeedCloud();
        feed = cloudFeed.map(v => ({
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
        feed = store.getFeed();
      }
    } catch (e) {
      console.warn('Feed load failed', e);
      feed = store.getFeed();
    }

    feedSection.innerHTML = `<h2 class="section__title">📰 Dein Feed</h2>`;

    if (feed.length === 0) {
      feedSection.innerHTML += `
        <div class="empty-state">
          <p>Dein Feed ist noch leer. Folge anderen Opernfans, um ihre Besuche hier zu sehen!</p>
          <a href="#/community" class="btn btn--primary">Community entdecken</a>
        </div>
      `;
    } else {
      const feedGrid = document.createElement('div');
      feedGrid.className = 'feed-list';
      feed.forEach(visit => {
        feedGrid.appendChild(ReviewCard(visit));
      });
      feedSection.appendChild(feedGrid);
    }
  }

  loadFeed();

  // Popular operas
  const popularSection = document.createElement('section');
  popularSection.className = 'section';
  popularSection.innerHTML = `<h2 class="section__title">🔥 Beliebte Opern</h2>`;

  const operaCounts = {};
  store.getAllVisits().forEach(v => {
    operaCounts[v.operaId] = (operaCounts[v.operaId] || 0) + 1;
  });
  const popularOperas = Object.entries(operaCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id]) => operas.find(o => o.id === id))
    .filter(Boolean);

  const popularGrid = document.createElement('div');
  popularGrid.className = 'card-grid';

  if (popularOperas.length === 0) {
    popularSection.innerHTML += `
      <div class="empty-state">
        <p>Noch keine Besuche geloggt. Logge deinen ersten Besuch, um Statistiken zu sehen!</p>
        <a href="#/log" class="btn btn--primary">Ersten Besuch loggen</a>
      </div>
    `;
  } else {
    popularOperas.forEach(opera => {
      const avgRating = store.getAverageRatingForOpera(opera.id);
      const card = document.createElement('div');
      card.className = 'opera-card fade-in';
      card.innerHTML = `
          <div class="opera-card__color" style="background: linear-gradient(135deg, ${getComposerColor(opera.composer)}, #14181c)"></div>
          <div class="opera-card__content">
            <h3 class="opera-card__title">${opera.title}</h3>
            <p class="opera-card__composer">${opera.composer}</p>
            ${avgRating ? `<div class="opera-card__rating">★ ${avgRating.toFixed(1)}</div>` : ''}
          </div>
        `;
      card.addEventListener('click', () => window.location.hash = `#/opera/${opera.id}`);
      popularGrid.appendChild(card);
    });
    popularSection.appendChild(popularGrid);
  }
  page.appendChild(popularSection);

  return page;
}

function getComposerColor(composer) {
  const colors = {
    'Wolfgang Amadeus Mozart': '#c9a84c',
    'Giuseppe Verdi': '#2d7d46',
    'Richard Wagner': '#7d2d2d',
    'Giacomo Puccini': '#2d5a7d',
    'Richard Strauss': '#7d5a2d',
    'Georges Bizet': '#7d2d5a',
  };
  return colors[composer] || '#8b1a2b';
}
