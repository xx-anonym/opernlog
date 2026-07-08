// ProfileSetup – Wird nach Google-Signup angezeigt
import { profileIcons } from '../data/profileIcons.js';
import * as sb from '../store/supabase.js';

export function ProfileSetupPage(session, onComplete) {
    const page = document.createElement('div');
    page.className = 'page profile-setup-page fade-in';

    // Determine default username from Google metadata
    const meta = session.user?.user_metadata || {};
    const googleName = meta.full_name || meta.name || '';
    const emailPrefix = session.user?.email?.split('@')[0] || '';
    const defaultUsername = googleName || emailPrefix || '';

    page.innerHTML = `
    <div class="auth-container profile-setup-container">
        <div class="auth-header">
            <span class="auth-logo">🎭</span>
            <h1>Willkommen bei OpernLog!</h1>
            <p class="auth-subtitle">Richte dein Profil ein, bevor es losgeht.</p>
        </div>

        <form id="profileSetupForm" class="auth-form">
            <div class="form-group">
                <label for="setupUsername">Benutzername</label>
                <input type="text" id="setupUsername" placeholder="z.B. Opernfan42" required minlength="3" value="${defaultUsername}" />
                <span class="form-hint">Dieser Name wird anderen Nutzern angezeigt.</span>
            </div>

            <div class="form-group">
                <label class="form-label">Profilbild wählen</label>
                <div class="icon-picker" id="setupIconPicker">
                    <button type="button" class="icon-picker__option icon-picker__option--none icon-picker__option--active" data-icon="" title="Kein Icon">✕</button>
                    ${Object.entries(profileIcons).map(([key, icon]) => `
                        <button type="button" class="icon-picker__option" data-icon="${key}" title="${icon.label}">
                            ${icon.svg}
                        </button>
                    `).join('')}
                </div>
            </div>

            <div id="setupError" class="auth-error" style="display:none"></div>
            <button type="submit" class="btn btn--primary btn--lg btn--full">
                <span class="setup-btn-text">Profil speichern & loslegen</span>
                <span class="setup-btn-loading" style="display:none">Wird gespeichert…</span>
            </button>
        </form>
    </div>
    `;

    // Icon picker click handling
    const iconPicker = page.querySelector('#setupIconPicker');
    iconPicker.addEventListener('click', (e) => {
        const btn = e.target.closest('.icon-picker__option');
        if (!btn) return;
        iconPicker.querySelectorAll('.icon-picker__option').forEach(b => b.classList.remove('icon-picker__option--active'));
        btn.classList.add('icon-picker__option--active');
    });

    // Form submit
    page.querySelector('#profileSetupForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = page.querySelector('#setupUsername').value.trim();
        const errorEl = page.querySelector('#setupError');
        const btnText = page.querySelector('.setup-btn-text');
        const btnLoading = page.querySelector('.setup-btn-loading');
        const submitBtn = page.querySelector('button[type="submit"]');
        errorEl.style.display = 'none';

        if (!username || username.length < 3) {
            errorEl.textContent = 'Bitte wähle einen Benutzernamen mit mindestens 3 Zeichen.';
            errorEl.style.display = 'block';
            return;
        }

        // Show loading state
        btnText.style.display = 'none';
        btnLoading.style.display = 'inline';
        submitBtn.disabled = true;

        try {
            const activeIconBtn = iconPicker.querySelector('.icon-picker__option--active');
            const avatarIcon = activeIconBtn ? activeIconBtn.dataset.icon : '';
            const initials = username.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

            const supabase = sb.getSupabase();

            // Update profile with chosen username, icon, and mark as complete
            const { error } = await supabase.from('profiles').upsert({
                id: session.user.id,
                username,
                avatar_initials: initials,
                avatar_icon: avatarIcon,
                profile_complete: true,
            }, { onConflict: 'id' });

            if (error) {
                if (error.message?.includes('unique') || error.message?.includes('duplicate')) {
                    throw new Error('Dieser Benutzername ist bereits vergeben. Bitte wähle einen anderen.');
                }
                throw error;
            }

            // Success animation before transitioning
            submitBtn.classList.add('btn--success');
            btnLoading.style.display = 'none';
            btnText.style.display = 'inline';
            btnText.textContent = '✓ Los geht\u2019s!';
            
            // Brief pause to show success, then hand off to main app
            setTimeout(() => {
                if (onComplete) onComplete();
            }, 800);
        } catch (err) {
            errorEl.textContent = err.message || 'Fehler beim Speichern des Profils.';
            errorEl.style.display = 'block';
            btnText.style.display = 'inline';
            btnText.textContent = 'Profil speichern & loslegen';
            btnLoading.style.display = 'none';
            submitBtn.disabled = false;
        }
    });

    return page;
}
