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
    };
}

class Store {
    constructor() {
        this.data = this.load();
        this.listeners = [];
        this._session = null;
        this._profile = null;
        this._cloudMode = false;

        // Initialize Supabase session
        if (isSupabaseConfigured()) {
            this.initCloud();
        }
    }

    async initCloud() {
        try {
            const session = await sb.getSession();
            if (session) {
                this._session = session;
                this._profile = await sb.getProfile(session.user.id);
                this._cloudMode = true;
            }
        } catch (e) {
            console.warn('Supabase init failed, using offline mode:', e);
        }
    }

    get isCloud() { return this._cloudMode && this._session; }
    get isConfigured() { return isSupabaseConfigured(); }

    async refreshSession() {
        if (!isSupabaseConfigured()) return;
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
                    this.data.myLists = cloudLists.map(l => ({
                        id: l.id,
                        userId: 'user-me',
                        name: l.name,
                        description: l.description || '',
                        type: l.type || 'operas',
                        items: l.items || [],
                        isPublic: l.is_public !== false,
                        likes: l.likes || 0,
                    }));
                } catch (e) {
                    console.warn('Cloud list sync failed:', e);
                }

                this.save();
            } else {
                // Profile not found – auto-create from auth metadata
                const meta = session.user?.user_metadata;
                const username = meta?.username || session.user?.email?.split('@')[0] || 'Opernfan';
                const initials = username.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

                console.log('Profile missing, auto-creating for user:', session.user.id, username);

                try {
                    const supabase = sb.getSupabase();
                    const { error } = await supabase.from('profiles').upsert({
                        id: session.user.id,
                        username,
                        avatar_initials: initials,
                    }, { onConflict: 'id' });

                    if (error) {
                        console.warn('Auto-create profile error:', error);
                    } else {
                        // Re-fetch the newly created profile
                        this._profile = await sb.getProfile(session.user.id);
                    }
                } catch (e) {
                    console.warn('Failed to auto-create profile:', e);
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
            console.warn('Failed to load store:', e);
        }
        return getDefaultData();
    }

    save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
        } catch (e) {
            console.warn('Failed to save store:', e);
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

    updateProfile(updates) {
        const avatar = updates.avatar || (updates.name ? updates.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : null);
        if (this.isCloud) {
            const cloudUpdates = {};
            if (updates.name) cloudUpdates.username = updates.name;
            if (updates.bio !== undefined) cloudUpdates.bio = updates.bio;
            if (avatar) cloudUpdates.avatar_initials = avatar;
            if (updates.avatarIcon !== undefined) cloudUpdates.avatar_icon = updates.avatarIcon;
            sb.updateProfile(cloudUpdates);
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

    removeFriend(userId) {
        this.data.friends = this.data.friends.filter(f => f.id !== userId);
        this.data.follows = this.data.follows.filter(id => id !== userId);
        if (this.isCloud) sb.unfollow(userId);
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

    addVisit(visit) {
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

        // Auto-remove from wishlist if present
        if (visit.operaId && this.isOnWishlist(visit.operaId)) {
            this.removeFromWishlist(visit.operaId);
        }

        // Also sync to cloud – update local ID with cloud UUID
        if (this.isCloud) {
            sb.addVisitCloud(visit).then(cloudData => {
                if (cloudData && cloudData.id) {
                    // Replace local ID with cloud UUID so delete/update work correctly
                    const localVisit = this.data.myVisits.find(v => v.id === newVisit.id);
                    if (localVisit) {
                        localVisit.id = cloudData.id;
                        this.save();
                    }
                }
            }).catch(e => console.warn('Cloud sync failed:', e));
        }

        return newVisit;
    }

    updateVisit(visitId, updates) {
        const visit = this.data.myVisits.find(v => v.id === visitId);
        if (visit) {
            Object.assign(visit, updates);
            this.save();
            if (this.isCloud) {
                sb.updateVisitCloud(visitId, updates).catch(e => console.warn('Cloud update failed:', e));
            }
        }
    }

    deleteVisit(visitId) {
        this.data.myVisits = this.data.myVisits.filter(v => v.id !== visitId);
        if (this.isCloud) sb.deleteVisitCloud(visitId).catch(() => { });
        this.save();
    }

    // ── Cloud-only async methods ─────────────────────────
    async getFeedCloud() {
        if (!this.isCloud) return this.getAllVisits().slice(0, 30);
        return await sb.getFeedCloud();
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

    async isFollowingCloud(userId) {
        if (!this.isCloud) return this.isFollowing(userId);
        return await sb.isFollowing(userId);
    }

    async toggleFollowCloud(userId) {
        if (!this.isCloud) return this.toggleFollow(userId);
        const following = await sb.isFollowing(userId);
        if (following) {
            await sb.unfollow(userId);
        } else {
            await sb.follow(userId);
        }
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
    addComment(visitId, text) {
        const visit = this.data.myVisits.find(v => v.id === visitId);
        if (visit) {
            if (!visit.comments) visit.comments = [];
            visit.comments.push({
                userId: 'user-me',
                text,
                date: new Date().toISOString().split('T')[0],
            });
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

    addList(list) {
        const newList = {
            id: 'list-' + Date.now(),
            userId: 'user-me',
            ...list,
            likes: 0,
            createdAt: new Date().toISOString().split('T')[0],
        };
        this.data.myLists.push(newList);
        this.save();

        // Sync to cloud
        if (this.isCloud) {
            sb.addListCloud(newList).then(cloudData => {
                if (cloudData?.id) {
                    const local = this.data.myLists.find(l => l.id === newList.id);
                    if (local) { local.id = cloudData.id; this.save(); }
                }
            }).catch(e => console.warn('Cloud list create failed:', e));
        }

        return newList;
    }

    updateList(listId, updates) {
        const list = this.data.myLists.find(l => l.id === listId);
        if (list) {
            Object.assign(list, updates);
            this.save();
        }
    }

    deleteList(listId) {
        this.data.myLists = this.data.myLists.filter(l => l.id !== listId);
        this.save();

        if (this.isCloud) {
            sb.deleteListCloud(listId)
                .catch(e => console.warn('Cloud list delete failed:', e));
        }
    }

    // ── Wishlist ─────────────────────────────────────────
    getWishlist() {
        return this.data.myLists.find(l => l.type === 'wishlist') || null;
    }

    isOnWishlist(operaId) {
        const wl = this.getWishlist();
        return wl ? wl.items.includes(operaId) : false;
    }

    addToWishlist(operaId) {
        let wl = this.getWishlist();
        if (!wl) {
            wl = this.addList({
                name: 'Wunschliste',
                description: 'Opern, die ich noch sehen möchte',
                type: 'wishlist',
                items: [operaId],
            });
            // Sync to cloud
            if (this.isCloud) {
                sb.addListCloud(wl).then(cloudData => {
                    if (cloudData?.id) {
                        const local = this.data.myLists.find(l => l.id === wl.id);
                        if (local) { local.id = cloudData.id; this.save(); }
                    }
                }).catch(e => console.warn('Wishlist cloud create failed:', e));
            }
        } else {
            if (!wl.items.includes(operaId)) {
                wl.items.push(operaId);
                this.save();
                if (this.isCloud) {
                    sb.updateListCloud(wl.id, { items: wl.items })
                        .catch(e => console.warn('Wishlist cloud update failed:', e));
                }
            }
        }
    }

    removeFromWishlist(operaId) {
        const wl = this.getWishlist();
        if (wl) {
            wl.items = wl.items.filter(id => id !== operaId);
            this.save();
            if (this.isCloud) {
                sb.updateListCloud(wl.id, { items: wl.items })
                    .catch(e => console.warn('Wishlist cloud update failed:', e));
            }
        }
    }

    // ── Stats ────────────────────────────────────────────
    getStats(userId) {
        const visits = this.getVisitsByUser(userId);
        if (visits.length === 0) return { totalVisits: 0, avgRating: 0, uniqueHouses: 0, uniqueOperas: 0, topComposer: '-', topHouse: '-' };

        const houses = new Set(visits.map(v => v.houseId));
        const operaIds = new Set(visits.map(v => v.operaId));

        const composerCount = {};
        visits.forEach(v => {
            const opera = operas.find(o => o.id === v.operaId);
            if (opera) {
                composerCount[opera.composer] = (composerCount[opera.composer] || 0) + 1;
            }
        });
        const topComposer = Object.entries(composerCount).sort((a, b) => b[1] - a[1])[0];

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
            uniqueOperas: operaIds.size,
            topComposer: topComposer ? topComposer[0] : '-',
            topHouse: topHouse ? topHouse.name : '-',
        };
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
        this.notify();
    }
}

export const store = new Store();
