// Feed – die Startseite
//
// Der Feed ist zuallererst dafür da, mitzubekommen, was die Freunde treiben.
// Alles andere ordnet sich dem unter: der Kopf ist knapp, die Empfehlungen
// stehen darunter, und die Abende Fremder erscheinen nur, solange es noch
// keine Freunde gibt – als Rückfallebene, nicht als Hauptsache.
//
// Was hier stand und weg ist: "Beliebte Opern". Der Abschnitt zählte über
// store.getAllVisits(), also über die eigenen Besuche – "beliebt" war in
// Wahrheit "von mir am häufigsten geloggt", und der Stern daneben war der
// eigene Schnitt in der Aufmachung eines Community-Urteils.
//
// Repariert wurde er nicht, sondern gestrichen. In der Datenbank stehen sechs
// Besuche auf fünf Werke; genau eines hat zwei Abende. Eine Rangliste darüber
// ist keine Rangliste. Sie darf zurückkommen, wenn es Masse gibt – ab etwa
// hundert Besuchen und nur mit Mindestzahl je Werk (fünf Abende für
// "meistgesehen", fünf Bewertungen für "am besten bewertet"), sonst gewinnt
// ein einzelner Fünf-Sterne-Abend die Tabelle.

import { escapeHTML } from '../utils.js';
import { icon } from '../components/Icon.js';
import { renderAvatarHTML } from '../data/profileIcons.js';
import { showError } from '../components/Toast.js';
import { ReviewCard } from '../components/ReviewCard.js';
import { BlindSpots } from '../components/BlindSpots.js';
import { store } from '../store/store.js';
import { isSupabaseConfigured } from '../config.js';
import * as sb from '../store/supabase.js';
import {
  isSeasonReviewWindow,
  lastCompletedSeasonStartYear,
  seasonLabel,
  seasonStartYear,
  seasonSummary,
  visitsInSeason,
} from '../data/season.js';

/** Eine Bewertung als "4,2". */
function note(n) {
  return n.toFixed(1).replace('.', ',');
}

export function HomePage() {
  const page = document.createElement('div');
  page.className = 'page page--home';

  const eigene = store.getVisitsByUser('user-me') || [];

  page.appendChild(kopf(eigene));
  saisonBanner(page, eigene);
  freundschaftsanfragen(page);
  page.appendChild(feedAbschnitt());
  empfehlungen(page, eigene);

  return page;
}

/**
 * Der Kopf: die laufende Spielzeit in vier Zahlen.
 *
 * Vorher stand hier "Willkommen bei OpernLog" samt Werbezeile und den Größen
 * des Katalogs – 92 Häuser, 121 Werke. Beides ändert sich nie und sagt über
 * den Nutzer nichts. Wer noch nichts geloggt hat, bekommt den Willkommensgruß
 * weiterhin: für den ersten Start ist er richtig, nur nicht für den hundertsten.
 */
