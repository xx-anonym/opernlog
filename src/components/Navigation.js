// Navigation Component
import { store } from '../store/store.js';
import { brandMarkSVG } from '../data/brandMark.js';
import * as sb from '../store/supabase.js';
import { isSupabaseConfigured } from '../config.js';
import { installHinweis } from './InstallHinweis.js';
import { tippen } from '../haptik.js';

// Die Leiste unten am Handy: die vier meistbenutzten Seiten und in der Mitte
// das Loggen. Vorher lag alles hinter dem Menüknopf oben rechts – der
// wichtigste Weg der App war zwei Tipps lang und oben, wo der Daumen nicht
// hinkommt. Das Menü bleibt für den Rest.
//
// Jeder Tipp auf die Leiste klickt haptisch (Jonas, 9.11.2026), ebenso der
// Menüknopf (14.11.2026) – anders als die übrige Navigation: Leiste und
// Knopf sind die Tastatur der App, und ohne Rückmeldung weiß der Daumen
// nicht, ob er getroffen hat. data-haptik fürs
// iPhone, tippen() für Android (siehe src/haptik.js).
const SVG = {
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  operas: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  log: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  diary: '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  profile: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
};

const tabPunkt = (seite, ziel, text, extra = '') => `
      <a class="tab-leiste__punkt${extra}" data-nav="${ziel}" data-page="${seite}" data-haptik href="${ziel}"${seite === 'log' ? ' aria-label="Besuch loggen"' : ''}>
        <span class="tab-leiste__zeichen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">${SVG[seite]}</svg></span>
        <span class="tab-leiste__text">${text}</span>
      </a>`;

