// Main App – Router & Entry Point
import { Navigation } from './components/Navigation.js';
import { icon } from './components/Icon.js';
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
import { SeasonReviewPage } from './pages/SeasonReview.js';
import { CommunityPage } from './pages/Community.js';
import { AuthPage } from './pages/Auth.js';
import { ProfileSetupPage } from './pages/ProfileSetup.js';
import { InvitePage } from './pages/Invite.js';
import { store } from './store/store.js';
import { isSupabaseConfigured } from './config.js';
import { showError } from './components/Toast.js';
import { getSession, getSupabase, waitForInitialSession, isProfileComplete } from './store/supabase.js';

class App {
    constructor() {
        if ('scrollRestoration' in history) {
            history.scrollRestoration = 'manual';
        }
        this.root = document.getElementById('app');
        this._splashStart = Date.now();
        // Scrollposition je Route, damit die Rückkehr zu einer Liste dort
        // landet, wo man sie verlassen hat.
        this._positionen = new Map();
        this._aktuellerHash = null;
        this.init();
    }

    // Dismiss the opera curtain splash screen
    dismissSplash() {
        const splash = document.getElementById('splash');
        if (!splash || splash.classList.contains('splash--hidden')) return;

        // The reveal (logo, title, subtitle) finishes around 0.9s. Hold long
        // enough after that for the subtitle to actually be readable – at 500ms
        // it was often gone before it had finished fading in.
        const elapsed = Date.now() - this._splashStart;
        const delay = Math.max(0, 1800 - elapsed);

        setTimeout(() => {
            splash.classList.add('splash--hidden');
            // Remove from DOM after all transitions complete
            // (curtains 1s + fade 0.4s delayed 0.7s = ~1.5s total)
            setTimeout(() => {
                splash.remove();
                // Hand the canvas back to the app palette (the velvet was only
                // there to cover the first paint before any CSS had applied)
                document.documentElement.style.background = '#14181c';
            }, 1600);
        }, delay);
    }

    async init() {
        // Set a maximum splash timeout (4s) so users aren't stuck on slow connections
        const splashTimeout = setTimeout(() => this.dismissSplash(), 4000);

        // Der Start wartet höchstens so lange auf die Cloud. Danach wird die
        // Oberfläche aus dem gebaut, was lokal liegt – Katalog, eigenes
        // Tagebuch, eigenes Profil sind vollständig da und brauchen kein Netz.
        //
        // Vorher wurde der Abgleich abgewartet, bevor überhaupt etwas
        // gezeichnet wurde. Ohne Netz laufen dabei mehrere Abfragen samt
        // Wiederholungen ins Leere; der Vorhang ging nach vier Sekunden auf
        // und dahinter war noch nichts. Das war der graue Bildschirm.
        const GEDULD = 3000;
        let cloudFertig = false;

        const cloud = this.initCloudOrCarryOn()
            .then(() => { cloudFertig = true; })
            .catch(e => {
                cloudFertig = true;
                console.error('[App] Start ohne Cloud – weiter mit lokalen Daten', e);
                store.syncError = e;
            });

        await Promise.race([cloud, new Promise(r => setTimeout(r, GEDULD))]);

        clearTimeout(splashTimeout);

        // Anmeldung oder Profileinrichtung haben die Oberfläche schon selbst
        // übernommen – hier ist nichts mehr zu bauen.
        if (this._startAbgeschlossen) {
            this.dismissSplash();
            return;
        }

        // Dismiss splash first, then build layout with a slight delay
        // so content appears as the curtains open (synced reveal)
        this.dismissSplash();
        // Wait 600ms for curtains to be mostly open before showing content
        await new Promise(r => setTimeout(r, 600));
        this.buildLayout();

        // Kam der Abgleich nicht rechtzeitig, wird nachgezeichnet, sobald er
        // da ist – dann stehen die frischen Daten in derselben Ansicht.
        if (!cloudFertig) {
            cloud.then(() => {
                if (this._startAbgeschlossen) return;
                this.route();
                this.reportSyncError();
            });
        }
    }

