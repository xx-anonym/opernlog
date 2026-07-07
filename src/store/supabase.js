// ── Supabase Client & Backend-Funktionen ─────────────────
import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from '../config.js';

let supabaseClient = null;
let _sessionReady = null;

// ── Init ─────────────────────────────────────────────────
export function getSupabase() {
    if (!supabaseClient && isSupabaseConfigured()) {
        // supabase is imported via CDN in index.html
        // DISABLE detectSessionInUrl – we handle hash tokens manually
        // because Supabase's built-in detection silently fails
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                flowType: 'implicit',
                detectSessionInUrl: false,
            }
        });
    }
    return supabaseClient;
}

// Parse OAuth tokens from the URL hash fragment
function parseOAuthHash() {
    const hash = window.location.hash;
    if (!hash || !hash.includes('access_token=')) return null;

    // Remove leading '#' and parse as URLSearchParams
    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');

    if (!accessToken || !refreshToken) return null;

    return { access_token: accessToken, refresh_token: refreshToken };
}

// Wait for the initial session (handles OAuth redirects manually)
export function waitForInitialSession() {
    if (_sessionReady) return _sessionReady;

    const sb = getSupabase();
    if (!sb) { _sessionReady = Promise.resolve(null); return _sessionReady; }

    _sessionReady = (async () => {
        // 1. Check if this is an OAuth redirect with tokens in the hash
        const oauthTokens = parseOAuthHash();
        if (oauthTokens) {
            console.log('[Auth] OAuth tokens found in hash, setting session manually...');
            try {
                const { data, error } = await sb.auth.setSession(oauthTokens);
                // Clear the hash tokens from URL regardless of outcome
                window.history.replaceState(null, '', window.location.pathname);
                if (error) {
                    console.error('[Auth] setSession failed:', error);
                    return null;
                } else {
                    console.log('[Auth] Session set successfully!');
                    return data.session;
                }
            } catch (e) {
                console.error('[Auth] setSession error:', e);
                window.history.replaceState(null, '', window.location.pathname);
                return null;
            }
        }

        // 2. No OAuth redirect – check for existing session
        try {
            const { data: { session } } = await sb.auth.getSession();
            return session || null;
        } catch (e) {
            console.warn('[Auth] getSession error:', e);
            return null;
        }
    })();

    return _sessionReady;
}

// ── Auth ─────────────────────────────────────────────────
export async function signUp(email, password, username, avatarIcon = '') {
    const sb = getSupabase();
    const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: {
            data: { username } // Store username in auth metadata too
        }
    });
    if (error) throw error;

    // Create profile – use upsert in case trigger already created one
    // Mark as complete since user chose username + icon during registration
    if (data.user) {
        const initials = username.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        const profileData = {
            id: data.user.id,
            username,
            avatar_initials: initials,
            profile_complete: true,
        };
        if (avatarIcon) profileData.avatar_icon = avatarIcon;
        const { error: profileError } = await sb.from('profiles').upsert(profileData, { onConflict: 'id' });
        if (profileError) {
            console.warn('Profile upsert error:', profileError);
        }
    }
    return data;
}

export async function signIn(email, password) {
    const sb = getSupabase();
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
}

export async function signInWithGoogle() {
    const sb = getSupabase();
    const { data, error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: {
            redirectTo: window.location.origin,
        },
    });
    if (error) throw error;
    return data;
}

export async function signOut() {
    const sb = getSupabase();
    const { error } = await sb.auth.signOut();
    if (error) throw error;
}

export async function resetPassword(email) {
    const sb = getSupabase();
    const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin,
    });
    if (error) throw error;
}

export async function getSession() {
    const sb = getSupabase();
    if (!sb) return null;
    const { data: { session } } = await sb.auth.getSession();
    return session;
}

export async function getProfile(userId) {
    const sb = getSupabase();
    const { data, error } = await sb.from('profiles').select('*').eq('id', userId).single();
    if (error) {
        console.error('[Supabase] getProfile error for userId', userId, ':', error);
        return null;
    }
    return data;
}

export async function getMyProfile() {
    const session = await getSession();
    if (!session) return null;
    return getProfile(session.user.id);
}

export async function updateProfile(updates) {
    const session = await getSession();
    if (!session) return;
    const sb = getSupabase();
    await sb.from('profiles').update(updates).eq('id', session.user.id);
}

