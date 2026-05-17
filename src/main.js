// Main App – Router & Entry Point
import { Navigation } from './components/Navigation.js';
import { HomePage } from './pages/Home.js';
import { HousesPage } from './pages/Houses.js';
import { HouseDetailPage } from './pages/HouseDetail.js';
import { OperasPage } from './pages/Operas.js';
import { OperaDetailPage } from './pages/OperaDetail.js';
import { LogVisitPage } from './pages/LogVisit.js';
import { DiaryPage } from './pages/Diary.js';
import { VisitDetailPage } from './pages/VisitDetail.js';
import { ProfilePage } from './pages/Profile.js';
import { ListsPage } from './pages/Lists.js';
import { ListDetailPage } from './pages/ListDetail.js';
import { WishlistPage } from './pages/Wishlist.js';
import { CommunityPage } from './pages/Community.js';
import { AuthPage } from './pages/Auth.js';
import { ProfileSetupPage } from './pages/ProfileSetup.js';
import { InvitePage } from './pages/Invite.js';
import { store } from './store/store.js';
import { isSupabaseConfigured } from './config.js';
import { getSession, getSupabase, waitForInitialSession, isProfileComplete } from './store/supabase.js';

class App {
    constructor() {
        if ('scrollRestoration' in history) {
            history.scrollRestoration = 'manual';
        }
        this.root = document.getElementById('app');
        this._splashStart = Date.now();
        this.init();
    }

    // Dismiss the opera curtain splash screen
    dismissSplash() {
        const splash = document.getElementById('splash');
        if (!splash) return;

        // Ensure the splash is shown for at least 800ms so the animation is visible
        const elapsed = Date.now() - this._splashStart;
        const delay = Math.max(0, 800 - elapsed);

        setTimeout(() => {
            splash.classList.add('splash--hidden');
            // Remove from DOM after all transitions complete
            // (curtains 1s + fade 0.4s delayed 0.7s = ~1.5s total)
            setTimeout(() => splash.remove(), 1600);
        }, delay);
    }

    async init() {
        if (isSupabaseConfigured()) {
            const handled = await this.handleAuthHash();
            if (handled) {
                this.dismissSplash();
                return;
            }

            // Wait for Supabase to determine the initial session
            // (handles OAuth redirects, existing sessions, etc.)
            const initialSession = await waitForInitialSession();
            if (initialSession) {
                await store.refreshSession();

                // Check if this is a new Google user who needs to set up their profile
                const profileDone = await isProfileComplete(initialSession.user.id);
                if (!profileDone) {
                    this.showProfileSetup(initialSession);
                    this.dismissSplash();
                    return;
                }
            }
        }
        this.buildLayout();
        this.dismissSplash();
    }

    async handleAuthHash() {
        const hash = window.location.hash;
        if (!hash) return false;

        // Check for Supabase error params (e.g. expired OTP)
        if (hash.includes('error=') && hash.includes('error_code=')) {
            // Clear the hash so the router doesn't choke on it
            window.location.hash = '#/auth';
            return false;
        }

        // Check for recovery tokens (access_token + type=recovery)
        if (hash.includes('access_token=') && hash.includes('type=recovery')) {
            const params = new URLSearchParams(hash.substring(1));
            const accessToken = params.get('access_token');
            const refreshToken = params.get('refresh_token');

            if (accessToken && refreshToken) {
                try {
                    const sb = getSupabase();
                    await sb.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
                    // Clear the hash
                    window.location.hash = '';
                    // Show password update UI
                    this.showPasswordUpdate();
                    return true;
                } catch (e) {
                    console.warn('Recovery session failed:', e);
                    window.location.hash = '#/auth';
                }
            }
        }

        return false;
    }