function kopf(eigene) {
  const el = document.createElement('section');
  el.className = 'feedkopf';

  if (!eigene.length) {
    el.classList.add('feedkopf--neu');
    el.innerHTML = `
      <h1 class="feedkopf__gruss">Willkommen bei <span class="text-accent">OpernLog</span></h1>
      <p class="feedkopf__zeile">Dein Operntagebuch: Abende festhalten, Werke entdecken, mit Freunden teilen.</p>
      <div class="feedkopf__aktionen">
        <a href="#/log" class="btn btn--primary btn--lg">+ Ersten Besuch loggen</a>
        <a href="#/houses" class="btn btn--outline btn--lg">Opernhäuser ansehen</a>
      </div>`;
    return el;
  }

  const jahr = seasonStartYear(new Date().toISOString().slice(0, 10));
  const s = seasonSummary(eigene, jahr);

  // In der Sommerpause steht hier sonst eine Reihe Nullen. Dann lieber die
  // Spielzeit zeigen, in der zuletzt etwas war.
  const zeigeJahr = s.abende ? jahr : seasonStartYear(eigene[0]?.date) ?? jahr;
  const z = s.abende ? s : seasonSummary(eigene, zeigeJahr);

  const zahl = (wert, label, ziel) => `
    <a class="feedkopf__zahl" href="${ziel}">
      <span class="feedkopf__wert">${wert}</span>
      <span class="feedkopf__label">${label}</span>
    </a>`;

  el.innerHTML = `
    <div class="feedkopf__oben">
      <div>
        <span class="feedkopf__kicker">Spielzeit ${seasonLabel(zeigeJahr)}</span>
        <h1 class="feedkopf__gruss">${z.abende
          ? `${z.abende} ${z.abende === 1 ? 'Abend' : 'Abende'}`
          : 'Noch kein Abend'}</h1>
      </div>
      <a href="#/log" class="btn btn--primary">+ Loggen</a>
    </div>
    <div class="feedkopf__zahlen">
      ${zahl(z.haeuser, z.haeuser === 1 ? 'Haus' : 'Häuser', '#/houses')}
      ${zahl(z.werke, z.werke === 1 ? 'Werk' : 'Werke', '#/operas')}
      ${zahl(z.schnitt === null ? '–' : note(z.schnitt), 'Schnitt', '#/diary')}
      ${zahl(eigene.length, 'insgesamt', '#/diary')}
    </div>`;
  return el;
}

/**
 * Saisonrückblick – vom 31. Juli bis Ende August, und nur wenn in der
 * abgelaufenen Spielzeit überhaupt etwas geloggt wurde. Ein Hinweis auf einen
 * leeren Rückblick wäre nur eine Enttäuschung mit Anlauf.
 */
function saisonBanner(page, eigene) {
  if (!isSeasonReviewWindow()) return;
  const startYear = lastCompletedSeasonStartYear();
  const besuche = visitsInSeason(eigene, startYear);
  if (!besuche.length) return;

  const banner = document.createElement('a');
  banner.className = 'season-banner fade-in';
  banner.href = `#/season/${startYear}`;
  banner.innerHTML = `
    <span class="season-banner__kicker">Deine Spielzeit ist zu Ende</span>
    <span class="season-banner__title">Saisonrückblick ${seasonLabel(startYear)}</span>
    <span class="season-banner__note">
      ${besuche.length} ${besuche.length === 1 ? 'Abend' : 'Abende'} – ansehen ${icon('link')}
    </span>`;
  page.appendChild(banner);
}

/**
 * Der Feed selbst: die Abende der Freunde.
 *
 * Wer noch niemandem folgt, bekam bisher eine leere Kiste mit dem Rat, doch
 * Opernfreunde zu suchen – und damit eine Startseite, auf der nichts steht.
 * Der Rat bleibt, aber darunter stehen jetzt die letzten Abende der anderen.
 * Deutlich abgesetzt und eigens überschrieben: das sind keine Freunde, und es
 * soll nicht so aussehen.
 */