    /**
     * Der Cloud-Teil des Starts. Setzt _startAbgeschlossen, wenn er die
     * Oberfläche schon selbst übernommen hat (Auth-Rückleitung oder
     * Profileinrichtung) – dann ist init() fertig.
     */
    async initCloudOrCarryOn() {
        if (isSupabaseConfigured()) {
            const handled = await this.handleAuthHash();
            if (handled) {
                this._startAbgeschlossen = true;
                return;
            }

            // Wait for Supabase to determine the initial session
            const initialSession = await waitForInitialSession();

            // Auch dann abgleichen, wenn oben nichts kam. Dieser erste Blick
            // auf die Sitzung fällt in die Startphase der Bibliothek: findet
            // sie dort ein Token, das sie erneuern möchte, und ist kein Netz
            // da, gibt sie null zurück – obwohl im Speicher eine Sitzung
            // liegt. Das Ergebnis wird zudem für den ganzen Seitenaufruf
            // gemerkt. Wer sich darauf allein verließ, warf einen angemeldeten
            // Nutzer ohne Netz auf die Anmeldeseite.
            //
            // Der Start darf an einem Fehler hier nicht scheitern – sonst
            // bleibt die App im Splash stehen. Der Store merkt sich den
            // fehlgeschlagenen Abgleich, die Oberfläche weist darauf hin.
            try {
                await store.refreshSession();
            } catch (e) {
                console.error('[App] Abgleich beim Start fehlgeschlagen', e);
                store.syncError = e;
            }

            if (initialSession) {
                // Check if this is a new Google user who needs to set up their profile
                let profileDone = true;
                try {
                    profileDone = await isProfileComplete(initialSession.user.id);
                } catch (e) {
                    // Im Zweifel NICHT in die Profileinrichtung zwingen: ein
                    // vorübergehender Fehler darf bestehende Nutzer nicht
                    // durch ein Setup schicken, das sie längst hinter sich haben.
                    console.error('[App] Profilstatus konnte nicht geprüft werden', e);
                }

                // Nur wenn die Oberfläche noch nicht steht: kommt der
                // Abgleich erst nach der Geduldsfrist zurück, ist die App
                // längst sichtbar, und ein Einrichtungsbildschirm darüber wäre
                // ein Sprung mitten in der Benutzung.
                if (!profileDone && !this._layoutGebaut) {
                    this.showProfileSetup(initialSession);
                    this._startAbgeschlossen = true;
                    return;
                }
            }
        }
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
                    console.error('[Passwort-Wiederherstellung]', e);
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
                        <span class="auth-logo">${icon('user')}</span>
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

                successEl.textContent = 'Passwort erfolgreich geändert! Du wirst weitergeleitet...';
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
            // Profile setup complete — smooth transition to app
            store.refreshSession().then(() => {
                // Fade out the setup page
                setupPage.classList.add('page--leaving');
                setTimeout(() => {
                    window.location.hash = '#/';
                    this.buildLayout();
                    // Fade in the new layout
                    this.root.classList.add('app--entering');
                    setTimeout(() => this.root.classList.remove('app--entering'), 500);
                }, 400);
            });
        });
        this.root.appendChild(setupPage);
    }

    buildLayout() {
        this._layoutGebaut = true;
        this.root.innerHTML = '';

        const nav = Navigation();
        this.root.appendChild(nav);

        this.content = document.createElement('main');
        this.content.className = 'main-content';
        this.root.appendChild(this.content);

        // Listen for hash changes (remove old listener to prevent leaks on re-auth)
        if (this._routeHandler) window.removeEventListener('hashchange', this._routeHandler);
        this._routeHandler = () => this.route();
        window.addEventListener('hashchange', this._routeHandler);

        // Re-sync when the app becomes visible again. Without this, data is only
        // fetched on cold start and on route changes – a device that keeps the app
        // open in the background (installed PWA) would show a stale view forever,
        // even after someone edited a visit on another device.
        if (this._visibilityHandler) document.removeEventListener('visibilitychange', this._visibilityHandler);
        this._visibilityHandler = () => {
            if (document.visibilityState === 'visible') this.refreshFromCloud();
        };
        document.addEventListener('visibilitychange', this._visibilityHandler);

        this.route();
        this.reportSyncError();
    }

    // Weist darauf hin, wenn angezeigte Daten aus dem lokalen Zwischenspeicher
    // stammen, weil der Abgleich mit der Cloud fehlgeschlagen ist. Ohne diesen
    // Hinweis wäre Veraltetes von Aktuellem nicht zu unterscheiden.
    reportSyncError() {
        if (!store.syncError) return;
        const message = store.syncError.userMessage || store.syncError.message;
        store.syncError = null;
        showError(message);
    }

    // Current route path, e.g. "diary" for "#/diary" or "log" for "#/log?edit=1"
    currentPath() {
        return (window.location.hash || '#/').slice(2).split('?')[0].split('/')[0];
    }

    async refreshFromCloud() {
        // Never blow away a half-filled form or an auth flow in progress
        if (['log', 'auth'].includes(this.currentPath())) return;
        if (this._refreshing) return;
        // Throttle so quick app switches don't cause a burst of requests
        if (Date.now() - (this._lastRefresh || 0) < 30000) return;

        this._refreshing = true;
        try {
            if (isSupabaseConfigured()) await store.refreshSession();
            this._lastRefresh = Date.now();
            this.route();
            this.reportSyncError();
        } catch (e) {
            console.error('[App] Abgleich beim Zurückkehren fehlgeschlagen', e);
            showError('Daten konnten nicht aktualisiert werden – der angezeigte Stand ist möglicherweise veraltet.');
        } finally {
            this._refreshing = false;
        }
    }

    /**
     * Seite für die Stellen, die ohne Netz nicht gehen. Besser als die
     * Anmeldemaske: die schlägt jemandem eine Anmeldung vor, der längst
     * angemeldet ist und sie ohne Netz gar nicht durchführen könnte.
     */
    offlineHinweis(path) {
        const box = document.createElement('div');
        box.className = 'page empty-state offline-hinweis';
        box.innerHTML = `
            <p class="offline-hinweis__titel">${icon('globe', { className: 'icon--meta' })}Dafür fehlt gerade das Netz</p>
            <p>${path === 'log'
                ? 'Ein Besuch lässt sich nur mit Verbindung eintragen – er soll ja auch auf deinen anderen Geräten ankommen.'
                : 'Diese Seite lädt Daten anderer Nutzer und braucht dafür eine Verbindung.'}</p>
            <p class="text-muted">Dein Tagebuch, dein Profil und der Katalog sind auch ohne Netz da.</p>
            <a class="btn btn--primary" href="#/diary">Zum Tagebuch</a>
        `;
        return box;
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

        // Wo stand die Seite, die gerade verlassen wird? Beim hashchange ist
        // die Ansicht noch die alte – der Browser rollt bei einem Fragment
        // ohne Sprungmarke nicht von selbst. Deshalb lässt sich die Position
        // hier einfach ablesen; ein Scroll-Zuhörer wäre dafür nicht nötig.
        const gleicheRoute = hash === this._aktuellerHash;
        const zielPosition = gleicheRoute
            ? window.scrollY                              // Neuzeichnen derselben Seite
            : (this._positionen.get(hash) ?? 0);          // Rückkehr oder neue Seite

        if (!gleicheRoute && this._aktuellerHash) {
            this._positionen.set(this._aktuellerHash, window.scrollY);
            // Nicht unbegrenzt wachsen lassen. Die ältesten Einträge stehen in
            // einer Map vorn, die braucht niemand mehr.
            if (this._positionen.size > 40) {
                this._positionen.delete(this._positionen.keys().next().value);
            }
        }
        this._aktuellerHash = hash;

        // Ohne Netz gar nicht erst anbieten, was zwingend ans Netz muss –
        // egal, ob die Sitzung gerade als angemeldet gilt. Ein Formular, das
        // beim Absenden scheitert, ist ärgerlicher als ein klarer Hinweis.
        if (store.isOffline && ['log', 'community'].includes(path)) {
            this.content.innerHTML = '';
            this.content.appendChild(this.offlineHinweis(path));
            return;
        }

        // Auth guard for Supabase mode
        if (isSupabaseConfigured() && !store.isCloud) {
            const protectedRoutes = ['log', 'diary', 'profile', 'lists', 'community', 'invite', 'visit', 'season'];

            // Ohne Netz zeigt die App das, was lokal liegt, statt zur Anmeldung
            // zu schicken. Sinn und Zweck eines Offline-Modus: das eigene
            // Tagebuch ist vollständig da, nur bestätigen lässt sich die
            // Anmeldung gerade nicht.
            const offlineErlaubt = ['diary', 'profile', 'visit', 'season', 'lists'];

            if (protectedRoutes.includes(path) && path !== 'invite') {
                if (store.isOfflineWithLocalUser && offlineErlaubt.includes(path)) {
                    // durchlassen – unten wird die Seite aus lokalen Daten gebaut
                } else if (store.isOfflineWithLocalUser) {
                    // Übrig bleiben die Seiten, die zwingend ans Netz müssen:
                    // Loggen schreibt, Community liest fremde Daten.
                    this.content.innerHTML = '';
                    this.content.appendChild(this.offlineHinweis(path));
                    return;
                } else {
                    this.content.innerHTML = '';
                    const authPage = AuthPage(() => {
                        this.route();
                    });
                    this.content.appendChild(authPage);
                    return;
                }
            }
        }

        // Wer zu einer Liste zurückkehrt, hat sie schon gesehen – die
        // Einblendung der Karten ist dann nur eine Wartezeit. Sie gilt für den
        // ersten Blick auf eine Seite, nicht für die Rückkehr.
        //
        // Als Klasse am Behälter statt als Angabe an jeder Seite: die Seiten
        // müssen dafür nichts vom Verlauf wissen. Umgeschaltet wird bei jedem
        // Aufruf, und weil der Inhalt darunter ohnehin neu gebaut wird, kann
        // keine Karte zurückbleiben, die dann doch noch einblendet.
        this.content.classList.toggle('main-content--sofort', zielPosition > 0);

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
            case 'season':
                // #/season zeigt die zuletzt abgeschlossene Spielzeit,
                // #/season/2025 eine bestimmte.
                page = SeasonReviewPage(param);
                break;
            case 'auth':
                page = AuthPage(() => {
                    // refreshSession() was already awaited in Auth.js before onSuccess fires
                    // Only set hash – hashchange listener will trigger route() automatically
                    window.location.hash = '#/';
                    // Rebuild layout (nav etc.) since we're coming from auth-only view
                    if (!document.querySelector('.main-nav')) {
                        this.buildLayout();
                    }
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

        this.stellePositionWiederher(zielPosition);
    }

    /**
     * Zurück zu einer Liste soll dort landen, wo man sie verlassen hat – wer
     * sich durch 106 Werke gescrollt hat, will nach einem Blick auf eines
     * davon nicht wieder ganz oben anfangen.
     *
     * Mehrere Versuche, weil die Seite nach dem Einhängen noch wächst: Bilder
     * bekommen ihre Höhe erst beim Laden, und einige Seiten zeichnen nach,
     * wenn Daten da sind. Ein einzelnes scrollTo träfe dann auf ein zu kurzes
     * Dokument und würde abgeschnitten.
     */
    stellePositionWiederher(ziel) {
        if (this._positionsLauf) clearTimeout(this._positionsLauf);

        // Immer ohne Animation. Für die Seite gilt scroll-behavior: smooth,
        // und das ist beim Wechsel der Ansicht falsch: der Browser scrollt
        // dann sichtbar durch die ganze Liste, und weil die Wiederholungen
        // unten jeweils eine neue Animation anstoßen, schaukelt sich das auf –
        // gemessen landete eine Rückkehr statt bei 1396 bei 2691.
        const springe = (y) => window.scrollTo({ top: y, left: 0, behavior: 'instant' });

        if (!ziel) {
            springe(0);
            // Der Nachschlag fängt Seiten ab, die gleich noch wachsen und den
            // Browser sonst eine alte Position wiederherstellen ließen.
            this._positionsLauf = setTimeout(() => springe(0), 50);
            return;
        }

        let versuche = 0;
        const versuch = () => {
            springe(ziel);
            versuche += 1;
            // Fertig, sobald die Position sitzt – oder nach einer halben
            // Sekunde, wenn die Seite kürzer geworden ist als beim Verlassen.
            if (Math.abs(window.scrollY - ziel) > 2 && versuche < 12) {
                this._positionsLauf = setTimeout(versuch, 40);
            }
        };
        versuch();
    }
}

// Start
new App();