    showPasswordUpdate() {
        this.root.innerHTML = `
            <div class="page auth-page fade-in" style="display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px;">
                <div class="auth-container">
                    <div class="auth-header">
                        <span class="auth-logo">🔑</span>
                        <h1>Neues Passwort</h1>
                        <p class="auth-subtitle">Gib dein neues Passwort ein.</p>
                    </div>
                    <form id="updatePasswordForm" class="auth-form">
                        <div class="form-group">
                            <label for="newPassword">Neues Passwort</label>
                            <input type="password" id="newPassword" placeholder="Min. 6 Zeichen" required minlength="6" />
                        </div>
                        <div class="form-group">
                            <label for="confirmPassword">Passwort bestätigen</label>
                            <input type="password" id="confirmPassword" placeholder="Passwort wiederholen" required minlength="6" />
                        </div>
                        <div id="updateError" class="auth-error" style="display:none"></div>
                        <div id="updateSuccess" class="auth-success" style="display:none"></div>
                        <button type="submit" class="btn btn--primary btn--lg btn--full">Passwort ändern</button>
                    </form>
                </div>
            </div>
        `;

        this.root.querySelector('#updatePasswordForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const password = this.root.querySelector('#newPassword').value;
            const confirm = this.root.querySelector('#confirmPassword').value;
            const errorEl = this.root.querySelector('#updateError');
            const successEl = this.root.querySelector('#updateSuccess');
            errorEl.style.display = 'none';
            successEl.style.display = 'none';

            if (password !== confirm) {
                errorEl.textContent = 'Die Passwörter stimmen nicht überein.';
                errorEl.style.display = 'block';
                return;
            }

            try {
                const sb = getSupabase();
                const { error } = await sb.auth.updateUser({ password });
                if (error) throw error;

                successEl.textContent = '✅ Passwort erfolgreich geändert! Du wirst weitergeleitet...';
                successEl.style.display = 'block';
                this.root.querySelector('button[type="submit"]').disabled = true;

                setTimeout(() => {
                    window.location.hash = '#/';
                    window.location.reload();
                }, 2000);
            } catch (err) {
                errorEl.textContent = err.message;
                errorEl.style.display = 'block';
            }
        });
    }

    showProfileSetup(session) {
        this.root.innerHTML = '';
        const setupPage = ProfileSetupPage(session, () => {
            // Profile setup complete — reload the app
            store.refreshSession().then(() => {
                window.location.hash = '#/';
                this.buildLayout();
            });
        });
        this.root.appendChild(setupPage);
    }

    buildLayout() {
        this.root.innerHTML = '';

        const nav = Navigation();
        this.root.appendChild(nav);

        this.content = document.createElement('main');
        this.content.className = 'main-content';
        this.root.appendChild(this.content);

        // Listen for hash changes
        window.addEventListener('hashchange', () => this.route());
        this.route();
    }

    route() {
        // e.g. #/log?edit=123
        const hash = window.location.hash || '#/';
        const withoutHash = hash.slice(2); // "log?edit=123"

        // Separate query string from the path
        const [fullPath, queryString] = withoutHash.split('?');
        const [path, ...rest] = fullPath.split('/');
        const param = rest.join('/');

        // Parse query params
        const params = {};
        if (queryString) {
            queryString.split('&').forEach(p => {
                const [key, value] = p.split('=');
                if (key) params[key] = decodeURIComponent(value || '');
            });
        }

        // Scroll to top
        window.scrollTo(0, 0);

        // Auth guard for Supabase mode
        if (isSupabaseConfigured() && !store.isCloud) {
            const protectedRoutes = ['log', 'diary', 'profile', 'lists', 'community', 'invite', 'visit'];
            if (protectedRoutes.includes(path) && path !== 'invite') {
                this.content.innerHTML = '';
                const authPage = AuthPage(() => {
                    this.route();
                });
                this.content.appendChild(authPage);
                return;
            }
        }

        // Clear content
        this.content.innerHTML = '';

        let page;

        switch (path) {
            case '':
            case 'home':
                page = HomePage();
                break;
            case 'houses':
                page = HousesPage();
                break;
            case 'house':
                page = HouseDetailPage(param);
                break;
            case 'operas':
                page = OperasPage();
                break;
            case 'opera':
                page = OperaDetailPage(param);
                break;
            case 'log':
                page = LogVisitPage(params);
                break;
            case 'diary':
                page = DiaryPage();
                break;
            case 'visit':
                page = VisitDetailPage(param);
                break;
            case 'profile':
                page = ProfilePage(param || 'user-me');
                break;
            case 'lists':
                page = ListsPage();
                break;
            case 'list':
                page = ListDetailPage(param);
                break;
            case 'wishlist': {
                // Redirect to the wishlist's list detail page
                const wl = store.getWishlist();
                if (wl) {
                    page = ListDetailPage(wl.id);
                } else {
                    page = WishlistPage();
                }
                break;
            }
            case 'community':
                page = CommunityPage();
                break;
            case 'auth':
                page = AuthPage(() => {
                    // refreshSession() was already awaited in Auth.js before onSuccess fires
                    window.location.hash = '#/';
                    this.buildLayout();
                });
                break;
            case 'invite':
                page = InvitePage(param || null);
                break;
            default:
                page = HomePage();
        }

        this.content.appendChild(page);

        // Close mobile nav on route change
        const navLinks = document.querySelector('.nav-links');
        if (navLinks) navLinks.classList.remove('nav-links--open');

        // Force scroll to top to prevent history scroll restoration bugs
        window.scrollTo(0, 0);
        setTimeout(() => window.scrollTo(0, 0), 50);
    }
}

// Start
new App();
