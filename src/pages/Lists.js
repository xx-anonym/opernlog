// Lists Page
import { store } from '../store/store.js';
import { operas } from '../data/operas.js';
import { operaHouses } from '../data/operaHouses.js';

export function ListsPage() {
  const page = document.createElement('div');
  page.className = 'page page--lists';

  page.innerHTML = `
    <div class="page-header">
      <h1 class="page-header__title">📋 Listen</h1>
      <p class="page-header__subtitle">Erstelle und verwalte deine kuratierten Sammlungen</p>
    </div>
    
    <div id="listsContent"></div>
    
    <div id="createListModal" class="modal" style="display:none">
      <div class="modal__overlay"></div>
      <div class="modal__content">
        <h2 class="modal__title">Neue Liste erstellen</h2>
        <div class="form-group">
          <label class="form-label">Name</label>
          <input type="text" class="input" id="listName" placeholder="z.B. Meine Mozart-Favoriten" />
        </div>
        <div class="form-group">
          <label class="form-label">Beschreibung</label>
          <textarea class="input textarea" id="listDesc" rows="2" placeholder="Worum geht es in dieser Liste?"></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Typ</label>
          <select class="select" id="listType">
            <option value="operas">Opern</option>
            <option value="houses">Opernhäuser</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Einträge hinzufügen</label>
          <div class="autocomplete">
            <input type="text" class="input" id="listItemSearch" placeholder="Suchen..." autocomplete="off" />
            <div class="autocomplete__list" id="listItemResults"></div>
          </div>
          <div class="selected-items" id="selectedItems"></div>
        </div>
        <div class="form-actions">
          <button class="btn btn--primary" id="saveListBtn">Liste erstellen</button>
          <button class="btn btn--outline" id="closeListModalBtn">Abbrechen</button>
        </div>
      </div>
    </div>
  `;

  let selectedItems = [];

  function renderContent() {
    const content = page.querySelector('#listsContent');
    content.innerHTML = '';

    const myLists = store.getMyLists();

    const createBtn = document.createElement('button');
    createBtn.className = 'btn btn--primary btn--lg create-list-btn';
    createBtn.textContent = '+ Neue Liste erstellen';
    createBtn.addEventListener('click', () => {
      selectedItems = [];
      renderSelectedItems();
      page.querySelector('#createListModal').style.display = 'flex';
    });
    content.appendChild(createBtn);

    if (myLists.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'empty-state';
      emptyState.innerHTML = `
            <p>Du hast noch keine Listen erstellt.</p>
            <p class="text-muted">Erstelle kuratierte Sammlungen deiner Lieblingsopern oder -häuser!</p>
      `;
      content.appendChild(emptyState);
    } else {
      const grid = document.createElement('div');
      grid.className = 'lists-grid';
      myLists.forEach(list => renderListCard(grid, list, true));
      content.appendChild(grid);
    }
  }

  function renderListCard(container, list, canDelete) {
    const user = store.getUser(list.userId);
    const items = list.type === 'operas' || list.type === 'wishlist'
      ? list.items.map(id => operas.find(o => o.id === id)).filter(Boolean)
      : list.items.map(id => operaHouses.find(h => h.id === id)).filter(Boolean);

    const card = document.createElement('div');
    card.className = 'list-card fade-in';
    card.innerHTML = `
      <div class="list-card__header">
        <h3 class="list-card__name">${list.name}</h3>
        ${canDelete ? `<button class="btn-icon list-card__delete" data-list-id="${list.id}">🗑️</button>` : ''}
      </div>
      <p class="list-card__desc">${list.description || ''}</p>
      <div class="list-card__user">
        <div class="avatar avatar--xs" style="background: linear-gradient(135deg, #8b1a2b, #c9a84c)">${user ? user.avatar : '??'}</div>
        <span>${user ? user.name : 'Unbekannt'}</span>
      </div>
      <div class="list-card__items">
        ${items.slice(0, 5).map(item => `
          <span class="list-card__item">${item.title || item.name}</span>
        `).join('')}
        ${items.length > 5 ? `<span class="list-card__more">+${items.length - 5} weitere</span>` : ''}
      </div>
      <div class="list-card__meta">
        <span>${list.items.length} Einträge</span>
        <span>❤️ ${list.likes || 0}</span>
      </div>
    `;

    if (canDelete) {
      const delBtn = card.querySelector('.list-card__delete');
      if (delBtn) {
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (confirm('Liste wirklich löschen?')) {
            store.deleteList(list.id);
            renderContent();
          }
        });
      }
    }

    // Click card to open list detail
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => {
      window.location.hash = `#/list/${list.id}`;
    });

    container.appendChild(card);
  }

  // Modal
  const modal = page.querySelector('#createListModal');
  page.querySelector('#closeListModalBtn').addEventListener('click', () => { modal.style.display = 'none'; });
  page.querySelector('.modal__overlay').addEventListener('click', () => { modal.style.display = 'none'; });

  // Item search
  const itemSearch = page.querySelector('#listItemSearch');
  const itemResults = page.querySelector('#listItemResults');

  itemSearch.addEventListener('input', () => {
    const query = itemSearch.value.toLowerCase();
    const type = page.querySelector('#listType').value;

    if (query.length < 1) { itemResults.style.display = 'none'; return; }

    const source = type === 'operas' ? operas : operaHouses;
    const matches = source.filter(item => {
      const name = item.title || item.name;
      const extra = item.composer || item.city || '';
      return (name.toLowerCase().includes(query) || extra.toLowerCase().includes(query)) && !selectedItems.includes(item.id);
    }).slice(0, 6);

    itemResults.innerHTML = '';
    itemResults.style.display = matches.length ? 'block' : 'none';

    matches.forEach(item => {
      const el = document.createElement('div');
      el.className = 'autocomplete__item';
      el.textContent = `${item.title || item.name}${item.composer ? ` – ${item.composer}` : ''}${item.city ? ` (${item.city})` : ''}`;
      el.addEventListener('click', () => {
        selectedItems.push(item.id);
        renderSelectedItems();
        itemSearch.value = '';
        itemResults.style.display = 'none';
      });
      itemResults.appendChild(el);
    });
  });

  function renderSelectedItems() {
    const container = page.querySelector('#selectedItems');
    const type = page.querySelector('#listType').value;
    const source = type === 'operas' ? operas : operaHouses;

    container.innerHTML = '';
    selectedItems.forEach(id => {
      const item = source.find(i => i.id === id);
      if (!item) return;
      const tag = document.createElement('span');
      tag.className = 'tag tag--removable';
      tag.innerHTML = `${item.title || item.name} <span class="tag__remove" data-id="${id}">×</span>`;
      tag.querySelector('.tag__remove').addEventListener('click', () => {
        selectedItems = selectedItems.filter(i => i !== id);
        renderSelectedItems();
      });
      container.appendChild(tag);
    });
  }

  // Type change resets items
  page.querySelector('#listType').addEventListener('change', () => {
    selectedItems = [];
    renderSelectedItems();
  });

  // Save list
  page.querySelector('#saveListBtn').addEventListener('click', () => {
    const name = page.querySelector('#listName').value.trim();
    const desc = page.querySelector('#listDesc').value.trim();
    const type = page.querySelector('#listType').value;

    if (!name) return;
    if (selectedItems.length === 0) return;

    store.addList({ name, description: desc, type, items: [...selectedItems] });
    modal.style.display = 'none';

    // Reset form
    page.querySelector('#listName').value = '';
    page.querySelector('#listDesc').value = '';
    selectedItems = [];

    renderContent();
  });

  setTimeout(renderContent, 0);

  return page;
}
