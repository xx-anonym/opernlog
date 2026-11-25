// Main App – Router & Entry Point
import { Navigation } from './components/Navigation.js';
import { icon } from './components/Icon.js';
import { HomePage } from './pages/Home.js';
import { AuthPage } from './pages/Auth.js';
import { ProfileSetupPage } from './pages/ProfileSetup.js';
import { mitteilungenFrage } from './components/MitteilungenFrage.js';
import { mitteilungenFrageFaellig, pushAn, pushBeimAbmelden } from './push.js';
import { neuigkeitFenster } from './components/Neuigkeit.js';
import { neuigkeitFaellig } from './neuigkeiten.js';
import { willkommenFenster } from './components/Willkommen.js';
import { willkommenFaellig } from './willkommen.js';
import { offeneEinladung, einladungVergessen, endgueltigGescheitert } from './einladung.js';
import { zurueckGesteEinrichten } from './zurueckGeste.js';
import { haptikEinrichten } from './haptik.js';
import { zurueckEinrichten } from './components/ZurueckLink.js';
import { ziehenZumAktualisieren } from './ziehenZumAktualisieren.js';
import { store } from './store/store.js';
import { isSupabaseConfigured } from './config.js';
import { VERSION } from './version.js';
import { ABGEMELDET, nachDemAbmelden } from './utils.js';
import { showError, showToast } from './components/Toast.js';
import { ladeKatalogZusatz } from './data/katalogZusatz.js';
import { getSession, getSupabase, getFeedCloud, waitForInitialSession, isProfileComplete, getKatalogZusatzCloud, fehlerMelden, acceptInvite } from './store/supabase.js';
import { fehlerprotokollEinrichten } from './fehlerprotokoll.js';
import { umzugSchritt, umzugZiel, umzugEinloesen, istAlteAdresse, UMZUG_MITTEILUNGEN } from './umzug.js';
import { umzugHinweisFenster } from './components/UmzugHinweis.js';
import { mailLinkEinloesen, mailAnmeldungText } from './mailAnmeldung.js';
import * as feedVorrat from './feedVorrat.js';
import { istInstalliert } from './installHinweis.js';
import { LandingPage, landingZeigen } from './components/Landing.js';

// Seiten, die erst beim Aufruf geladen werden (20.11.2026). Statisch geladen
// zog der Start 112 Module mit 1,4 MB nach sich, und Googles Abruf brach dabei
// regelmäßig ab ("Skript ließ sich nicht laden" im Fehlerprotokoll, nur von
// Googlebot und Googles Vorschau): Google sah die App nie gestartet. Statisch
// bleiben nur die Startseite, die Anmeldung und das Profil-Einrichten, die
// gleich beim Start gebraucht werden. tests/checks/startModule.test.js wacht
// darüber, dass das so bleibt.
//
// Je Pfad die Module, die route() braucht; geladen wird beim ersten Aufruf,
// danach steht alles in SEITEN_GELADEN und route() läuft wie früher ohne Warten.
// Ohne Netz kommen sie aus dem Service Worker (APP_SHELL in sw.js).
const SEITEN_MODULE = {
    houses: ['Houses'], house: ['HouseDetail'], operas: ['Operas'], opera: ['OperaDetail'],
    composer: ['ComposerDetail'], person: ['PersonDetail'], datenschutz: ['Datenschutz'],
    bildnachweise: ['Bildnachweise'], log: ['LogVisit'], diary: ['Diary'], visit: ['VisitDetail'],
    profile: ['Profile'], lists: ['Lists'], list: ['ListDetail'], wishlist: ['ListDetail', 'Wishlist'],
    community: ['Community'], naehe: ['Naehe'], sammlungen: ['Sammlungen'], season: ['SeasonReview'],
    invite: ['Invite'],
};
const SEITEN_GELADEN = {};
// Seiten nur mit Konto. Die Einladung (#/invite) ist bewusst nicht dabei:
// sie zeigt Abgemeldeten selbst, worum es geht.
const GESCHUETZT = ['log', 'diary', 'profile', 'lists', 'wishlist', 'community', 'visit', 'season', 'sammlungen'];