function feedAbschnitt() {
  const el = document.createElement('section');
  el.className = 'section';
  el.innerHTML = `
    <h2 class="section__title">${icon('feed')}Von deinen Freunden</h2>
    <div class="loading-spinner"><div class="spinner"></div></div>`;

  (async () => {
    // Hier standen früher die eigenen Besuche, wenn keine Cloud da war –
    // unter der Überschrift "Dein Feed" fiel das nicht weiter auf. Unter
    // "Von deinen Freunden" wäre es schlicht gelogen, und das eigene Tagebuch
    // hat ohnehin einen eigenen Reiter. Also: Freunde oder nichts.
    const angemeldet = store.isCloud && isSupabaseConfigured();
    let feed = [];
    let gescheitert = false;
    let folgt = 0;

    if (angemeldet) {
      try {
        feed = (await sb.getFeedCloud()).map(v => sb.mapCloudVisit(v));
        // Ein leerer Feed hat zwei Ursachen, und sie verlangen verschiedene
        // Sätze: niemandem folgen, oder Gefolgten ohne Abende. Nur im
        // Leerfall gefragt – sonst wäre es eine Abfrage für nichts.
        if (!feed.length) folgt = await sb.getFollowingCount();
      } catch (e) {
        console.error('[Feed laden]', e);
        showError('Der Feed konnte nicht geladen werden.');
        gescheitert = true;
      }
    }

    el.innerHTML = `<h2 class="section__title">${icon('feed')}Von deinen Freunden</h2>`;

    if (feed.length) {
      const liste = document.createElement('div');
      liste.className = 'feed-list';
      feed.forEach(v => liste.appendChild(ReviewCard(v)));
      el.appendChild(liste);
      return;
    }

    const leer = document.createElement('div');
    leer.className = 'feed-leer';
    leer.innerHTML = gescheitert
      ? `<p class="feed-leer__text">${icon('globe', { className: 'icon--meta' })}
           Die Abende deiner Freunde sind gerade nicht erreichbar. Dein eigenes
           Tagebuch liegt lokal und ist davon nicht betroffen.</p>
         <a href="#/diary" class="btn btn--primary">Zum Tagebuch</a>`
      : angemeldet && folgt > 0
        ? `<p class="feed-leer__text">${icon('calendar', { className: 'icon--meta' })}
             Du folgst ${folgt} ${folgt === 1 ? 'Person' : 'Personen'}, aber dort wurde
             noch kein Abend geloggt. Sobald das passiert, steht er hier.</p>
           <a href="#/community" class="btn btn--outline">Weitere Opernfreunde finden</a>`
      : angemeldet
        ? `<p class="feed-leer__text">${icon('user', { className: 'icon--meta' })}
             Du folgst noch niemandem. Sobald du das tust, stehen die Abende deiner
             Freunde hier – mit Bewertung, Besetzung und Platz für einen Kommentar.</p>
           <a href="#/community" class="btn btn--primary">Opernfreunde finden</a>`
        : `<p class="feed-leer__text">${icon('user', { className: 'icon--meta' })}
             Mit einem Konto siehst du hier, was deine Opernfreunde erlebt haben.
             Dein Tagebuch führst du auch ohne.</p>
           <a href="#/auth" class="btn btn--primary">Anmelden</a>`;
    el.appendChild(leer);

    if (angemeldet && !gescheitert) await gemeinschaft(el);
  })();

  return el;
}

/** Die Rückfallebene: was sonst geloggt wurde, deutlich als solche gekennzeichnet. */
async function gemeinschaft(el) {
  let besuche = [];
  try {
    besuche = (await sb.getRecentCommunityVisits(12)).map(v => sb.mapCloudVisit(v));
  } catch (e) {
    // Ohne Netz oder ohne Rechte bleibt es beim Hinweis darüber – der Feed
    // ist deshalb nicht kaputt.
    console.error('[Letzte Abende der Community laden]', e);
    return;
  }
  if (!besuche.length) return;

  const unter = document.createElement('div');
  unter.className = 'feed-sonst';
  unter.innerHTML = `
    <h3 class="feed-sonst__titel">${icon('globe', { className: 'icon--meta' })}Zuletzt in OpernLog</h3>
    <p class="feed-sonst__zeile">Abende von Leuten, denen du nicht folgst.</p>`;

  const liste = document.createElement('div');
  liste.className = 'feed-list';
  besuche.forEach(v => liste.appendChild(ReviewCard(v)));
  unter.appendChild(liste);
  el.appendChild(unter);
}

/**
 * Blinde Flecken statt "Beliebte Opern".
 *
 * Die Empfehlung stammt aus dem eigenen Tagebuch und dem Katalog – sie
 * funktioniert ab dem ersten geloggten Abend und braucht weder Netz noch
 * Community. Genau das, was eine Rangliste über sechs Besuche nicht kann.
 * Sie stand bisher nur auf der Opern-Seite.
 */
function empfehlungen(page, eigene) {
  const blinde = BlindSpots(eigene, store.getSeenOperas());
  if (!blinde) return;

  const el = document.createElement('section');
  el.className = 'section';
  el.innerHTML = `<h2 class="section__title">${icon('trending')}Was dir noch fehlt</h2>`;
  el.appendChild(blinde);
  page.appendChild(el);
}

