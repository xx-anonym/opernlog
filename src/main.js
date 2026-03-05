// Main App – Router & Entry Point
import { Navigation } from './components/Navigation.js';
import { HomePage } from './pages/Home.js';
import { HousesPage } from './pages/Houses.js';
import { HouseDetailPage } from './pages/HouseDetail.js';
import { OperasPage } from './pages/Operas.js';
import { OperaDetailPage } from './pages/OperaDetail.js';
import { LogVisitPage } from './pages/LogVisit.js';
import { DiaryPage } from './pages/Diary.js';
import { ProfilePage } from './pages/Profile.js';
import { ListsPage } from './pages/Lists.js';
import { WishlistPage } from './pages/Wishlist.js';
import { CommunityPage } from './pages/Community.js';
import { AuthPage } from './pages/Auth.js';
import { InvitePage } from './pages/Invite.js';
import { store } from './store/store.js';
import { isSupabaseConfigured } from './config.js';
import { getSession } from './store/supabase.js';

class App {
    constructor() {
        this.root = document.getElementById('app');
        this.init();
    }

    async init() {
        // Check auth state on startup
        if (isSupabaseConfigured()) {
            try {
                const session = await getSession();
                if (session) {
                    await store.refreshSession();
                }
            } catch (e) {
                console.warn('Supabase session check failed:', e);
            }
        }
        this.buildLayout();
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
            const protectedRoutes = ['log', 'diary', 'profile', 'lists', 'community', 'invite'];
            if (protectedRoutes.includes(path) && path !== 'invite') {
                this.content.innerHTML = '';
                const authPage = AuthPage(() => {
                    store.refreshSession().then(() => {
                        this.route();
                    });
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
            case 'profile':
                page = ProfilePage(param || 'user-me');
                break;
            case 'lists':
                page = ListsPage();
                break;
            case 'wishlist':
                page = WishlistPage();
                break;
            case 'community':
                page = CommunityPage();
                break;
            case 'auth':
                page = AuthPage(() => {
                    store.refreshSession().then(() => {
                        window.location.hash = '#/';
                        this.buildLayout();
                    });
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
    }
}

// Start
new App();
