// Store – Hybrid: Supabase (Cloud) + localStorage (Offline-Fallback)
import { operaHouses } from '../data/operaHouses.js';
import { operas } from '../data/operas.js';
import { isSupabaseConfigured } from '../config.js';
import * as sb from './supabase.js';

const STORAGE_KEY = 'opernlog_data';
const STORE_VERSION = 3;

function getDefaultData() {
    return {
        version: STORE_VERSION,
        currentUser: {
            id: 'user-me',
            name: 'Opernfan',
            avatar: 'OF',
            avatarIcon: '',
            bio: 'Leidenschaftlicher Opernbesucher.',
            joined: new Date().toISOString().split('T')[0],
        },
        friends: [],
        follows: [],
        myVisits: [],
        myLists: [],
        // Werke, die man vor OpernLog gesehen hat – nur die Kennung, ohne
        // Datum, Haus oder Bewertung. Bewusst getrennt von myVisits.
        seenOperas: [],
    };
}

class Store {
    constructor() {
        this.data = this.load();
        this.listeners = [];
        this._session = null;
        this._profile = null;
        this._cloudMode = false;
        this.pendingSuggestions = { opera: false, house: false };


        // Initialize Supabase session
        if (isSupabaseConfigured()) {
            this.initCloud();
        }
    }

    async initCloud() {
        try {
            // Use waitForInitialSession to properly handle OAuth redirects
            const session = await sb.waitForInitialSession();
            if (session) {
                this._session = session;
                this._profile = await sb.getProfile(session.user.id);
                this._cloudMode = true;
            }
        } catch (e) {
            // Beim Start weiterlaufen, aber den Zustand festhalten statt ihn
            // nur in die Konsole zu schreiben.
            console.error('[Store] Cloud-Init fehlgeschlagen', e);
            this.syncError = e;
        }
    }

    get isCloud() { return this._cloudMode && this._session; }
    get isConfigured() { return isSupabaseConfigured(); }

    // Letzter fehlgeschlagener Abgleich mit der Cloud, oder null.
    // Wird gesetzt, wenn lokale Daten angezeigt werden, die womöglich veraltet
    // sind – die Oberfläche kann darauf hinweisen, statt Veraltetes als
    // aktuell auszugeben.
    syncError = null;