/** Freundschaftsanfragen – ganz oben, weil sie auf eine Antwort warten. */
function freundschaftsanfragen(page) {
  if (!store.isCloud || !isSupabaseConfigured()) return;

  const el = document.createElement('section');
  el.className = 'section friend-requests-section';
  el.style.display = 'none';
  page.appendChild(el);

  (async () => {
    try {
      const requests = await sb.getPendingRequestsReceived();
      if (requests.length === 0) return;

      el.style.display = 'block';
      el.innerHTML = `
        <h2 class="friend-requests-section__title">
          ${icon('inbox')}Freundschaftsanfragen
          <span class="friend-requests-section__badge">${requests.length}</span>
        </h2>`;

      const list = document.createElement('div');
      el.appendChild(list);

      requests.forEach(req => {
        const profile = req.profiles;
        const card = document.createElement('div');
        card.className = 'friend-request-card fade-in';
        card.innerHTML = `
          <div class="friend-request-card__avatar" style="background: linear-gradient(135deg, #8b1a2b, #c9a84c)" data-user-id="${profile?.id}">
            ${renderAvatarHTML(profile?.avatar_initials || '??', profile?.avatar_icon)}
          </div>
          <div class="friend-request-card__info">
            <div class="friend-request-card__name" data-user-id="${profile?.id}">${escapeHTML(profile?.username || 'Unbekannt')}</div>
            <div class="friend-request-card__time">${formatTimeAgo(req.created_at)}</div>
          </div>
          <div class="friend-request-card__actions">
            <button class="btn--accept" data-accept="${req.id}">✓ Annehmen</button>
            <button class="btn--decline" data-decline="${req.id}">✕</button>
          </div>`;

        card.querySelectorAll('[data-user-id]').forEach(e => {
          e.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (!e.dataset.userId) return;
            window.location.hash = `#/profile/${e.dataset.userId}`;
          });
        });

        /** Karte ausblenden und den Zähler nachziehen; bei null ist Schluss. */
        const wegblenden = () => {
          card.classList.add('friend-request-card--removing');
          setTimeout(() => {
            card.remove();
            const rest = list.querySelectorAll('.friend-request-card').length;
            if (rest === 0) {
              el.style.display = 'none';
              document.querySelectorAll('.notification-dot').forEach(d => d.remove());
            } else {
              el.querySelector('.friend-requests-section__badge').textContent = rest;
            }
          }, 400);
        };

        card.querySelector('[data-accept]').addEventListener('click', async (ev) => {
          ev.stopPropagation();
          const btn = ev.target;
          btn.disabled = true;
          btn.textContent = '...';
          try {
            await sb.acceptFriendRequest(req.id);
            card.classList.add('friend-request-card--accepted');
            card.querySelector('.friend-request-card__actions').innerHTML =
              `<span class="friend-request-success">${icon('checkCircle')} Freunde!</span>`;
            setTimeout(wegblenden, 1500);
          } catch (err) {
            btn.textContent = '✓ Annehmen';
            btn.disabled = false;
          }
        });

        card.querySelector('[data-decline]').addEventListener('click', async (ev) => {
          ev.stopPropagation();
          ev.target.disabled = true;
          try {
            await sb.declineFriendRequest(req.id);
            wegblenden();
          } catch (err) {
            ev.target.disabled = false;
          }
        });

        list.appendChild(card);
      });
    } catch (e) {
      // Nur der Hinweispunkt an der Navigation – nicht blockierend
      console.error('[Freundschaftsanfragen laden]', e);
    }
  })();
}

function formatTimeAgo(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const diffMs = new Date() - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'Gerade eben';
  if (diffMin < 60) return `vor ${diffMin} Min.`;
  if (diffHours < 24) return `vor ${diffHours} Std.`;
  if (diffDays === 1) return 'Gestern';
  if (diffDays < 7) return `vor ${diffDays} Tagen`;
  return date.toLocaleDateString('de-DE', { day: 'numeric', month: 'short' });
}