export async function isProfileComplete(userId) {
    const sb = getSupabase();
    const { data, error } = await sb.from('profiles').select('profile_complete').eq('id', userId).single();
    if (error || !data) return false;
    return data.profile_complete === true;
}

export async function markProfileComplete(userId) {
    const sb = getSupabase();
    await sb.from('profiles').update({ profile_complete: true }).eq('id', userId);
}

// ── Invite Links ─────────────────────────────────────────
function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const arr = new Uint8Array(6);
    crypto.getRandomValues(arr);
    return Array.from(arr, b => chars[b % chars.length]).join('');
}

// Ensure profile exists in DB (fixes FK constraint issues)
async function ensureProfile(session) {
    const sb = getSupabase();

    // Check if profile already exists
    const { data, error: selectErr } = await sb.from('profiles').select('id').eq('id', session.user.id).maybeSingle();

    if (selectErr) {
        console.error('Profile check failed:', selectErr);
        // Don't throw – maybe we can still create it
    }

    if (data) {
        console.log('Profile exists for user:', session.user.id);
        return; // Profile exists, all good
    }

    // Profile missing – create it
    const meta = session.user?.user_metadata;
    let username = meta?.username || session.user?.email?.split('@')[0] || 'Opernfan';
    const initials = username.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

    console.log('Profile missing! Auto-creating for:', session.user.id, 'username:', username);

    // Try creating profile (might fail due to username UNIQUE constraint)
    let { error: insertErr } = await sb.from('profiles').upsert({
        id: session.user.id,
        username,
        avatar_initials: initials,
    }, { onConflict: 'id' });

    // If username taken, retry with unique suffix
    if (insertErr && insertErr.message?.includes('unique')) {
        const uniqueUsername = username + '_' + Math.random().toString(36).slice(2, 6);
        console.log('Username taken, retrying with:', uniqueUsername);
        const result = await sb.from('profiles').upsert({
            id: session.user.id,
            username: uniqueUsername,
            avatar_initials: initials,
        }, { onConflict: 'id' });
        insertErr = result.error;
    }

    if (insertErr) {
        console.error('Profile auto-create FAILED:', insertErr);
        throw new Error('Profil konnte nicht erstellt werden: ' + insertErr.message);
    }

    console.log('Profile created successfully for:', session.user.id);
}

export async function createInvite() {
    const session = await getSession();
    if (!session) return null;

    // Ensure profile exists before inserting (FK constraint)
    await ensureProfile(session);

    const sb = getSupabase();
    const code = generateCode();
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 Tage

    const { error } = await sb.from('invites').insert({
        code,
        created_by: session.user.id,
        expires_at: expires.toISOString(),
    });

    if (error) {
        console.error('Create invite error:', error);
        throw new Error('Einladung konnte nicht erstellt werden: ' + error.message);
    }

    console.log('Invite created with code:', code);
    return code;
}

export async function acceptInvite(code) {
    const session = await getSession();
    if (!session) return { success: false, error: 'Nicht eingeloggt' };

    const sb = getSupabase();
    const upperCode = code.toUpperCase().trim();
    console.log('Accepting invite with code:', upperCode, 'User:', session.user.id);

    // Call securely defined RPC function to handle mutual follow bypassing RLS
    const { data: inviterId, error } = await sb.rpc('accept_invite', { invite_code: upperCode });

    console.log('RPC result:', { inviterId, error });

    if (error) {
        console.error('Invite RPC error:', error);
        return { success: false, error: error.message || 'Fehler beim Akzeptieren der Einladung' };
    }

    if (!inviterId) {
        return { success: false, error: 'Einladung konnte nicht verarbeitet werden' };
    }

    // Fetch the profile of the new friend
    const inviterProfile = await getProfile(inviterId);

    console.log('Invite accepted successfully (MUTUAL FOLLOW), now friends with:', inviterProfile?.username);
    return { success: true, friend: inviterProfile };
}

// ── Friends & Friend Requests ────────────────────────────

// Check if two users are mutual friends (follows in both directions)
export async function areFriends(userId) {
    const session = await getSession();
    if (!session) return false;
    const sb = getSupabase();
    const myId = session.user.id;

    // Check both directions
    const { data: iFollow } = await sb.from('follows')
        .select('follower_id')
        .eq('follower_id', myId)
        .eq('following_id', userId)
        .maybeSingle();
    if (!iFollow) return false;

    const { data: theyFollow } = await sb.from('follows')
        .select('follower_id')
        .eq('follower_id', userId)
        .eq('following_id', myId)
        .maybeSingle();
    return !!theyFollow;
}

