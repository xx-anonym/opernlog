// Auth-Seite – Anmelden & Registrieren, beides ohne Passwort.
//
// Wer sich anmeldet oder registriert, bekommt einen Einmalcode per E-Mail
// und tippt ihn hier ein (siehe src/anmeldecode.js und codeAnfordern() in
// src/store/supabase.js). Daneben bleiben Google und Passkey.
import { isSupabaseConfigured } from '../config.js';
import { brandMarkSVG } from '../data/brandMark.js';
import * as sb from '../store/supabase.js';
import { store } from '../store/store.js';
import { profileIcons } from '../data/profileIcons.js';
import { codeLesen, codeVollstaendig, codeOffen, codeOffenMerken, codeOffenVergessen, NEU_SENDEN_NACH_MS } from '../anmeldecode.js';
import { passkeyAnmeldungAnbieten, passkeyVermerken, passkeyFehlertext } from '../passkey.js';
import { icon } from '../components/Icon.js';
import { authFehlertext, escapeHTML } from '../utils.js';

// ── E-Mail-Validierung ──────────────────────────────────
const BLOCKED_DOMAINS = [
  'example.com', 'example.org', 'example.net',
  'test.com', 'test.org', 'test.de',
  'mailinator.com', 'guerrillamail.com', 'tempmail.com',
  'throwaway.email', 'yopmail.com', 'sharklasers.com',
  'guerrillamailblock.com', 'grr.la', 'dispostable.com',
  'trashmail.com', 'trashmail.de', 'fakeinbox.com',
  'mailnesia.com', 'maildrop.cc', 'temp-mail.org',
  'mohmal.com', 'getnada.com',
  'localhost', 'invalid.com',
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validateEmail(email) {
  if (!email || !email.trim()) {
    return { valid: false, error: 'Bitte gib eine E-Mail-Adresse ein.' };
  }
  const trimmed = email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(trimmed)) {
    return { valid: false, error: 'Bitte gib eine gültige E-Mail-Adresse ein (z.B. name@anbieter.de).' };
  }
  const domain = trimmed.split('@')[1];
  if (BLOCKED_DOMAINS.includes(domain)) {
    return { valid: false, error: 'Diese E-Mail-Domain ist nicht erlaubt. Bitte verwende eine echte E-Mail-Adresse.' };
  }
  return { valid: true, error: null };
}

