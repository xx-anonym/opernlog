// Auth-Seite – Login & Registrierung
import { isSupabaseConfigured } from '../config.js';
import * as sb from '../store/supabase.js';
import { profileIcons } from '../data/profileIcons.js';

export function AuthPage(onSuccess) {
  const page = document.createElement('div');
  page.className = 'page auth-page fade-in';

  const configured = isSupabaseConfigured();

  page.innerHTML = `
    <div class="auth-container">
      <div class="auth-header">
        <span class="auth-logo">🎭</span>
        <h1>OpernLog</h1>
        <p class="auth-subtitle">Dein persönliches Operntagebuch</p>
      </div>

      ${!configured ? `
        <div class="auth-notice">
          <p>⚠️ Supabase ist nicht konfiguriert. Bitte trage die Credentials in <code>src/config.js</code> ein.</p>
        </div>
      ` : `
        <div class="auth-tabs">
          <button class="auth-tab auth-tab--active" data-tab="login">Anmelden</button>
          <button class="auth-tab" data-tab="register">Registrieren</button>
        </div>

        <form id="loginForm" class="auth-form">
          <div class="form-group">
            <label for="loginEmail">E-Mail</label>
            <input type="email" id="loginEmail" placeholder="deine@email.de" required />
          </div>
          <div class="form-group">
            <label for="loginPassword">Passwort</label>
            <input type="password" id="loginPassword" placeholder="••••••••" required minlength="6" />
          </div>
          <div id="loginError" class="auth-error" style="display:none"></div>
          <button type="submit" class="btn btn--primary btn--lg btn--full">Anmelden</button>
        </form>

        <form id="registerForm" class="auth-form" style="display:none">
          <div class="form-group">
            <label for="regUsername">Benutzername</label>
            <input type="text" id="regUsername" placeholder="z.B. Opernfan42" required minlength="3" />
          </div>
          <div class="form-group">
            <label for="regEmail">E-Mail</label>
            <input type="email" id="regEmail" placeholder="deine@email.de" required />
          </div>
          <div class="form-group">
            <label for="regPassword">Passwort</label>
            <input type="password" id="regPassword" placeholder="Min. 6 Zeichen" required minlength="6" />
          </div>
          <div class="form-group">
            <label class="form-label">Profilbild wählen</label>
            <div class="icon-picker" id="regIconPicker">
              <button type="button" class="icon-picker__option icon-picker__option--none icon-picker__option--active" data-icon="" title="Kein Icon">✕</button>
              ${Object.entries(profileIcons).map(([key, icon]) => `
                <button type="button" class="icon-picker__option" data-icon="${key}" title="${icon.label}">
                  ${icon.svg}
                </button>
              `).join('')}
            </div>
          </div>
          <div id="regError" class="auth-error" style="display:none"></div>
          <button type="submit" class="btn btn--primary btn--lg btn--full">Registrieren</button>
        </form>
      `}
    </div>
  `;

  if (!configured) return page;

  // Tab switching
  page.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      page.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('auth-tab--active'));
      tab.classList.add('auth-tab--active');
      const isLogin = tab.dataset.tab === 'login';
      page.querySelector('#loginForm').style.display = isLogin ? 'flex' : 'none';
      page.querySelector('#registerForm').style.display = isLogin ? 'none' : 'flex';
    });
  });

  // Icon picker click handling
  const regIconPicker = page.querySelector('#regIconPicker');
  if (regIconPicker) {
    regIconPicker.addEventListener('click', (e) => {
      const btn = e.target.closest('.icon-picker__option');
      if (!btn) return;
      regIconPicker.querySelectorAll('.icon-picker__option').forEach(b => b.classList.remove('icon-picker__option--active'));
      btn.classList.add('icon-picker__option--active');
    });
  }

  // Login
  page.querySelector('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = page.querySelector('#loginEmail').value;
    const password = page.querySelector('#loginPassword').value;
    const errorEl = page.querySelector('#loginError');
    errorEl.style.display = 'none';

    try {
      await sb.signIn(email, password);
      if (onSuccess) onSuccess();
      else window.location.hash = '#/';
    } catch (err) {
      errorEl.textContent = err.message === 'Invalid login credentials'
        ? 'Ungültige Anmeldedaten'
        : err.message;
      errorEl.style.display = 'block';
    }
  });

  // Register
  page.querySelector('#registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = page.querySelector('#regUsername').value;
    const email = page.querySelector('#regEmail').value;
    const password = page.querySelector('#regPassword').value;
    const errorEl = page.querySelector('#regError');
    errorEl.style.display = 'none';

    try {
      const activeIconBtn = page.querySelector('#regIconPicker .icon-picker__option--active');
      const avatarIcon = activeIconBtn ? activeIconBtn.dataset.icon : '';
      const data = await sb.signUp(email, password, username, avatarIcon);
      // Auto-login after successful registration
      try {
        await sb.signIn(email, password);
        if (onSuccess) onSuccess();
        else window.location.hash = '#/';
      } catch (loginErr) {
        // If auto-login fails (e.g. email confirmation required), show success message
        errorEl.style.display = 'block';
        errorEl.style.color = 'var(--accent)';
        errorEl.textContent = '✅ Registrierung erfolgreich! Bitte bestätige deine E-Mail und melde dich dann an.';
        setTimeout(() => {
          page.querySelector('[data-tab="login"]').click();
          page.querySelector('#loginEmail').value = email;
        }, 2000);
      }
    } catch (err) {
      errorEl.textContent = err.message.includes('already registered')
        ? 'Diese E-Mail ist bereits registriert'
        : err.message;
      errorEl.style.display = 'block';
    }
  });

  return page;
}