// Get relationship status with a user
export async function getRelationship(userId) {
    const session = await getSession();
    if (!session) return 'none';
    const sb = getSupabase();
    const myId = session.user.id;

    // Check if already friends (mutual follows)
    const friends = await areFriends(userId);
    if (friends) return 'friends';

    // Check for pending friend request I sent
    const { data: sentReq } = await sb.from('friend_requests')
        .select('id')
        .eq('sender_id', myId)
        .eq('receiver_id', userId)
        .eq('status', 'pending')
        .maybeSingle();
    if (sentReq) return 'request_sent';

    // Check for pending friend request I received
    const { data: receivedReq } = await sb.from('friend_requests')
        .select('id')
        .eq('sender_id', userId)
        .eq('receiver_id', myId)
        .eq('status', 'pending')
        .maybeSingle();
    if (receivedReq) return 'request_received';

    return 'none';
}

// Send a friend request via RPC (checks privacy settings server-side)
export async function sendFriendRequest(userId) {
    const sb = getSupabase();
    const { data, error } = await sb.rpc('send_friend_request', { target_user_id: userId });
    if (error) {
        console.error('[Supabase] sendFriendRequest error:', error);
        throw error;
    }
    return data; // returns the request ID (or existing request ID if auto-accepted)
}

// Accept a friend request via RPC (creates mutual follows)
export async function acceptFriendRequest(requestId) {
    const sb = getSupabase();
    const { error } = await sb.rpc('accept_friend_request', { request_id: requestId });
    if (error) {
        console.error('[Supabase] acceptFriendRequest error:', error);
        throw error;
    }
}

// Decline a friend request via RPC
export async function declineFriendRequest(requestId) {
    const sb = getSupabase();
    const { error } = await sb.rpc('decline_friend_request', { request_id: requestId });
    if (error) {
        console.error('[Supabase] declineFriendRequest error:', error);
        throw error;
    }
}

// Unfriend: remove mutual follows + clean up requests via RPC
export async function unfriend(userId) {
    const sb = getSupabase();
    const { error } = await sb.rpc('unfriend', { target_user_id: userId });
    if (error) {
        console.error('[Supabase] unfriend error:', error);
        throw error;
    }
}