export function AuthPage(onSuccess) {
  const page = document.createElement('div');
  page.className = 'page auth-page fade-in';

  const configured = isSupabaseConfigured();

  page.innerHTML = `
    <div class="auth-container">
      <div class="auth-header">
        <span class="auth-logo">${brandMarkSVG()}</span>
        <h1>OpernLog</h1>
        <p class="auth-subtitle">Dein persönliches Operntagebuch</p>
      </div>

      ${!configured ? `
        <div class="auth-notice">
          <p>${icon('alert', { className: 'icon--meta' })}Supabase ist nicht konfiguriert. Bitte trage die Credentials in <code>src/config.js</code> ein.</p>
        </div>
      ` : `
        <div class="auth-tabs">
          <button class="auth-tab auth-tab--active" data-tab="login">Anmelden</button>
          <button class="auth-tab" data-tab="register">Registrieren</button>
        </div>

        <form id="loginForm" class="auth-form">
          <div class="form-group">
            <label class="form-label" for="loginEmail">E-Mail</label>
            <input type="email" class="input" id="loginEmail" autocomplete="email" placeholder="deine@email.de" required />
          </div>
          <p class="form-hint auth-code-hinweis">Ohne Passwort: du bekommst einen Code per E-Mail.</p>
          <div id="loginError" class="auth-error" style="display:none"></div>
          <button type="submit" class="btn btn--primary btn--lg btn--full" id="loginSubmitBtn">
            <span class="btn__text">Code zuschicken</span>
            <span class="btn__loading" style="display:none"><span class="spinner--sm"></span> Code wird verschickt…</span>
          </button>
          <div class="auth-divider"><span>oder</span></div>
          <button type="button" class="btn btn--google btn--lg btn--full" id="googleSignInBtn">
            <svg viewBox="0 0 24 24" width="20" height="20"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Mit Google anmelden
          </button>
          ${passkeyAnmeldungAnbieten() ? `
          <button type="button" class="btn btn--outline btn--lg btn--full" id="passkeySignInBtn">
            ${icon('key')}Mit Passkey anmelden
          </button>
          ` : ''}
        </form>

        <form id="codeForm" class="auth-form" style="display:none">
          <p class="auth-reset-info" id="codeInfo"></p>
          <div class="form-group">
            <label class="form-label" for="codeInput">Code aus der E-Mail</label>
            <input type="text" class="input auth-code" id="codeInput" inputmode="numeric" pattern="[0-9 ]*"
              autocomplete="one-time-code" maxlength="12" placeholder="••••••" required />
          </div>
          <div id="codeError" class="auth-error" style="display:none"></div>
          <button type="submit" class="btn btn--primary btn--lg btn--full" id="codeSubmitBtn">
            <span class="btn__text">Anmelden</span>
            <span class="btn__loading" style="display:none"><span class="spinner--sm"></span> Wird geprüft…</span>
          </button>
          <button type="button" class="auth-forgot-link" id="codeNeuBtn">Neuen Code senden</button>
          <button type="button" class="auth-forgot-link" id="codeZurueckBtn">← Andere E-Mail-Adresse</button>
        </form>

        <form id="registerForm" class="auth-form" style="display:none">
          <div class="form-group">
            <label class="form-label" for="regUsername">Benutzername</label>
            <input type="text" class="input" id="regUsername" autocomplete="nickname" placeholder="z.B. Opernfan42" required minlength="3" />
          </div>
          <div class="form-group">
            <label class="form-label" for="regEmail">E-Mail</label>
            <input type="email" class="input" id="regEmail" autocomplete="email" placeholder="deine@email.de" required />
          </div>
          <p class="form-hint auth-code-hinweis">Ein Passwort brauchst du nicht: zur Bestätigung schicken wir dir einen Code.</p>
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
      <a class="rechtstext-link" href="#/datenschutz">Datenschutz</a>
    </div>
  `;

  if (!configured) return page;

  // Tab switching
  const showForm = (formName) => {
    page.querySelector('#loginForm').style.display = formName === 'login' ? 'flex' : 'none';
    page.querySelector('#registerForm').style.display = formName === 'register' ? 'flex' : 'none';
    page.querySelector('#codeForm').style.display = formName === 'code' ? 'flex' : 'none';
    // Beim Code geht es nur noch um den Code – die Reiter lenkten davon ab.
    const tabBar = page.querySelector('.auth-tabs');
    if (tabBar) tabBar.style.display = formName === 'code' ? 'none' : 'flex';
  };

  page.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      page.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('auth-tab--active'));
      tab.classList.add('auth-tab--active');
      showForm(tab.dataset.tab);
    });
  });

  // ── Der Schritt mit dem Code ────────────────────────────────────────
  //
  // Nach "Code zuschicken" oder "Registrieren". `offen` sagt, an welche
  // Adresse der Code ging und ob dabei ein Konto entstehen sollte – für
  // "Neuen Code senden" und für die Beschriftung.
  const codeInput = page.querySelector('#codeInput');
  const codeError = page.querySelector('#codeError');
  const codeSubmit = page.querySelector('#codeSubmitBtn');
  const codeNeu = page.querySelector('#codeNeuBtn');
  let offen = null;
  let neuTimer = null;

  const zeigeCodeFehler = (text) => {
    codeError.textContent = text;
    codeError.style.display = text ? 'block' : 'none';
  };

  /** "Neuen Code senden" erst wieder nach einer Minute – so lange nimmt Supabase keinen Auftrag an. */
  function neuSendenSperren(seit) {
    clearInterval(neuTimer);
    const zeige = () => {
      const rest = Math.ceil((seit + NEU_SENDEN_NACH_MS - Date.now()) / 1000);
      if (rest <= 0 || !page.isConnected) {
        clearInterval(neuTimer);
        codeNeu.disabled = false;
        codeNeu.textContent = 'Neuen Code senden';
        return;
      }
      codeNeu.disabled = true;
      codeNeu.textContent = `Neuen Code senden (in ${rest} s)`;
    };
    // Erst anzeigen, dann takten: beim ersten Aufruf hängt die Seite noch nicht im Dokument.
    const rest = Math.ceil((seit + NEU_SENDEN_NACH_MS - Date.now()) / 1000);
    codeNeu.disabled = rest > 0;
    codeNeu.textContent = rest > 0 ? `Neuen Code senden (in ${rest} s)` : 'Neuen Code senden';
    if (rest > 0) neuTimer = setInterval(zeige, 1000);
  }

  function zeigeCodeSchritt(stand) {
    offen = stand;
    page.querySelector('#codeInfo').innerHTML =
      `Wir haben einen Code an <strong>${escapeHTML(stand.email)}</strong> geschickt. Gib ihn hier ein.`;
    codeSubmit.querySelector('.btn__text').textContent = stand.neu ? 'Konto bestätigen' : 'Anmelden';
    codeInput.value = '';
    zeigeCodeFehler('');
    neuSendenSperren(stand.seit);
    showForm('code');
    codeInput.focus({ preventScroll: true });
  }

  async function codeEinloesen() {
    const code = codeLesen(codeInput.value);
    if (!codeVollstaendig(code)) {
      zeigeCodeFehler('Der Code hat sechs Ziffern.');
      return;
    }
    if (codeSubmit.disabled) return;
    zeigeCodeFehler('');
    const btnText = codeSubmit.querySelector('.btn__text');
    const btnLoading = codeSubmit.querySelector('.btn__loading');
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline-flex';
    codeSubmit.disabled = true;
    try {
      await sb.codeEinloesen(offen.email, code);
      codeOffenVergessen();
      await store.refreshSession();
      if (onSuccess) onSuccess();
      else window.location.hash = '#/';
    } catch (err) {
      zeigeCodeFehler(authFehlertext(err));
      btnText.style.display = 'inline';
      btnLoading.style.display = 'none';
      codeSubmit.disabled = false;
      codeInput.select();
    }
  }

  page.querySelector('#codeForm').addEventListener('submit', (e) => { e.preventDefault(); codeEinloesen(); });

  // Mit der sechsten Ziffer ist der Code vollständig und wird gleich
  // eingelöst – getippt, eingefügt oder vom iPhone aus der Mail
  // vorgeschlagen. Der Knopf bleibt für alle, die lieber selbst abschicken.
  codeInput.addEventListener('input', () => {
    if (codeVollstaendig(codeInput.value)) codeEinloesen();
  });

  codeNeu.addEventListener('click', async () => {
    if (!offen || codeNeu.disabled) return;
    codeNeu.disabled = true;
    zeigeCodeFehler('');
    try {
      await sb.codeAnfordern(offen.email, offen.neu ? { neu: offen.neu } : {});
      const stand = { ...offen, seit: Date.now() };
      codeOffenMerken(stand.email, { neu: stand.neu, jetzt: stand.seit });
      offen = stand;
      neuSendenSperren(stand.seit);
    } catch (err) {
      zeigeCodeFehler(authFehlertext(err));
      codeNeu.disabled = false;
    }
  });

  page.querySelector('#codeZurueckBtn').addEventListener('click', () => {
    clearInterval(neuTimer);
    const war = offen;
    offen = null;
    codeOffenVergessen();
    const tab = war?.neu ? 'register' : 'login';
    page.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('auth-tab--active', t.dataset.tab === tab));
    showForm(tab);
  });

  /** Den Code anfordern und zum Schritt mit dem Code wechseln. */
  async function codeSchicken(email, neu) {
    await sb.codeAnfordern(email, neu ? { neu } : {});
    const stand = { email: email.trim(), neu: neu || null, seit: Date.now() };
    codeOffenMerken(stand.email, { neu: stand.neu, jetzt: stand.seit });
    zeigeCodeSchritt(stand);
  }

  // Google sign-in
  page.querySelector('#googleSignInBtn').addEventListener('click', async () => {
    const errorEl = page.querySelector('#loginError');
    errorEl.style.display = 'none';
    try {
      await sb.signInWithGoogle();
      // OAuth redirects the user, so no further action needed here
    } catch (err) {
      errorEl.textContent = 'Google-Anmeldung fehlgeschlagen: ' + err.message;
      errorEl.style.display = 'block';
    }
  });

  // Passkey. Kein Formular, keine E-Mail: der Dialog des Systems fragt nach
  // Gesicht, Finger oder Geräte-PIN und liefert das Konto gleich mit.
  const passkeyBtn = page.querySelector('#passkeySignInBtn');
  if (passkeyBtn) {
    passkeyBtn.addEventListener('click', async () => {
      const errorEl = page.querySelector('#loginError');
      errorEl.style.display = 'none';
      passkeyBtn.disabled = true;
      try {
        const { user } = await sb.signInWithPasskey();
        passkeyVermerken(user?.id, true);
        await store.refreshSession();
        if (onSuccess) onSuccess();
        else window.location.hash = '#/';
      } catch (err) {
        console.error('Passkey-Anmeldung', err);
        const text = passkeyFehlertext(err, 'anmelden');
        if (text) {
          errorEl.textContent = text;
          errorEl.style.display = 'block';
        }
      } finally {
        passkeyBtn.disabled = false;
      }
    });
  }

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
    const errorEl = page.querySelector('#loginError');
    const submitBtn = page.querySelector('#loginSubmitBtn');
    const btnText = submitBtn.querySelector('.btn__text');
    const btnLoading = submitBtn.querySelector('.btn__loading');
    errorEl.style.display = 'none';

    const check = validateEmail(email);
    if (!check.valid) {
      errorEl.textContent = check.error;
      errorEl.style.display = 'block';
      return;
    }

    // Show loading state
    btnText.style.display = 'none';
    btnLoading.style.display = 'inline-flex';
    submitBtn.disabled = true;

    try {
      await codeSchicken(email, null);
    } catch (err) {
      errorEl.textContent = authFehlertext(err);
      errorEl.style.display = 'block';
    } finally {
      btnText.style.display = 'inline';
      btnLoading.style.display = 'none';
      submitBtn.disabled = false;
    }
  });

  // Register
  page.querySelector('#registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = page.querySelector('#regUsername').value;
    const email = page.querySelector('#regEmail').value;
    const errorEl = page.querySelector('#regError');
    const submitBtn = page.querySelector('#registerForm button[type="submit"]');
    errorEl.style.display = 'none';
    errorEl.style.color = '';

    const check = validateEmail(email);
    if (!check.valid) {
      errorEl.textContent = check.error;
      errorEl.style.display = 'block';
      return;
    }

    if (username.trim().length < 3) {
      errorEl.textContent = 'Bitte wähle einen Benutzernamen mit mindestens 3 Zeichen.';
      errorEl.style.display = 'block';
      return;
    }

    submitBtn.textContent = 'Code wird verschickt…';
    submitBtn.disabled = true;

    try {
      const activeIconBtn = page.querySelector('#regIconPicker .icon-picker__option--active');
      const avatarIcon = activeIconBtn ? activeIconBtn.dataset.icon : '';
      await codeSchicken(email, { username: username.trim(), avatarIcon });
    } catch (err) {
      errorEl.textContent = authFehlertext(err);
      errorEl.style.display = 'block';
    } finally {
      submitBtn.textContent = 'Registrieren';
      submitBtn.disabled = false;
    }
  });

  // Aus dem Mailprogramm zurück, und die App hat neu geladen: der Code von
  // eben braucht sein Feld wieder.
  const nochOffen = codeOffen();
  if (nochOffen) zeigeCodeSchritt(nochOffen);

  return page;
}