    async refreshSession() {
        if (!isSupabaseConfigured()) return;
        // Welche Teilbereiche sich nicht abgleichen ließen. Der Abgleich bricht
        // nicht komplett ab, wenn ein Bereich scheitert – aber er tut auch
        // nicht so, als wäre alles frisch.
        const failures = [];
        this.syncError = null;

        const session = await sb.getSession();
        if (session) {
            this._session = session;
            this._profile = await sb.getProfile(session.user.id);
            this._cloudMode = true;

            // Sync cloud profile to local data so it persists
            if (this._profile) {
                this.data.currentUser = {
                    ...this.data.currentUser,
                    id: this._profile.id,
                    name: this._profile.username,
                    avatar: this._profile.avatar_initials || this._profile.username?.slice(0, 2).toUpperCase() || 'OF',
                    avatarIcon: this._profile.avatar_icon || '',
                    bio: this._profile.bio || '',
                    joined: this._profile.created_at?.split('T')[0] || this.data.currentUser.joined,
                };

                // Sync lists from cloud to avoid cross-account bleed
                try {
                    const cloudLists = await sb.getMyListsCloud();

                    // Auto-deduplicate wishlists
                    const wishlists = cloudLists.filter(l => l.type === 'wishlist');
                    if (wishlists.length > 1) {
                        for (let i = 1; i < wishlists.length; i++) {
                            const dupe = wishlists[i];
                            try {
                                await sb.deleteListCloud(dupe.id);
                                const index = cloudLists.findIndex(l => l.id === dupe.id);
                                if (index !== -1) cloudLists.splice(index, 1);
                            } catch (e) {
                                // Nicht kritisch: das Duplikat bleibt bestehen
                                console.error('[Store] Doppelte Wunschliste löschen', e);
                            }
                        }
                    }

                    this.data.myLists = cloudLists.map(l => ({
                        id: l.id,
                        userId: 'user-me',
                        name: l.name,
                        description: l.description || '',
                        type: l.type || 'operas',
                        items: l.items || [],
                        isPublic: l.is_public !== false,
                        likes: l.likes || 0,
                        comments: l.comments || [],
                    }));
                } catch (e) {
                    console.error('[Store] Listen-Abgleich fehlgeschlagen', e);
                    failures.push('Listen');
                }

                // Sync visits from cloud to avoid cross-account bleed
                try {
                    const cloudVisits = await sb.getMyVisitsCloud();
                    this.data.myVisits = cloudVisits.map(v => ({
                        ...sb.mapCloudVisit(v),
                        // Eigene Besuche laufen in der Oberfläche unter 'user-me'
                        userId: 'user-me',
                        createdAt: v.created_at?.split('T')[0] || v.date,
                    }));
                } catch (e) {
                    console.error('[Store] Besuche-Abgleich fehlgeschlagen', e);
                    failures.push('Besuche');
                }

                // Sync "bereits gesehen"
                try {
                    this.data.seenOperas = await sb.getSeenOperasCloud();
                } catch (e) {
                    console.error('[Store] Abgleich der gesehenen Werke fehlgeschlagen', e);
                    failures.push('Gesehene Werke');
                }

                // Sync suggestions state
                try {
                    this.pendingSuggestions.opera = await sb.hasPendingSuggestionCloud('opera');
                    this.pendingSuggestions.house = await sb.hasPendingSuggestionCloud('house');
                } catch (e) {
                    console.error('[Store] Vorschlags-Abgleich fehlgeschlagen', e);
                    failures.push('Vorschläge');
                }

                this.save();
            } else {
                // Profile not found – auto-create from auth metadata
                const meta = session.user?.user_metadata;
                const username = meta?.username || session.user?.email?.split('@')[0] || 'Opernfan';
                const initials = username.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

                try {
                    const supabase = sb.getSupabase();
                    const { error } = await supabase.from('profiles').upsert({
                        id: session.user.id,
                        username,
                        avatar_initials: initials,
                    }, { onConflict: 'id' });

                    if (error) throw error;
                    // Re-fetch the newly created profile
                    this._profile = await sb.getProfile(session.user.id);
                } catch (e) {
                    // Ohne Profil funktioniert kaum etwas – das muss sichtbar sein.
                    console.error('[Store] Profil anlegen fehlgeschlagen', e);
                    failures.push('Profil');
                }

                this.data.currentUser.name = username;
                this.data.currentUser.avatar = initials;
                this.data.currentUser.id = session.user.id;
                this.save();
            }
        } else {
            this._session = null;
            this._profile = null;
            this._cloudMode = false;
        }

        if (failures.length) {
            this.syncError = new Error(
                `${failures.join(', ')} konnten nicht geladen werden. Angezeigte Daten sind möglicherweise nicht aktuell.`
            );
        }
        this.notify();
    }

