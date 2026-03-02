// Invite-Seite – Einladungslinks generieren & akzeptieren
import * as sb from '../store/supabase.js';
import { getSession } from '../store/supabase.js';
import { store } from '../store/store.js';
import { AuthPage } from './Auth.js';

export function InvitePage(code) {
  const page = document.createElement('div');
  page.className = 'page invite-page fade-in';

  if (code) {
    // Accepting an invite – check auth first
    initAcceptFlow(page, code);
  } else {
    // Generating an invite
    renderGenerateInvite(page);
  }

  return page;
}

async function initAcceptFlow(page, code) {
  const session = await getSession();

  if (session) {
    // Logged in → accept directly
    renderAcceptInvite(page, code);
  } else {
    // Not logged in → show auth form with invite context, then accept
    renderAuthThenAccept(page, code);
  }
}

function renderAuthThenAccept(page, code) {
  // Show a header explaining the invite, then the full auth form below
  const header = document.createElement('div');
  header.className = 'invite-auth-header';
  header.innerHTML = `
      <div class="auth-container" style="margin-bottom: 0; padding-bottom: 0;">
        <div style="text-align:center; margin-bottom: 1rem;">
          <span style="font-size: 3rem;">🎭</span>
          <h2 style="margin: 0.5rem 0;">Du wurdest eingeladen!</h2>
          <p class="text-muted">Melde dich an oder erstelle ein Konto, um die Einladung anzunehmen.</p>
        </div>
      </div>
    `;
  page.appendChild(header);

  // Render the standard AuthPage with a callback that processes the invite
  const authPage = AuthPage(async () => {
    await store.refreshSession();
    // Clear and show invite processing
    page.innerHTML = '';
    renderAcceptInvite(page, code);
  });

  page.appendChild(authPage);
}

async function renderAcceptInvite(page, code) {
  page.innerHTML = `
    <div class="auth-container">
      <div class="auth-header">
        <span class="auth-logo">🎭</span>
        <h1>Einladung</h1>
        <p class="auth-subtitle">Du wurdest zu OpernLog eingeladen!</p>
      </div>
      <div class="invite-status">
        <div class="spinner"></div>
        <p>Einladung wird verarbeitet...</p>
      </div>
    </div>
  `;

  try {
    const result = await sb.acceptInvite(code);
    const statusEl = page.querySelector('.invite-status');

    if (result.success) {
      statusEl.innerHTML = `
        <div class="invite-success">
          <span style="font-size: 3rem">🎉</span>
          <h2>Verbunden!</h2>
          <p>Du folgst jetzt <strong>${result.friend?.username || 'deinem Freund'}</strong> und sie/er folgt dir.</p>
          <a href="#/community" class="btn btn--primary btn--lg">Zu Freunde</a>
        </div>
      `;
    } else {
      statusEl.innerHTML = `
        <div class="invite-error">
          <span style="font-size: 3rem">❌</span>
          <h2>Fehler</h2>
          <p>${result.error}</p>
          <a href="#/" class="btn btn--primary btn--lg">Zur Startseite</a>
        </div>
      `;
    }
  } catch (err) {
    console.error('Accept invite error:', err);
    page.querySelector('.invite-status').innerHTML = `
      <div class="invite-error">
        <span style="font-size: 3rem">❌</span>
        <h2>Fehler</h2>
        <p>${err.message}</p>
        <a href="#/" class="btn btn--primary btn--lg">Zur Startseite</a>
      </div>
    `;
  }
}

async function renderGenerateInvite(page) {
  page.innerHTML = `
    <div class="page-header">
      <h1 class="page-header__title">🔗 Freunde einladen</h1>
      <p class="page-header__subtitle">Teile deinen persönlichen Einladungslink</p>
    </div>

    <div class="invite-card">
      <div class="invite-card__icon">✉️</div>
      <h2>Einladungslink erstellen</h2>
      <p class="text-muted">Erstelle einen Link und teile ihn mit Freunden. Sie können damit sofort deinem Profil folgen.</p>
      <button id="generateBtn" class="btn btn--primary btn--lg">Link erstellen</button>
      
      <div id="inviteResult" style="display:none">
        <div class="invite-link-box">
          <input type="text" id="inviteLink" readonly class="invite-link-input" />
          <button id="copyBtn" class="btn btn--accent">📋 Kopieren</button>
        </div>
        <p class="invite-hint">📲 Der Link ist 30 Tage gültig</p>
      </div>
    </div>

    <div class="invite-info">
      <h3>So funktioniert's</h3>
      <div class="invite-steps">
        <div class="invite-step">
          <span class="invite-step__number">1</span>
          <p>Erstelle einen Einladungslink</p>
        </div>
        <div class="invite-step">
          <span class="invite-step__number">2</span>
          <p>Teile ihn per WhatsApp, E-Mail oder SMS</p>
        </div>
        <div class="invite-step">
          <span class="invite-step__number">3</span>
          <p>Dein Freund registriert sich und ihr folgt euch automatisch</p>
        </div>
      </div>
    </div>
  `;

  page.querySelector('#generateBtn').addEventListener('click', async () => {
    const btn = page.querySelector('#generateBtn');
    btn.disabled = true;
    btn.textContent = 'Wird erstellt...';

    try {
      const code = await sb.createInvite();
      if (!code) {
        btn.textContent = 'Fehler – nicht eingeloggt';
        btn.disabled = false;
        return;
      }
      const baseUrl = window.location.origin + window.location.pathname;
      const link = `${baseUrl}#/invite/${code}`;

      page.querySelector('#inviteLink').value = link;
      page.querySelector('#inviteResult').style.display = 'block';
      btn.textContent = '✅ Link erstellt!';

      // Copy handler
      page.querySelector('#copyBtn').addEventListener('click', () => {
        navigator.clipboard.writeText(link).then(() => {
          page.querySelector('#copyBtn').textContent = '✅ Kopiert!';
          setTimeout(() => {
            page.querySelector('#copyBtn').textContent = '📋 Kopieren';
          }, 2000);
        });
      });
    } catch (err) {
      btn.textContent = 'Fehler – nochmal versuchen';
      btn.disabled = false;
      console.error('Create invite error:', err);
      // Show error message on page
      let errDiv = page.querySelector('.invite-error-msg');
      if (!errDiv) {
        errDiv = document.createElement('p');
        errDiv.className = 'invite-error-msg';
        errDiv.style.cssText = 'color: #ff6b6b; margin-top: 1rem; font-size: 0.9rem;';
        btn.parentNode.insertBefore(errDiv, btn.nextSibling);
      }
      errDiv.textContent = '⚠️ ' + (err.message || 'Unbekannter Fehler');
    }
  });
}