// Get all pending friend requests received by current user
export async function getPendingRequestsReceived() {
    const session = await getSession();
    if (!session) return [];
    const sb = getSupabase();
    const { data, error } = await sb.from('friend_requests')
        .select('id, sender_id, created_at, profiles:sender_id(id, username, avatar_initials, avatar_icon, bio)')
        .eq('receiver_id', session.user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
    if (error) {
        console.error('[Supabase] getPendingRequestsReceived error:', error);
        return [];
    }
    return data || [];
}

// Get all pending friend requests sent by current user
export async function getPendingRequestsSent() {
    const session = await getSession();
    if (!session) return [];
    const sb = getSupabase();
    const { data, error } = await sb.from('friend_requests')
        .select('id, receiver_id, created_at, profiles:receiver_id(id, username, avatar_initials, avatar_icon)')
        .eq('sender_id', session.user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
    if (error) {
        console.error('[Supabase] getPendingRequestsSent error:', error);
        return [];
    }
    return data || [];
}

// Get friend request privacy setting for a user
export async function getFriendRequestPrivacy(userId) {
    const sb = getSupabase();
    const { data } = await sb.from('profiles')
        .select('friend_request_privacy')
        .eq('id', userId)
        .single();
    return data?.friend_request_privacy || 'everyone';
}

// Update own friend request privacy setting
export async function updateFriendRequestPrivacy(setting) {
    const session = await getSession();
    if (!session) return;
    const sb = getSupabase();
    await sb.from('profiles').update({ friend_request_privacy: setting }).eq('id', session.user.id);
}

// Get all friends (mutual follows) — replaces old getFollowing()
export async function getFriends() {
    const session = await getSession();
    if (!session) return [];
    const sb = getSupabase();
    const myId = session.user.id;

    // Get people I follow
    const { data: iFollow } = await sb.from('follows')
        .select('following_id')
        .eq('follower_id', myId);
    const followingIds = (iFollow || []).map(f => f.following_id);
    if (followingIds.length === 0) return [];

    // Of those, find who also follows me back (mutual)
    const { data: mutuals } = await sb.from('follows')
        .select('follower_id, profiles:follower_id(id, username, avatar_initials, avatar_icon, bio, created_at)')
        .eq('following_id', myId)
        .in('follower_id', followingIds);

    return (mutuals || []).map(f => f.profiles);
}

// Legacy aliases for backward compatibility with feed loading
export async function getFollowing() {
    return getFriends();
}

export async function isFollowing(userId) {
    return areFriends(userId);
}

// ── Visits (Cloud) ───────────────────────────────────────
export async function addVisitCloud(visit) {
    const session = await getSession();
    if (!session) return null;
    const sb = getSupabase();
    const { data, error } = await sb.from('visits').insert({
        user_id: session.user.id,
        house_id: visit.houseId,
        opera_id: visit.operaId,
        date: visit.date,
        rating: visit.rating,
        review: visit.review || '',
    }).select().single();
    if (error) throw error;
    return data;
}

export async function updateVisitCloud(visitId, updates) {
    const sb = getSupabase();
    const payload = {};
    if (updates.houseId !== undefined) payload.house_id = updates.houseId;
    if (updates.operaId !== undefined) payload.opera_id = updates.operaId;
    if (updates.date !== undefined) payload.date = updates.date;
    if (updates.rating !== undefined) payload.rating = updates.rating;
    if (updates.review !== undefined) payload.review = updates.review;

    const { data, error } = await sb.from('visits').update(payload).eq('id', visitId).select().single();
    if (error) throw error;
    return data;
}

export async function deleteVisitCloud(visitId) {
    const sb = getSupabase();
    await sb.from('visits').delete().eq('id', visitId);
}

async function enrichVisitsWithSocial(visits) {
    if (!visits || visits.length === 0) return [];
    const visitIds = visits.map(v => v.id);
    const likeCounts = await getLikesForItems('visit', visitIds);
    const myLikes = await getMyLikesForItems('visit', visitIds);
    const commentsByVisit = await getCommentsForItems(visitIds);

    return visits.map(v => ({
        ...v,
        likes: likeCounts[v.id] || 0,
        liked_by: myLikes.has(v.id) ? ['user-me'] : [],
        comments: commentsByVisit[v.id] || []
    }));
}

export async function getMyVisitsCloud() {
    const session = await getSession();
    if (!session) return [];
    const sb = getSupabase();
    const { data } = await sb.from('visits')
        .select('*')
        .eq('user_id', session.user.id)
        .order('date', { ascending: false });
    return await enrichVisitsWithSocial(data || []);
}

export async function getUserVisitsCloud(userId) {
    const sb = getSupabase();
    const { data } = await sb.from('visits')
        .select('*, profiles:user_id(id, username, avatar_initials, avatar_icon)')
        .eq('user_id', userId)
        .order('date', { ascending: false });
    return await enrichVisitsWithSocial(data || []);
}

export async function getFeedCloud() {
    const session = await getSession();
    if (!session) return [];
    const sb = getSupabase();

    // Get who I follow
    const { data: follows } = await sb.from('follows')
        .select('following_id')
        .eq('follower_id', session.user.id);

    const followingIds = (follows || []).map(f => f.following_id);
    if (followingIds.length === 0) return [];

    // Get their recent visits
    const { data } = await sb.from('visits')
        .select('*, profiles:user_id(id, username, avatar_initials, avatar_icon)')
        .in('user_id', followingIds)
        .order('created_at', { ascending: false })
        .limit(50);

    return await enrichVisitsWithSocial(data || []);
}

// ── Visits by house/opera (all users) ────────────────────
export async function getVisitByIdCloud(visitId) {
    const sb = getSupabase();
    const { data, error } = await sb.from('visits')
        .select('*, profiles:user_id(id, username, avatar_initials, avatar_icon)')
        .eq('id', visitId)
        .single();
    if (error || !data) return null;
    const enriched = await enrichVisitsWithSocial([data]);
    return enriched[0];
}

export async function getVisitsByHouseCloud(houseId) {
    const sb = getSupabase();
    const { data, error } = await sb.from('visits')
        .select('*, profiles:user_id(id, username, avatar_initials, avatar_icon)')
        .eq('house_id', houseId)
        .order('date', { ascending: false });
    if (error) console.error('[Supabase] getVisitsByHouseCloud error:', error);
    return await enrichVisitsWithSocial(data || []);
}

export async function getVisitsByOperaCloud(operaId) {
    const sb = getSupabase();
    const { data, error } = await sb.from('visits')
        .select('*, profiles:user_id(id, username, avatar_initials, avatar_icon)')
        .eq('opera_id', operaId)
        .order('date', { ascending: false });
    if (error) console.error('[Supabase] getVisitsByOperaCloud error:', error);
    return await enrichVisitsWithSocial(data || []);
}

// ── Community Stats (all users) ─────────────────────────
export async function getAllCommunityStats() {
    const sb = getSupabase();
    const { data, error } = await sb.from('visits')
        .select('opera_id, house_id, rating');
    if (error) {
        console.error('[Supabase] getAllCommunityStats error:', error);
        return { operaStats: {}, houseStats: {} };
    }

    const operaStats = {};
    const houseStats = {};

    (data || []).forEach(v => {
        // Opera stats
        if (v.opera_id) {
            if (!operaStats[v.opera_id]) operaStats[v.opera_id] = { sum: 0, count: 0 };
            operaStats[v.opera_id].sum += v.rating;
            operaStats[v.opera_id].count += 1;
        }
        // House stats
        if (v.house_id) {
            if (!houseStats[v.house_id]) houseStats[v.house_id] = { sum: 0, count: 0 };
            houseStats[v.house_id].sum += v.rating;
            houseStats[v.house_id].count += 1;
        }
    });

    // Compute averages
    for (const id of Object.keys(operaStats)) {
        operaStats[id].avg = operaStats[id].sum / operaStats[id].count;
    }
    for (const id of Object.keys(houseStats)) {
        houseStats[id].avg = houseStats[id].sum / houseStats[id].count;
    }

    return { operaStats, houseStats };
}

// ── Stats ────────────────────────────────────────────────
export async function getUserStatsCloud(userId) {
    const sb = getSupabase();
    const { data: visits } = await sb.from('visits')
        .select('*')
        .eq('user_id', userId);

    const v = visits || [];
    const houses = new Set(v.map(x => x.house_id));
    const operas = new Set(v.map(x => x.opera_id));
    const avgRating = v.length ? (v.reduce((s, x) => s + parseFloat(x.rating), 0) / v.length) : 0;

    return {
        totalVisits: v.length,
        uniqueHouses: houses.size,
        uniqueOperas: operas.size,
        averageRating: avgRating,
    };
}

// ── Lists (Cloud) ────────────────────────────────────────

async function enrichListsWithSocial(lists) {
    if (!lists || lists.length === 0) return [];
    const listIds = lists.map(l => l.id);
    const likeCounts = await getLikesForItems('list', listIds);
    const myLikes = await getMyLikesForItems('list', listIds);
    const commentsByList = await getCommentsForItems(listIds);

    return lists.map(l => ({
        ...l,
        likes: likeCounts[l.id] || 0,
        liked_by: myLikes.has(l.id) ? ['user-me'] : [],
        comments: commentsByList[l.id] || []
    }));
}

export async function addListCloud(list) {
    const session = await getSession();
    if (!session) return null;
    const sb = getSupabase();
    const { data, error } = await sb.from('lists').insert({
        user_id: session.user.id,
        name: list.name,
        description: list.description || '',
        type: list.type,
        items: list.items,
        is_public: true,
    }).select().single();
    if (error) throw error;
    return data;
}

export async function getMyListsCloud() {
    const session = await getSession();
    if (!session) return [];
    const sb = getSupabase();
    const { data } = await sb.from('lists')
        .select('*')
        .eq('user_id', session.user.id);
    return await enrichListsWithSocial(data || []);
}

export async function deleteListCloud(listId) {
    const sb = getSupabase();
    await sb.from('lists').delete().eq('id', listId);
}

export async function updateListCloud(listId, updates) {
    const sb = getSupabase();
    const { error } = await sb.from('lists').update(updates).eq('id', listId);
    if (error) throw error;
}

export async function getUserListsCloud(userId) {
    const sb = getSupabase();
    const { data } = await sb.from('lists')
        .select('*')
        .eq('user_id', userId)
        .eq('is_public', true);
    return await enrichListsWithSocial(data || []);
}

export async function getListByIdCloud(listId) {
    const sb = getSupabase();
    const { data } = await sb.from('lists')
        .select('*')
        .eq('id', listId)
        .single();
    if (!data) return null;
    const enriched = await enrichListsWithSocial([data]);
    return enriched[0];
}

// ── Likes ────────────────────────────────────────────────
export async function toggleLike(targetType, targetId) {
    const session = await getSession();
    if (!session) return null;
    const sb = getSupabase();
    const userId = session.user.id;

    // Check if already liked
    const { data: existing } = await sb.from('likes')
        .select('*')
        .eq('user_id', userId)
        .eq('target_type', targetType)
        .eq('target_id', targetId)
        .maybeSingle();

    if (existing) {
        // Unlike
        await sb.from('likes').delete()
            .eq('id', existing.id);
        return false;
    } else {
        // Like – use upsert to prevent duplicates from double-clicks
        await sb.from('likes').upsert({
            user_id: userId,
            target_type: targetType,
            target_id: targetId,
        }, { onConflict: 'user_id,target_type,target_id', ignoreDuplicates: true });
        return true;
    }
}

export async function getLikeCount(targetType, targetId) {
    const sb = getSupabase();
    const { count } = await sb.from('likes')
        .select('*', { count: 'exact', head: true })
        .eq('target_type', targetType)
        .eq('target_id', targetId);
    return count || 0;
}

export async function hasUserLiked(targetType, targetId) {
    const session = await getSession();
    if (!session) return false;
    const sb = getSupabase();
    const { data } = await sb.from('likes')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('target_type', targetType)
        .eq('target_id', targetId)
        .maybeSingle();
    return !!data;
}

export async function getLikesForItems(targetType, targetIds) {
    if (!targetIds.length) return {};
    const sb = getSupabase();
    const { data } = await sb.from('likes')
        .select('target_id')
        .eq('target_type', targetType)
        .in('target_id', targetIds);
    // Count likes per target_id
    const counts = {};
    (data || []).forEach(l => {
        counts[l.target_id] = (counts[l.target_id] || 0) + 1;
    });
    return counts;
}

export async function getMyLikesForItems(targetType, targetIds) {
    const session = await getSession();
    if (!session || !targetIds.length) return new Set();
    const sb = getSupabase();
    const { data } = await sb.from('likes')
        .select('target_id')
        .eq('user_id', session.user.id)
        .eq('target_type', targetType)
        .in('target_id', targetIds);
    return new Set((data || []).map(l => l.target_id));
}

// ── Comments ─────────────────────────────────────────────
export async function addCommentCloud(targetId, text) {
    const session = await getSession();
    if (!session) return null;
    const sb = getSupabase();
    const { data, error } = await sb.from('comments').insert({
        user_id: session.user.id,
        target_id: targetId,
        text: text,
    }).select().single();
    if (error) throw error;
    return data;
}

export async function deleteCommentCloud(commentId) {
    const sb = getSupabase();
    await sb.from('comments').delete().eq('id', commentId);
}

export async function getCommentsForItems(targetIds) {
    if (!targetIds.length) return {};
    const sb = getSupabase();
    const { data } = await sb.from('comments')
        .select('*, profiles:user_id(id, username, avatar_initials)')
        .in('target_id', targetIds)
        .order('created_at', { ascending: true });

    const commentsByTarget = {};
    (data || []).forEach(c => {
        if (!commentsByTarget[c.target_id]) commentsByTarget[c.target_id] = [];
        commentsByTarget[c.target_id].push({
            id: c.id,
            userId: c.user_id,
            text: c.text,
            date: c.created_at,
            user: c.profiles ? { name: c.profiles.username, avatar: c.profiles.avatar_initials } : null
        });
    });
    return commentsByTarget;
}

// ── Search users ─────────────────────────────────────────
export async function searchUsers(query) {
    const sb = getSupabase();
    // Escape LIKE special characters to prevent pattern injection / user enumeration
    const escaped = query.replace(/%/g, '\\%').replace(/_/g, '\\_');
    const { data } = await sb.from('profiles')
        .select('*')
        .ilike('username', `%${escaped}%`)
        .limit(10);
    return data || [];
}

// ── Suggestions ──────────────────────────────────────────
export async function addSuggestionCloud(suggestion) {
    const session = await getSession();
    if (!session) return null;
    const sb = getSupabase();
    const { data, error } = await sb.from('suggestions').insert({
        user_id: session.user.id,
        type: suggestion.type,
        name: suggestion.name,
        composer: suggestion.composer || null,
        location: suggestion.location || null,
        status: 'pending'
    }).select().single();
    if (error) throw error;
    return data;
}

export async function hasPendingSuggestionCloud(type) {
    const session = await getSession();
    if (!session) return false;
    const sb = getSupabase();
    const { data } = await sb.from('suggestions')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('type', type)
        .eq('status', 'pending');
    return data && data.length > 0;
}