const seiteLaden = (name) => import(`./pages/${name}.js`).then(m => Object.assign(SEITEN_GELADEN, m));
const seitenFehlen = (path) => (SEITEN_MODULE[path] || []).filter(n => !(`${n}Page` in SEITEN_GELADEN));

/**
 * Steht irgendwo Text, den jemand selbst eingegeben hat? Verglichen wird mit
 * dem Anfangswert des Felds: ein vorbelegter Name zählt nicht, eine
 * angefangene Eingabe schon – auch in einem offenen Fenster.
 */
function ungesicherteEingabe() {
    return [...document.querySelectorAll('input, textarea')].some(feld =>
        !['hidden', 'checkbox', 'radio', 'button', 'submit'].includes(feld.type)
        && feld.value.trim() !== ''
        && feld.value !== feld.defaultValue);
}

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
        this.zeigeVersion();
        // "Zurück" schließt ein offenes Fenster, statt die Seite zu verlassen.
        zurueckGesteEinrichten();
        haptikEinrichten();
        zurueckEinrichten();
        window.addEventListener(ABGEMELDET, () => this.nachAbmeldung());
        this.init();
    }

    /**
     * Die Version steht im Ladebildschirm und sonst nirgends. Gefragt wird
     * danach in aller Regel dann, wenn etwas klemmt – "welchen Stand hast du
     * denn?" –, und der Ladebildschirm ist die eine Ansicht, die dabei jeder
     * ohne Anleitung erreicht: App zu, App auf.
     *
     * Fehlt das Feld, passiert nichts. Der Ladebildschirm ist eine
     * Bequemlichkeit, kein Teil der App; er darf den Start nie aufhalten.
     */
    zeigeVersion() {
        const feld = document.getElementById('splashVersion');
        if (feld) feld.textContent = `Version ${VERSION}`;
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
        //
        // Auf der Startseite wartet der Vorhang außerdem auf den Feed der
        // Freunde (src/feedVorrat.js), in derselben Frist: er soll frisch
        // dastehen, wenn der Vorhang aufgeht, statt dass sich dahinter erst
        // der Spinner dreht. initCloudOrCarryOn() stößt die Anfrage an,
        // sobald die Sitzung feststeht; ohne Sitzung oder auf einer anderen
        // Seite gibt es nichts abzuwarten.
        const GEDULD = 3000;
        let cloudFertig = false;
        let feedMelden;
        const feedBereit = new Promise(r => { feedMelden = r; });
        this._feedMelden = feedMelden;

        const cloud = this.initCloudOrCarryOn()
            .then(() => { cloudFertig = true; })
            .catch(e => {
                cloudFertig = true;
                console.error('[App] Start ohne Cloud – weiter mit lokalen Daten', e);
                store.syncError = e;
            })
            // Hat der Start keinen Feed angestoßen, ist auch keiner abzuwarten.
            .finally(() => feedMelden(false));

        await Promise.race([Promise.all([cloud, feedBereit]), new Promise(r => setTimeout(r, GEDULD))]);

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
        // Die erste Ansicht hat den vorgeladenen Feed genommen – oder war
        // nicht die Startseite. Danach fragt jede Startseite frisch.
        feedVorrat.startVorbei();
        if (this._umzugHinweis) umzugHinweisFenster();
        cloud.then(() => this.mailAnmeldungMelden());

        // Was beim letzten Mal ohne Netz geloggt wurde, geht jetzt hoch –
        // sobald der Abgleich durch ist und damit die Sitzung steht.
        cloud.then(() => this.ausstehendeSenden());

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
            // Die selbst angelegten Katalogeinträge. Läuft neben allem
            // anderen und darf den Start nicht aufhalten: der Katalog aus dem
            // Repo steht ohnehin, und der zuletzt gesehene Stand ist beim
            // Import schon aus dem localStorage dazugekommen.
            ladeKatalogZusatz(getKatalogZusatzCloud)
                .then(({ werke, haeuser, komponisten }) => {
                    // Nur neu zeichnen, wenn die Oberfläche schon steht –
                    // sonst baut init() sie gleich ohnehin.
                    if ((werke || haeuser || komponisten) && this._layoutGebaut) this.route();
                })
                .catch(e => console.error('[App] Katalogzusatz nicht geladen', e));

            const handled = await this.handleAuthHash();
            if (handled) {
                this._startAbgeschlossen = true;
                return;
            }

            // Wait for Supabase to determine the initial session
            const initialSession = await waitForInitialSession();

            // Unter der alten Adresse: weiter nach opernlog.de (src/umzug.js).
            // Gelingt das, übernimmt die neue Seite; der Vorhang bleibt bis
            // dahin stehen.
            if (await this.vielleichtUmziehen(initialSession)) {
                this._startAbgeschlossen = true;
                return;
            }

            // Der Feed der Startseite, neben dem Abgleich unten (siehe init).
            if (initialSession && ['', 'home'].includes(this.currentPath())) {
                this._feedMelden?.(feedVorrat.vorladen(() => getFeedCloud(), initialSession.user.id));
            }

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

    /**
     * Der Umzug unter der alten Adresse. true, wenn die Seite gerade
     * verlassen wird. Scheitert etwas (kein Netz, Abende warten noch), bleibt
     * die App hier und versucht es beim nächsten Start wieder.
     */
    async vielleichtUmziehen(session) {
        const schritt = umzugSchritt({
            alteAdresse: istAlteAdresse(), installiert: istInstalliert(), angemeldet: !!session,
        });
        if (schritt === 'nichts') return false;
        if (schritt === 'hinweis') {
            this._umzugHinweis = true;
            return false;
        }
        // Ohne Netz lädt die neue Adresse nicht (ihr Service Worker ist noch
        // nicht da), und wartende Abende lägen danach unerreichbar hier.
        if (navigator.onLine === false) return false;
        if (schritt === 'weiter') {
            if (store.getAusstehendeBesuche().length) return false;
            window.location.replace(umzugZiel({ hash: window.location.hash }));
            return true;
        }
        try {
            // Ohne Netz geloggte Abende liegen nur hier; erst wenn sie oben
            // sind, darf die App die Adresse wechseln.
            await store.refreshSession();
            await store.ausstehendeUebertragen().catch(() => {});
            if (store.getAusstehendeBesuche().length) return false;
            const { data, error } = await getSupabase().functions.invoke('umzug', { method: 'POST' });
            if (error || !data?.code) throw error || new Error('kein Code');
            // Mitteilungen hier aus, dort wieder anbieten (src/umzug.js).
            const push = await pushAn().catch(() => false);
            if (push) await pushBeimAbmelden();
            window.location.replace(umzugZiel({ hash: window.location.hash, code: data.code, push }));
            return true;
        } catch (e) {
            console.warn('[Umzug] bleibt vorerst unter der alten Adresse', e);
            return false;
        }
    }

    /**
     * Nach dem Knopf in einer Mail: sagen, als wer man jetzt angemeldet ist –
     * mit "Abmelden", falls die Mail nicht die eigene war. Oder, dass der
     * Link abgelaufen ist, damit niemand rätselt, warum die Anmeldung kommt.
     */
    mailAnmeldungMelden() {
        const ergebnis = this._mailAnmeldung;
        this._mailAnmeldung = null;
        if (ergebnis === 'angemeldet' && store.isCloud) {
            showToast(mailAnmeldungText(store.getCurrentUser()?.name), 'info', {
                aktion: {
                    text: 'Nicht du? Abmelden',
                    ausfuehren: async () => {
                        await store.logout();
                        nachDemAbmelden();
                    },
                },
            });
        } else if (ergebnis === 'abgelaufen' && !store.isCloud) {
            showToast('Der Link aus der Mail ist abgelaufen – melde dich bitte kurz an.', 'error');
        }
    }

    async handleAuthHash() {
        // Umzug: die Anmeldung von opernlog.vercel.app mitgebracht
        // (src/umzug.js). Danach steht die Adresse auf der alten Stelle, und
        // der Start läuft normal weiter – mit Sitzung.
        await umzugEinloesen({
            einloesen: async (code) => {
                const { error } = await getSupabase().auth.verifyOtp({ token_hash: code, type: 'email' });
                if (error) throw error;
            },
        });

        // Knopf in einer Mail (src/mailAnmeldung.js): mit Einmal-Code, wenn
        // auf dem Gerät noch niemand angemeldet ist. Der Hinweis dazu kommt,
        // wenn die Oberfläche steht (mailAnmeldungMelden).
        this._mailAnmeldung = await mailLinkEinloesen({
            angemeldet: async () => !!(await getSession()),
            einloesen: async (code) => {
                const { error } = await getSupabase().auth.verifyOtp({ token_hash: code, type: 'email' });
                if (error) throw error;
            },
        });

        const hash = window.location.hash;
        if (!hash) return false;

        // Check for Supabase error params (e.g. expired OTP)
        if (hash.includes('error=') && hash.includes('error_code=')) {
            // Clear the hash so the router doesn't choke on it
            window.location.hash = '#/auth';
            return false;
        }

        // Ein alter Link "Passwort zurücksetzen" (bis 9.11.2026 verschickt).
        // Passwörter gibt es nicht mehr; der Link meldet nur noch an – die
        // Sitzung daraus liest die Bibliothek beim Start selbst. Hier wird
        // nur die Adresse aufgeräumt, damit der Router nicht daran hängt.
        if (hash.includes('access_token=') && hash.includes('type=recovery')) {
            const params = new URLSearchParams(hash.substring(1));
            const accessToken = params.get('access_token');
            const refreshToken = params.get('refresh_token');
            if (accessToken && refreshToken) {
                try {
                    await getSupabase().auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
                } catch (e) {
                    console.error('[Anmeldung über alten Link]', e);
                }
            }
            window.location.hash = '#/';
        }

        return false;
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

    /**
     * Nach dem Abmelden (nachDemAbmelden() in utils.js): die Oberfläche neu
     * bauen statt die Seite neu zu laden. Das Neuladen zeigte einen dunklen
     * Moment zwischen zwei Anmeldemasken.
     *
     * Die Daten des Kontos hat store.logout() schon geleert. Hier geht, was
     * die Oberfläche selbst sich gemerkt hat: die Leiste (mit dem Punkt für
     * offene Anfragen), die Scrollpositionen der besuchten Seiten und die
     * Sperre für den nächsten Abgleich. Was je Konto gemerkt ist
     * (_einladungGeprueft und Co., istAdmin), gilt für das nächste Konto
     * ohnehin nicht.
     *
     * pushState statt location.hash: das löst kein hashchange aus, sonst
     * würde die Anmeldung gleich zweimal gezeichnet. Ohne eigenen Zustand,
     * wie ein Wechsel über location.hash auch.
     */
    nachAbmeldung() {
        clearTimeout(this._positionsLauf);
        this._positionen.clear();
        this._aktuellerHash = null;
        this._lastRefresh = 0;
        history.pushState(null, '', '#/auth');
        window.scrollTo(0, 0);
        this.buildLayout();
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

        // Netz ist wieder da: wartende Besuche hochschicken. Ohne Sitzung (sie
        // ließ sich offline nicht erneuern) erst den Abgleich, der sie holt.
        if (this._onlineHandler) window.removeEventListener('online', this._onlineHandler);
        this._onlineHandler = async () => {
            if (!store.isCloud && isSupabaseConfigured()) {
                try { await store.refreshSession(); } catch (e) { console.warn('[App] Abgleich nach Rückkehr des Netzes', e); }
            }
            this.ausstehendeSenden();
        };
        window.addEventListener('online', this._onlineHandler);

        this.route();
        this.reportSyncError();
    }

    /**
     * Ohne Netz geloggte Besuche übertragen und sagen, wie es ausging. Neu
     * gezeichnet wird nur, wenn sich etwas getan hat und niemand gerade tippt.
     */
    async ausstehendeSenden({ neuZeichnen = true } = {}) {
        let ergebnis;
        try {
            ergebnis = await store.ausstehendeUebertragen();
        } catch (e) {
            console.error('[App] Wartende Besuche übertragen', e);
            return;
        }
        if (!ergebnis?.uebertragen) return;
        const n = ergebnis.uebertragen;
        showToast(n === 1
            ? 'Der ohne Netz geloggte Besuch ist jetzt gespeichert.'
            : `${n} ohne Netz geloggte Besuche sind jetzt gespeichert.`);
        if (neuZeichnen && this._layoutGebaut && !['log', 'auth'].includes(this.currentPath()) && !ungesicherteEingabe()) {
            this.route();
        }
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

    /** Neuer Besuch, oder Änderung an einem, der noch auf dem Gerät wartet. */
    offlineLoggenErlaubt(params) {
        if (!store.kannSpaeterUebertragen) return false;
        if (!params.edit) return true;
        return !!store.getAusstehendeBesuche().find(v => v.id === params.edit);
    }

    // Current route path, e.g. "diary" for "#/diary" or "log" for "#/log?edit=1"
    currentPath() {
        return (window.location.hash || '#/').slice(2).split('?')[0].split('/')[0];
    }

    /**
     * @param {object} [o]
     * @param {boolean} [o.erzwingen]  von Hand angestoßen (Ziehen im Feed):
     *   ohne die 30-Sekunden-Sperre
     */
    async refreshFromCloud({ erzwingen = false } = {}) {
        // Never blow away a half-filled form or an auth flow in progress
        if (['log', 'auth'].includes(this.currentPath())) return;
        if (this._refreshing) return;
        // Throttle so quick app switches don't cause a burst of requests
        if (!erzwingen && Date.now() - (this._lastRefresh || 0) < 30000) return;

        this._refreshing = true;
        try {
            if (isSupabaseConfigured()) await store.refreshSession();
            this._lastRefresh = Date.now();
            await this.ausstehendeSenden({ neuZeichnen: false });
            // Wer gerade etwas tippt, verliert es nicht: ein halber Kommentar,
            // eine Suche. Die Daten sind trotzdem frisch, zu sehen sind sie
            // beim nächsten Seitenwechsel.
            if (!ungesicherteEingabe()) this.route();
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
    offlineHinweis(path, params = {}) {
        const box = document.createElement('div');
        box.className = 'page empty-state offline-hinweis';
        box.innerHTML = `
            <p class="offline-hinweis__titel">${icon('globe', { className: 'icon--meta' })}Dafür fehlt gerade das Netz</p>
            <p>${path !== 'log'
                ? 'Diese Seite lädt Daten anderer Nutzer und braucht dafür eine Verbindung.'
                : params.edit
                    ? 'Einen gespeicherten Besuch ändern geht nur mit Verbindung – die Änderung soll ja auch auf deinen anderen Geräten ankommen. Neue Besuche kannst du auch ohne Netz loggen.'
                    : 'Zum Loggen brauchst du ein Konto. Melde dich an, sobald du wieder Netz hast.'}</p>
            <p class="text-muted">Dein Tagebuch, dein Profil und der Katalog sind auch ohne Netz da.</p>
            <a class="btn btn--primary" href="#/diary">Zum Tagebuch</a>
        `;
        return box;
    }

    /** Führt dieser Weg ohne Sitzung zur Anmeldung statt zur Seite? (siehe Auth-Wächter in route) */
    zurAnmeldung(path) {
        return isSupabaseConfigured() && !store.isCloud && GESCHUETZT.includes(path) && !store.isOfflineWithLocalUser;
    }

    route(nachLaden = false) {
        // Das Menü schließt beim Seitenwechsel – gleich zu Beginn, nicht erst,
        // wenn die Seite steht: sonst klappte ein Menü, das man öffnet,
        // während eine Seite noch lädt (SEITEN_MODULE), unter dem Finger zu.
        if (!nachLaden) document.querySelector('.nav-links')?.classList.remove('nav-links--open');
        if (!nachLaden) document.body.classList.remove('mit-landing');

        // e.g. #/log?edit=123
        const hash = window.location.hash || '#/';
        const withoutHash = hash.slice(2); // "log?edit=123"

        // Separate query string from the path
        const [fullPath, queryString] = withoutHash.split('?');
        const [path, ...rest] = fullPath.split('/');
        const param = rest.join('/');

        // Die Seite ist noch nicht geladen (SEITEN_MODULE): erst holen, dann
        // noch einmal – solange niemand inzwischen woandershin gegangen ist.
        // Bis dahin bleibt die alte Seite stehen, statt kurz leer zu werden.
        //
        // Nicht, wenn der Weg ohnehin zur Anmeldung führt (Auth-Wächter
        // unten): dann wurde erst das Modul einer Seite geladen, die niemand
        // zu sehen bekommt, und danach die Anmeldung ein zweites Mal gebaut –
        // was jemand dort inzwischen eingetippt hatte, war weg (abmelden.test.js
        // scheiterte daran, sobald das Laden länger dauerte).
        const fehlen = this.zurAnmeldung(path) ? [] : seitenFehlen(path);
        if (fehlen.length) {
            Promise.all(fehlen.map(seiteLaden)).then(() => {
                if ((window.location.hash || '#/') === hash) this.route(true);
            }, (e) => {
                console.error('[Seite laden]', path, e);
                showError('Die Seite ließ sich nicht laden – bitte prüfe die Verbindung und lade neu.', { melden: false });
            });
            return;
        }

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
        // Loggen geht auch ohne Netz: der Besuch wartet dann auf dem Gerät.
        // Nur einen schon übertragenen zu ändern, braucht die Verbindung.
        if (store.isOffline && (path === 'community' || (path === 'log' && !this.offlineLoggenErlaubt(params)))) {
            this.content.innerHTML = '';
            this.content.appendChild(this.offlineHinweis(path, params));
            return;
        }

        // Auth guard for Supabase mode
        if (isSupabaseConfigured() && !store.isCloud) {
            // Ohne Netz zeigt die App das, was lokal liegt, statt zur Anmeldung
            // zu schicken. Sinn und Zweck eines Offline-Modus: das eigene
            // Tagebuch ist vollständig da, nur bestätigen lässt sich die
            // Anmeldung gerade nicht.
            const offlineErlaubt = ['diary', 'profile', 'visit', 'season', 'lists', 'wishlist', 'log', 'sammlungen'];

            if (GESCHUETZT.includes(path)) {
                if (store.isOfflineWithLocalUser && offlineErlaubt.includes(path)) {
                    // durchlassen – unten wird die Seite aus lokalen Daten gebaut
                } else if (store.isOfflineWithLocalUser) {
                    // Übrig bleiben die Seiten, die zwingend ans Netz müssen:
                    // Loggen schreibt, Community liest fremde Daten.
                    this.content.innerHTML = '';
                    this.content.appendChild(this.offlineHinweis(path, params));
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
                // Ohne Konto: zuerst die Werbeseite (components/Landing.js).
                if (isSupabaseConfigured() && landingZeigen({ angemeldet: !!store.isCloud, offlineNutzer: !!store.isOfflineWithLocalUser })) {
                    page = LandingPage({ stoebern: () => this.route() });
                    break;
                }
                page = HomePage();
                // Von Hand aktualisieren: oben ziehen (nur installiert).
                ziehenZumAktualisieren(page, () => this.refreshFromCloud({ erzwingen: true }));
                break;
            case 'houses':
                page = SEITEN_GELADEN.HousesPage();
                break;
            case 'house':
                page = SEITEN_GELADEN.HouseDetailPage(param);
                break;
            case 'operas':
                page = SEITEN_GELADEN.OperasPage();
                break;
            case 'opera':
                page = SEITEN_GELADEN.OperaDetailPage(param);
                break;
            case 'composer':
                page = SEITEN_GELADEN.ComposerDetailPage(param);
                break;
            case 'person':
                page = SEITEN_GELADEN.PersonDetailPage(param);
                break;
            case 'datenschutz':
                page = SEITEN_GELADEN.DatenschutzPage();
                break;
            case 'bildnachweise':
                page = SEITEN_GELADEN.BildnachweisePage();
                break;
            case 'log':
                page = SEITEN_GELADEN.LogVisitPage(params);
                break;
            case 'diary':
                page = SEITEN_GELADEN.DiaryPage();
                break;
            case 'visit':
                page = SEITEN_GELADEN.VisitDetailPage(param);
                break;
            case 'profile':
                page = SEITEN_GELADEN.ProfilePage(param || 'user-me');
                break;
            case 'lists':
                page = SEITEN_GELADEN.ListsPage();
                break;
            case 'list':
                page = SEITEN_GELADEN.ListDetailPage(param);
                break;
            case 'wishlist': {
                // Redirect to the wishlist's list detail page
                const wl = store.getWishlist();
                if (wl) {
                    page = SEITEN_GELADEN.ListDetailPage(wl.id);
                } else {
                    page = SEITEN_GELADEN.WishlistPage();
                }
                break;
            }
            case 'community':
                page = SEITEN_GELADEN.CommunityPage();
                break;
            case 'naehe':
                page = SEITEN_GELADEN.NaehePage();
                break;
            case 'sammlungen':
                // #/sammlungen/ring springt zur Sammlung.
                page = SEITEN_GELADEN.SammlungenPage(param);
                break;
            case 'season':
                // #/season zeigt die zuletzt abgeschlossene Spielzeit,
                // #/season/2025 eine bestimmte.
                page = SEITEN_GELADEN.SeasonReviewPage(param);
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
                page = SEITEN_GELADEN.InvitePage(param || null);
                break;
            default:
                page = HomePage();
        }

        this.content.appendChild(page);
        // Die Werbeseite hat ihren eigenen Kopf; Leiste und Menü treten zurück.
        document.body.classList.toggle('mit-landing', page.classList.contains('landing'));
        this.vielleichtEinladungEinloesen(path);
        this.vielleichtWillkommenZeigen(path);
        this.vielleichtNachMitteilungenFragen(path);
        this.vielleichtNeuigkeitZeigen(path);

        this.stellePositionWiederher(zielPosition);
    }

    /**
     * Eine Einladung, die auf ihr Konto wartet (src/einladung.js), annehmen –
     * sobald jemand angemeldet ist, egal auf welcher Seite er ankommt. Auf
     * der Einladungsseite selbst nimmt die Seite sie an. Einmal je
     * Seitenaufruf und Konto; ohne Netz beim nächsten Start.
     */
    vielleichtEinladungEinloesen(path) {
        if (!store.isCloud || store.isOffline || ['auth', 'invite'].includes(path)) return;
        const profil = store._profile;
        if (!profil?.id || this._einladungGeprueft === profil.id) return;
        const code = offeneEinladung();
        if (!code) return;
        this._einladungGeprueft = profil.id;
        acceptInvite(code).then((ergebnis) => {
            if (ergebnis.success) {
                einladungVergessen();
                const name = ergebnis.friend?.username;
                showToast(name ? `Du und ${name} seid jetzt befreundet.` : 'Die Einladung ist angenommen – ihr seid jetzt befreundet.');
                // Auf Startseite und Freunde-Seite gehören die neuen Freunde gleich dazu.
                if (['', 'home', 'community'].includes(this.currentPath()) && !ungesicherteEingabe()) this.route();
                return;
            }
            if (endgueltigGescheitert(ergebnis.error)) {
                einladungVergessen();
                // Den eigenen Link geöffnet: das ist kein Fehler, den man sehen muss.
                if (!/eigenen/i.test(ergebnis.error)) showError(`Einladung: ${ergebnis.error}`);
            }
        }).catch((e) => console.warn('[Einladung] nicht angenommen', e));
    }

    /**
     * Beim ersten Anmelden eines neuen, noch leeren Kontos: das Karussell
     * "Was hast du schon gesehen?" (components/Willkommen.js). Es kommt vor
     * der Frage nach Mitteilungen – die wartet, bis es zu ist. Danach wird
     * die Seite neu gezeichnet: auf der Startseite steht dann, was noch fehlt.
     */
    vielleichtWillkommenZeigen(path) {
        if (!store.isCloud || ['auth', 'invite'].includes(path)) return;
        const profil = store._profile;
        // Erst wenn die Abende aus der Cloud da sind: bis dahin sieht jedes
        // Konto leer aus. Der nächste Aufruf kommt mit dem Neuzeichnen danach.
        if (!profil?.id || !store.abgeglichen || this._willkommenGeprueft === profil.id) return;
        // Liegt gerade ein anderes Fenster obenauf, wird beim nächsten
        // Zeichnen wieder geprüft – nicht für diesen Seitenaufruf aufgegeben.
        if (document.querySelector('.modal.modal--active')) return;
        this._willkommenGeprueft = profil.id;
        try {
            const faellig = willkommenFaellig({
                profilId: profil.id,
                profilErstellt: profil.created_at,
                abende: (store.getVisitsByUser('user-me') || []).length,
                gesehen: store.getSeenOperas().length,
            });
            if (!faellig) return;
            willkommenFenster({
                onFertig: () => {
                    if (!ungesicherteEingabe()) this.route();
                    else this.vielleichtNachMitteilungenFragen(this.currentPath());
                },
            });
        } catch (e) {
            console.warn('[Willkommen] nicht gezeigt', e);
        }
    }

    /**
     * Beim ersten Anmelden eines neuen Kontos auf diesem Gerät: Mitteilungen?
     * Einmal pro Seitenaufruf und Konto geprüft; ob die Frage fällig ist,
     * entscheidet mitteilungenFrageFaellig(). Nicht über der Anmeldung und
     * nicht über dem Annehmen einer Einladung – dort geht es gerade um etwas
     * anderes, gefragt wird auf der nächsten Seite.
     */
    vielleichtNachMitteilungenFragen(path) {
        if (!store.isCloud || ['auth', 'invite'].includes(path)) return;
        const profil = store._profile;
        if (!profil?.id || this._mitteilungenGeprueft === profil.id) return;
        // Erst das Willkommen: solange es offen ist oder noch nicht feststeht,
        // ob es kommt (die Abende sind noch unterwegs), wird nicht gefragt.
        // Sonst läge bei langsamem Netz die Frage zuerst da, und das
        // Willkommen käme in diesem Seitenaufruf gar nicht mehr. Ohne Netz
        // bleibt die Frage damit aus – sie braucht es ohnehin.
        if (document.querySelector('.willkommen') || this._willkommenGeprueft !== profil.id) return;
        this._mitteilungenGeprueft = profil.id;
        try {
            // Wer schon abonniert hat, hat die Erlaubnis erteilt – und dann
            // ist die Frage nicht mehr fällig. Ein eigener Blick aufs Abo
            // erübrigt sich.
            let nachUmzug = false;
            try { nachUmzug = localStorage.getItem(UMZUG_MITTEILUNGEN) === '1'; } catch { /* egal */ }
            if (!mitteilungenFrageFaellig({ profilErstellt: profil.created_at, nachUmzug })) return;
            try { localStorage.removeItem(UMZUG_MITTEILUNGEN); } catch { /* egal */ }
            if (!document.querySelector('.mitteilungen-frage')) mitteilungenFrage();
        } catch (e) {
            console.warn('[Mitteilungen] Frage nicht gestellt', e);
        }
    }

    /**
     * Einmal je Gerät: was das letzte große Update gebracht hat (siehe
     * neuigkeiten.js). Nicht über der Anmeldung und nicht über einem anderen
     * Fenster, etwa der Frage nach Mitteilungen – dann beim nächsten Start.
     * Ist das Profil beim ersten Zeichnen noch nicht da, kommt der Aufruf
     * wieder, wenn init() nach dem Abgleich neu zeichnet.
     */
    vielleichtNeuigkeitZeigen(path) {
        if (!store.isCloud || ['auth', 'invite'].includes(path)) return;
        const profil = store._profile;
        if (!profil?.id || this._neuigkeitGeprueft === profil.id) return;
        this._neuigkeitGeprueft = profil.id;
        try {
            if (!neuigkeitFaellig({ profilErstellt: profil.created_at })) return;
            if (document.querySelector('.modal.modal--active')) return;
            neuigkeitFenster();
        } catch (e) {
            console.warn('[Neuigkeit] nicht gezeigt', e);
        }
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
// Nicht abgefangene Fehler ins Fehlerprotokoll (src/fehlerprotokoll.js) –
// vor dem Start der App, damit auch Fehler beim Start ankommen.
fehlerprotokollEinrichten({ senden: fehlerMelden, angemeldet: () => store.isCloud });

new App();