    // ── localStorage ─────────────────────────────────────
    load() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (!parsed.version || parsed.version < STORE_VERSION) {
                    return getDefaultData();
                }
                return parsed;
            }
        } catch (e) {
            // Bewusst weiterlaufen: localStorage kann im privaten Modus fehlen
            // oder beschädigt sein. Die Cloud ist die Wahrheitsquelle, der
            // lokale Stand nur ein Zwischenspeicher.
            console.error('[Store] Lokalen Stand lesen fehlgeschlagen', e);
        }
        return getDefaultData();
    }

    save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
        } catch (e) {
            // Siehe load(): ein fehlgeschlagener Cache-Schreibvorgang ist kein
            // Datenverlust, solange die Cloud geschrieben wurde.
            console.error('[Store] Lokalen Stand schreiben fehlgeschlagen', e);
        }
        this.notify();
    }

    subscribe(fn) {
        this.listeners.push(fn);
        return () => { this.listeners = this.listeners.filter(l => l !== fn); };
    }

    notify() {
        this.listeners.forEach(fn => fn(this.data));
    }

    // ── User (Hybrid) ────────────────────────────────────
    getCurrentUser() {
        if (this.isCloud && this._profile) {
            return {
                id: this._profile.id,
                name: this._profile.username,
                avatar: this._profile.avatar_initials,
                avatarIcon: this._profile.avatar_icon || '',
                bio: this._profile.bio || '',
                joined: this._profile.created_at?.split('T')[0] || '',
            };
        }
        return this.data.currentUser;
    }

    async updateProfile(updates) {
        const avatar = updates.avatar || (updates.name ? updates.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : null);

        if (this.isCloud) {
            const cloudUpdates = {};
            if (updates.name) cloudUpdates.username = updates.name;
            if (updates.bio !== undefined) cloudUpdates.bio = updates.bio;
            if (avatar) cloudUpdates.avatar_initials = avatar;
            if (updates.avatarIcon !== undefined) cloudUpdates.avatar_icon = updates.avatarIcon;

            // Erst die Cloud – schlägt sie fehl, bleibt lokal nichts zurück,
            // was beim nächsten Laden wieder verschwinden würde.
            await sb.updateProfile(cloudUpdates);

            // Update in-memory profile so getCurrentUser() reflects changes immediately
            if (this._profile) {
                if (updates.name) this._profile.username = updates.name;
                if (updates.bio !== undefined) this._profile.bio = updates.bio;
                if (avatar) this._profile.avatar_initials = avatar;
                if (updates.avatarIcon !== undefined) this._profile.avatar_icon = updates.avatarIcon;
            }
        }

        this.data.currentUser = { ...this.data.currentUser, ...updates };
        if (avatar) {
            this.data.currentUser.avatar = avatar;
        }
        this.save();
    }

    getUser(userId) {
        if (userId === 'user-me' || userId === this._profile?.id) return this.getCurrentUser();
        return this.data.friends.find(u => u.id === userId);
    }

    getAllUsers() { return [this.getCurrentUser(), ...this.data.friends]; }

    // ── Friends (Hybrid) ─────────────────────────────────
    getFriends() {
        return this.data.friends;
    }

    async getFriendsCloud() {
        if (!this.isCloud) return this.data.friends;
        return await sb.getFollowing();
    }

    addFriend(name, bio = '') {
        const id = 'friend-' + Date.now();
        const avatar = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        const friend = { id, name, avatar, bio, joined: new Date().toISOString().split('T')[0] };
        this.data.friends.push(friend);
        this.data.follows.push(id);
        this.save();
        return friend;
    }

    async removeFriend(userId) {
        if (this.isCloud) await sb.unfriend(userId);
        this.data.friends = this.data.friends.filter(f => f.id !== userId);
        this.data.follows = this.data.follows.filter(id => id !== userId);
        this.save();
    }

    // ── Visits (Hybrid) ──────────────────────────────────
    getAllVisits() {
        return [...this.data.myVisits].sort((a, b) => new Date(b.date) - new Date(a.date));
    }

    getVisitsByUser(userId) {
        if (userId === 'user-me' || userId === this._profile?.id) {
            return [...this.data.myVisits].sort((a, b) => new Date(b.date) - new Date(a.date));
        }
        return [];
    }

    getVisitsByHouse(houseId) {
        return this.getAllVisits().filter(v => v.houseId === houseId);
    }

    getVisitsByOpera(operaId) {
        return this.getAllVisits().filter(v => v.operaId === operaId);
    }

    async addVisit(visit) {
        const newVisit = {
            id: 'visit-' + Date.now(),
            userId: 'user-me',
            ...visit,
            likes: 0,
            likedBy: [],
            comments: [],
            createdAt: new Date().toISOString().split('T')[0],
        };
        this.data.myVisits.unshift(newVisit);
        this.save();

        if (this.isCloud) {
            try {
                const cloudData = await sb.addVisitCloud(visit);
                // Replace local ID with cloud UUID so delete/update work correctly
                const localVisit = this.data.myVisits.find(v => v.id === newVisit.id);
                if (localVisit && cloudData?.id) {
                    localVisit.id = cloudData.id;
                    newVisit.id = cloudData.id;
                    this.save();
                }
            } catch (e) {
                // Nicht gespeicherten Eintrag wieder entfernen, sonst steht er
                // bis zum nächsten Laden da und verschwindet dann kommentarlos.
                this.data.myVisits = this.data.myVisits.filter(v => v.id !== newVisit.id);
                this.save();
                throw e;
            }
        }

        // Erst nach erfolgreichem Speichern von der Wunschliste nehmen
        if (visit.operaId && this.isOnWishlist(visit.operaId)) {
            await this.removeFromWishlist(visit.operaId);
        }

        return newVisit;
    }

    async updateVisit(visitId, updates) {
        const visit = this.data.myVisits.find(v => v.id === visitId);
        if (!visit) return;

        const previous = { ...visit };
        Object.assign(visit, updates);
        this.save();

        if (this.isCloud) {
            try {
                await sb.updateVisitCloud(visitId, updates);
            } catch (e) {
                // Cloud ist die Quelle der Wahrheit – lokale Änderung zurücknehmen,
                // damit die UI nicht Erfolg zeigt und der Eintrag beim Neuladen zurückspringt.
                Object.assign(visit, previous);
                this.save();
                throw e;
            }
        }
    }

    async deleteVisit(visitId) {
        // Erst löschen lassen, dann lokal entfernen. Andersherum wäre der
        // Eintrag verschwunden und beim nächsten Laden wieder da.
        if (this.isCloud) await sb.deleteVisitCloud(visitId);
        this.data.myVisits = this.data.myVisits.filter(v => v.id !== visitId);
        this.save();
    }

    // ── Cloud-only async methods ─────────────────────────
    async getFeedCloud() {
        if (!this.isCloud) return this.getAllVisits().slice(0, 30);
        return await sb.getFeedCloud();
    }

    async getVisit(visitId) {
        // Try local first
        let visit = this.data.myVisits.find(v => String(v.id) === String(visitId));
        if (visit) return visit;

        if (this.isCloud) {
            return await sb.getVisitByIdCloud(visitId);
        }
        return null;
    }

    async getUserVisitsCloud(userId) {
        if (!this.isCloud) return this.getVisitsByUser(userId);
        return await sb.getUserVisitsCloud(userId);
    }

    async getUserProfileCloud(userId) {
        if (!this.isCloud) return this.getUser(userId);
        const profile = await sb.getProfile(userId);
        if (!profile) return null;
        return {
            id: profile.id,
            name: profile.username,
            avatar: profile.avatar_initials,
            bio: profile.bio || '',
            joined: profile.created_at?.split('T')[0] || '',
        };
    }

    async getUserStatsCloud(userId) {
        if (!this.isCloud) return this.getStats(userId);
        return await sb.getUserStatsCloud(userId);
    }

    async areFriendsCloud(userId) {
        if (!this.isCloud) return this.isFollowing(userId);
        return await sb.areFriends(userId);
    }

    async getRelationshipCloud(userId) {
        if (!this.isCloud) return this.isFollowing(userId) ? 'friends' : 'none';
        return await sb.getRelationship(userId);
    }

    async sendFriendRequestCloud(userId) {
        if (!this.isCloud) return this.toggleFollow(userId);
        return await sb.sendFriendRequest(userId);
    }

    async unfriendCloud(userId) {
        if (!this.isCloud) return this.toggleFollow(userId);
        return await sb.unfriend(userId);
    }

    async getPendingRequestsCloud() {
        if (!this.isCloud) return [];
        return await sb.getPendingRequestsReceived();
    }

    // ── Ratings ──────────────────────────────────────────
    getAverageRatingForHouse(houseId) {
        const visits = this.getVisitsByHouse(houseId);
        if (visits.length === 0) return null;
        return visits.reduce((sum, v) => sum + v.rating, 0) / visits.length;
    }

    getAverageRatingForOpera(operaId) {
        const visits = this.getVisitsByOpera(operaId);
        if (visits.length === 0) return null;
        return visits.reduce((sum, v) => sum + v.rating, 0) / visits.length;
    }

    // ── Likes ────────────────────────────────────────────
    toggleLikeVisit(visitId) {
        const visit = this.data.myVisits.find(v => v.id === visitId);
        if (visit) {
            if (!visit.likedBy) visit.likedBy = [];
            const idx = visit.likedBy.indexOf('user-me');
            if (idx === -1) {
                visit.likedBy.push('user-me');
                visit.likes = (visit.likes || 0) + 1;
            } else {
                visit.likedBy.splice(idx, 1);
                visit.likes = Math.max(0, (visit.likes || 1) - 1);
            }
            this.save();
        }
    }

    // ── Comments ─────────────────────────────────────────
    addComment(targetId, text, commentId) {
        let target = this.data.myVisits.find(v => v.id === targetId);
        if (!target) {
            target = this.data.myLists.find(l => l.id === targetId);
        }

        if (target) {
            if (!target.comments) target.comments = [];
            target.comments.push({
                id: commentId || ('comment-' + Date.now()),
                userId: 'user-me',
                text,
                date: new Date().toISOString().split('T')[0],
            });
            this.save();
        }
    }

    removeComment(targetId, commentId) {
        let target = this.data.myVisits.find(v => v.id === targetId);
        if (!target) {
            target = this.data.myLists.find(l => l.id === targetId);
        }

        if (target && target.comments) {
            target.comments = target.comments.filter(c => c.id !== commentId);
            this.save();
        }
    }

    // ── Follows (local) ──────────────────────────────────
    getFollows() { return this.data.follows; }
    isFollowing(userId) { return this.data.follows.includes(userId); }

    toggleFollow(userId) {
        const idx = this.data.follows.indexOf(userId);
        if (idx === -1) {
            this.data.follows.push(userId);
        } else {
            this.data.follows.splice(idx, 1);
        }
        this.save();
    }

    // ── Feed (local) ─────────────────────────────────────
    getFeed() {
        return this.getAllVisits().slice(0, 30);
    }

    // ── Lists ────────────────────────────────────────────
    getAllLists() {
        return [...this.data.myLists].sort((a, b) => (b.likes || 0) - (a.likes || 0));
    }

    getMyLists() { return this.data.myLists; }

    getListsByUser(userId) {
        if (userId === 'user-me') return this.data.myLists;
        return [];
    }

    async addList(list) {
        const newList = {
            id: 'list-' + Date.now(),
            userId: 'user-me',
            ...list,
            likes: 0,
            comments: [],
            createdAt: new Date().toISOString().split('T')[0],
        };
        this.data.myLists.push(newList);
        this.save();

        if (this.isCloud) {
            try {
                const cloudData = await sb.addListCloud(newList);
                const local = this.data.myLists.find(l => l.id === newList.id);
                if (local && cloudData?.id) {
                    local.id = cloudData.id;
                    newList.id = cloudData.id;
                    this.save();
                }
            } catch (e) {
                // Nicht angelegte Liste wieder entfernen
                this.data.myLists = this.data.myLists.filter(l => l.id !== newList.id);
                this.save();
                throw e;
            }
        }

        return newList;
    }

    async updateList(listId, updates) {
        const list = this.data.myLists.find(l => l.id === listId);
        if (!list) return;

        const previous = { ...list };
        Object.assign(list, updates);
        this.save();

        if (this.isCloud) {
            try {
                await sb.updateListCloud(listId, this._listToCloud(updates));
            } catch (e) {
                Object.assign(list, previous);
                this.save();
                throw e;
            }
        }
    }

    // Feldnamen des Clients auf die Spalten der Tabelle abbilden
    _listToCloud(updates) {
        const payload = {};
        if (updates.name !== undefined) payload.name = updates.name;
        if (updates.description !== undefined) payload.description = updates.description;
        if (updates.type !== undefined) payload.type = updates.type;
        if (updates.items !== undefined) payload.items = updates.items;
        if (updates.isPublic !== undefined) payload.is_public = updates.isPublic;
        return payload;
    }

    async deleteList(listId) {
        if (this.isCloud) await sb.deleteListCloud(listId);
        this.data.myLists = this.data.myLists.filter(l => l.id !== listId);
        this.save();
    }

    // ── Wishlist ─────────────────────────────────────────
    getWishlist() {
        return this.data.myLists.find(l => l.type === 'wishlist') || null;
    }

    isOnWishlist(operaId) {
        const wl = this.getWishlist();
        return wl ? wl.items.includes(operaId) : false;
    }

    async addToWishlist(operaId) {
        const wl = this.getWishlist();
        if (!wl) {
            await this.addList({
                name: 'Wunschliste',
                description: 'Opern, die ich noch sehen möchte',
                type: 'wishlist',
                items: [operaId],
            });
            return;
        }
        if (wl.items.includes(operaId)) return;
        await this.updateList(wl.id, { items: [...wl.items, operaId] });
    }

    async removeFromWishlist(operaId) {
        const wl = this.getWishlist();
        if (!wl || !wl.items.includes(operaId)) return;
        await this.updateList(wl.id, { items: wl.items.filter(id => id !== operaId) });
    }

    // ── Bereits gesehen (ohne Besuchseintrag) ────────────
    //
    // Für Werke, die man vor OpernLog gesehen hat. Diese Markierungen zählen
    // ausdrücklich NICHT als Besuche: sie haben kein Datum, kein Haus und
    // keine Bewertung. Sie fließen in die blinden Flecken ein, nicht in die
    // Zahl der Abende.
    getSeenOperas() {
        return this.data.seenOperas || [];
    }

    /**
     * Nur die ausdrückliche Markierung. Zum Umschalten des Knopfes.
     */
    isSeenOpera(operaId) {
        return this.getSeenOperas().includes(operaId);
    }

    /**
     * Gibt es zu diesem Werk einen eigenen geloggten Besuch?
     *
     * Ein geloggter Besuch erzeugt bewusst KEINE Zeile in seen_operas: das
     * wäre derselbe Sachverhalt an zwei Stellen, und nach dem Löschen des
     * Besuchs bliebe eine Markierung stehen, die niemand gesetzt hat. Die
     * Werkseite führt beides stattdessen bei der Anzeige zusammen.
     */
    hasLoggedOpera(operaId) {
        return (this.data.myVisits || []).some(v => v.operaId === operaId);
    }

    async markSeenOpera(operaId) {
        if (this.isSeenOpera(operaId)) return;
        this.data.seenOperas = [...this.getSeenOperas(), operaId];
        this.save();

        if (this.isCloud) {
            try {
                await sb.addSeenOperaCloud(operaId);
            } catch (e) {
                // Wie überall hier: die Cloud ist die Quelle der Wahrheit.
                // Ohne das Zurücknehmen stünde die Markierung bis zum
                // nächsten Laden da und verschwände dann kommentarlos.
                this.data.seenOperas = this.getSeenOperas().filter(id => id !== operaId);
                this.save();
                throw e;
            }
        }
    }

    async unmarkSeenOpera(operaId) {
        if (!this.isSeenOpera(operaId)) return;
        const vorher = this.getSeenOperas();
        this.data.seenOperas = vorher.filter(id => id !== operaId);
        this.save();

        if (this.isCloud) {
            try {
                await sb.removeSeenOperaCloud(operaId);
            } catch (e) {
                this.data.seenOperas = vorher;
                this.save();
                throw e;
            }
        }
    }

    // ── Stats ────────────────────────────────────────────
    getStats(userId) {
        const visits = this.getVisitsByUser(userId);

        // "Werke gesehen" zählt geloggte UND als gesehen markierte Werke: ein
        // markiertes Werk hat man gesehen, nur eben ohne Abend. Bei allem
        // anderen bleiben Markierungen draußen – sie haben kein Datum, kein
        // Haus und keine Bewertung. "6 Besuche" muss weiterhin sechs geloggte
        // Abende bedeuten, und der Lieblingskomponist braucht Bewertungen,
        // die eine Markierung gar nicht mitbringt.
        //
        // Nur für das eigene Profil: fremde Markierungen sind ohnehin nicht
        // lesbar, und die eigenen dürfen auf keinen Fall in fremde Zahlen
        // geraten.
        const eigenesProfil = userId === 'user-me' || userId === this._profile?.id;
        const markiert = eigenesProfil ? this.getSeenOperas() : [];
        const werkeGesehen = new Set([...visits.map(v => v.operaId), ...markiert]).size;

        if (visits.length === 0) {
            return {
                totalVisits: 0, avgRating: 0, uniqueHouses: 0,
                uniqueOperas: werkeGesehen, topComposer: '-', topHouse: '-',
            };
        }

        const houses = new Set(visits.map(v => v.houseId));

        const composerData = {};
        visits.forEach(v => {
            const opera = operas.find(o => o.id === v.operaId);
            if (opera) {
                if (!composerData[opera.composer]) {
                    composerData[opera.composer] = { count: 0, totalRating: 0 };
                }
                composerData[opera.composer].count += 1;
                composerData[opera.composer].totalRating += (v.rating || 0);
            }
        });
        const topComposer = Object.entries(composerData)
            .sort((a, b) => {
                // Primary: most visits; Tiebreaker: highest average rating
                if (b[1].count !== a[1].count) return b[1].count - a[1].count;
                return (b[1].totalRating / b[1].count) - (a[1].totalRating / a[1].count);
            })[0];

        const houseCount = {};
        visits.forEach(v => {
            houseCount[v.houseId] = (houseCount[v.houseId] || 0) + 1;
        });
        const topHouseId = Object.entries(houseCount).sort((a, b) => b[1] - a[1])[0];
        const topHouse = topHouseId ? operaHouses.find(h => h.id === topHouseId[0]) : null;

        return {
            totalVisits: visits.length,
            avgRating: (visits.reduce((s, v) => s + v.rating, 0) / visits.length).toFixed(1),
            uniqueHouses: houses.size,
            uniqueOperas: werkeGesehen,
            topComposer: topComposer ? topComposer[0] : '-',
            topHouse: topHouse ? topHouse.name : '-',
        };
    }

    // ── Suggestions ──────────────────────────────────────
    hasPendingSuggestion(type) {
        return this.pendingSuggestions[type];
    }

    async submitSuggestion(type, details) {
        if (!this.isCloud) return false;
        try {
            await sb.addSuggestionCloud({ type, ...details });
            this.pendingSuggestions[type] = true;
            this.notify();
            return true;
        } catch (e) {
            console.error('Failed to submit suggestion:', e);
            throw e;
        }
    }

    // ── Reset ────────────────────────────────────────────
    reset() {
        localStorage.removeItem(STORAGE_KEY);
        this.data = getDefaultData();
        this.save();
    }

    // ── Auth helpers ─────────────────────────────────────
    async logout() {
        if (this.isCloud) {
            await sb.signOut();
        }
        this._session = null;
        this._profile = null;
        this._cloudMode = false;
        
        // Ensure no cross-account data bleeding
        this.data = getDefaultData();
        this.save();
        
        this.notify();
    }
}

export const store = new Store();