export function Navigation() {
  const nav = document.createElement('nav');
  nav.className = 'main-nav';
  nav.innerHTML = `
    <div class="nav-brand" data-nav="#/">
      <div class="nav-brand__logo">${brandMarkSVG()}</div>
      <span class="nav-brand__name">OpernLog</span>
    </div>
    <div class="nav-links" id="hauptmenue">
      <a class="nav-link" data-nav="#/" data-page="home">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        <span>Feed</span>
      </a>
      <a class="nav-link" data-nav="#/houses" data-page="houses">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M3 7v1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7m0 1a3 3 0 0 0 6 0V7H3l2-4h14l2 4M5 21V10.87M19 21V10.87"/></svg>
        <span>Opernhäuser</span>
      </a>
      <a class="nav-link" data-nav="#/operas" data-page="operas">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
        <span>Opernwerke</span>
      </a>
      <a class="nav-link" data-nav="#/wishlist" data-page="wishlist">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
        <span>Wunschliste</span>
      </a>
      <a class="nav-link" data-nav="#/naehe" data-page="naehe">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        <span>In der Nähe</span>
      </a>
      <a class="nav-link nav-link--accent" data-nav="#/log" data-page="log">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        <span>Loggen</span>
      </a>
      <a class="nav-link" data-nav="#/diary" data-page="diary">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <span>Tagebuch</span>
      </a>
      <a class="nav-link" data-nav="#/lists" data-page="lists">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
        <span>Listen</span>
      </a>
      <a class="nav-link" data-nav="#/community" data-page="community">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        <span>Freunde</span>
      </a>
      <a class="nav-link" data-nav="#/profile/user-me" data-page="profile">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        <span>Profil</span>
      </a>
    </div>
    <button type="button" class="nav-mobile-toggle" id="mobileMenuToggle" data-haptik aria-label="Menü" aria-expanded="false" aria-controls="hauptmenue">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><line class="nav-mobile-toggle__strich nav-mobile-toggle__strich--oben" x1="3" y1="6" x2="21" y2="6"/><line class="nav-mobile-toggle__strich nav-mobile-toggle__strich--mitte" x1="3" y1="12" x2="21" y2="12"/><line class="nav-mobile-toggle__strich nav-mobile-toggle__strich--unten" x1="3" y1="18" x2="21" y2="18"/></svg>
    </button>
    <div class="tab-leiste">
      ${tabPunkt('home', '#/', 'Feed')}
      ${tabPunkt('operas', '#/operas', 'Opernwerke')}
      ${tabPunkt('log', '#/log', 'Loggen', ' tab-leiste__punkt--loggen')}
      ${tabPunkt('diary', '#/diary', 'Tagebuch')}
      ${tabPunkt('profile', '#/profile/user-me', 'Profil')}
    </div>
  `;

  // Auf dem Handy im Browser: der Hinweis aufs Installieren, als letzte Zeile
  // der Leiste und damit oben angeheftet wie sie. Die Leiste wird dadurch
  // höher, und was darunter steht, muss das wissen – deshalb wird ihre Höhe
  // gemessen und als --kopfhoehe bereitgestellt (siehe .mit-installhinweis
  // in style.css).
  const hinweis = installHinweis();
  if (hinweis) {
    nav.appendChild(hinweis);
    document.body.classList.add('mit-installhinweis');
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(() => {
        document.documentElement.style.setProperty('--kopfhoehe', `${nav.offsetHeight}px`);
      }).observe(nav);
    }
  }

  // Das Menü auf dem Handy. Der Knopf klickt haptisch und wird beim Öffnen
  // zum Kreuz, das Menü gleitet herein (Rückmeldung eines neuen Mitglieds,
  // 14.11.2026: vorher sprang es ohne jede Regung auf). Der Zustand hängt an
  // der Klasse nav-links--open; main.js nimmt sie beim Seitenwechsel weg,
  // der MutationObserver hält Knopf und aria-expanded mit.
  const menue = nav.querySelector('.nav-links');
  const toggle = nav.querySelector('#mobileMenuToggle');
  const knopfNachziehen = () => {
    const offen = menue.classList.contains('nav-links--open');
    toggle.classList.toggle('nav-mobile-toggle--offen', offen);
    toggle.setAttribute('aria-expanded', String(offen));
    toggle.setAttribute('aria-label', offen ? 'Menü schließen' : 'Menü');
  };
  new MutationObserver(knopfNachziehen).observe(menue, { attributes: true, attributeFilter: ['class'] });

  // Click handlers
  nav.addEventListener('click', (e) => {
    const link = e.target.closest('[data-nav]');
    if (link) {
      e.preventDefault();
      if (link.classList.contains('tab-leiste__punkt')) tippen();
      window.location.hash = link.dataset.nav;
      menue.classList.remove('nav-links--open');
    }
  });

  toggle.addEventListener('click', () => {
    tippen();
    menue.classList.toggle('nav-links--open');
  });

  // Highlight active
  function updateActive() {
    const hash = window.location.hash || '#/';
    nav.querySelectorAll('.nav-link, .tab-leiste__punkt').forEach(link => {
      const page = link.dataset.page;
      const aktiv = page === 'home' ? (hash === '#/' || hash === '')
        // Nur das eigene Profil: auf dem eines Freundes ist man nicht "bei sich".
        : page === 'profile' && link.classList.contains('tab-leiste__punkt') ? /^#\/profile(\/user-me)?$/.test(hash)
        : page === 'profile' ? hash.startsWith('#/profile')
        // "#/opera/tosca" gehört zu "Opernwerke", "#/operas" sowieso.
        : page === 'operas' && link.classList.contains('tab-leiste__punkt') ? /^#\/operas?(\/|$|\?)/.test(hash)
        : !!page && hash.startsWith(`#/${page}`);
      link.classList.toggle(link.classList.contains('tab-leiste__punkt') ? 'tab-leiste__punkt--aktiv' : 'nav-link--active', aktiv);
      if (link.classList.contains('tab-leiste__punkt')) {
        if (aktiv) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
      }
    });
  }

  // Die Leiste gehört zur App, nicht zur Anmeldung: wer abgemeldet ist, kann
  // mit keinem ihrer Punkte etwas anfangen, und über der Anmeldemaske sah sie
  // aus wie ein Fehler (Jonas, 9.11.2026). Eine angenommene Einladung
  // (#/invite/CODE) gehört noch zur Anmeldung, das Erstellen eines
  // Einladungslinks (#/invite) zur App – dort fehlte sie bis 15.11.2026.
  const leiste = nav.querySelector('.tab-leiste');
  function leisteZeigen() {
    const hash = window.location.hash || '#/';
    leiste.hidden = !store.hatKonto || /^#\/(auth(\/|\?|$)|invite\/)/.test(hash);
  }

  window.addEventListener('hashchange', () => { updateActive(); leisteZeigen(); });
  updateActive();
  leisteZeigen();
  // An- und Abmelden ändert nicht immer die Adresse.
  const abbestellen = store.subscribe(() => {
    if (!nav.isConnected) { abbestellen(); return; }
    leisteZeigen();
  });

  // Notification dot for pending friend requests
  if (store.isCloud && isSupabaseConfigured()) {
    (async () => {
      try {
        const requests = await sb.getPendingRequestsReceived();
        if (requests.length > 0) {
          nav.querySelectorAll('[data-page="home"]').forEach((homeLink) => {
            if (homeLink.querySelector('.notification-dot')) return;
            const dot = document.createElement('span');
            dot.className = 'notification-dot';
            homeLink.appendChild(dot);
          });
        }
      } catch (e) {
        // Silently fail – notification dot is not critical
      }
    })();
  }

  return nav;
}
