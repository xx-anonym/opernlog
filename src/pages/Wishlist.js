// Wishlist Page – Wunschliste
import { store } from '../store/store.js';
import { operas } from '../data/operas.js';

export function WishlistPage() {
    const page = document.createElement('div');
    page.className = 'page page--wishlist fade-in';

    function render() {
        const wl = store.getWishlist();
        const items = wl ? wl.items.map(id => operas.find(o => o.id === id)).filter(Boolean) : [];

        page.innerHTML = `
      <div class="page-header">
        <h1 class="page-header__title">🌟 Wunschliste</h1>
        <p class="page-header__subtitle">Opern, die du noch sehen möchtest</p>
      </div>
      <div id="wishlistContent"></div>
    `;

        const content = page.querySelector('#wishlistContent');

        if (items.length === 0) {
            content.innerHTML = `
        <div class="empty-state">
          <p>Deine Wunschliste ist noch leer.</p>
          <p class="text-muted">Stöbere durch die <a href="#/operas" class="link">Opern</a> und füge Werke hinzu, die du noch sehen möchtest!</p>
        </div>
      `;
            return;
        }

        const grid = document.createElement('div');
        grid.className = 'wishlist-grid';

        items.forEach(opera => {
            const composerColors = {
                'Wolfgang Amadeus Mozart': '#c9a84c',
                'Giuseppe Verdi': '#2d7d46',
                'Richard Wagner': '#7d2d2d',
                'Giacomo Puccini': '#2d5a7d',
                'Richard Strauss': '#7d5a2d',
            };
            const color = composerColors[opera.composer] || '#8b1a2b';

            const card = document.createElement('div');
            card.className = 'wishlist-card';
            card.innerHTML = `
        <div class="wishlist-card__image" style="${opera.image ? `background-image: linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(20,24,28,0.85)), url('${opera.image}'); background-size: cover; background-position: center;` : `background: linear-gradient(135deg, ${color}, #14181c);`}">
          <button class="wishlist-card__remove" title="Von der Wunschliste entfernen">✕</button>
        </div>
        <div class="wishlist-card__body">
          <h3 class="wishlist-card__title">${opera.title}</h3>
          <p class="wishlist-card__composer">🎼 ${opera.composer}</p>
          <div class="wishlist-card__meta">
            <span>${opera.genre}</span>
            <span>${opera.yearComposed}</span>
          </div>
          <div class="wishlist-card__actions">
            <a href="#/opera/${opera.id}" class="btn btn--outline btn--sm">Details</a>
            <a href="#/log?opera=${opera.id}" class="btn btn--primary btn--sm">+ Loggen</a>
          </div>
        </div>
      `;

            card.querySelector('.wishlist-card__remove').addEventListener('click', (e) => {
                e.stopPropagation();
                store.removeFromWishlist(opera.id);
                render();
            });

            grid.appendChild(card);
        });

        const countInfo = document.createElement('p');
        countInfo.className = 'wishlist-count';
        countInfo.textContent = `${items.length} ${items.length === 1 ? 'Oper' : 'Opern'} auf deiner Wunschliste`;
        content.appendChild(countInfo);
        content.appendChild(grid);
    }

    setTimeout(render, 0);
    return page;
}
