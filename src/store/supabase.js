// ── Supabase Client & Backend-Funktionen ─────────────────
import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from '../config.js';

let supabaseClient = null;

// ── Init ─────────────────────────────────────────────────
export function getSupabase() {
    if (!supabaseClient && isSupabaseConfigured()) {
        // supabase is imported via CDN in index.html
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    return supabaseClient;
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
    if (data.user) {
        const initials = username.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        const profileData = {
            id: data.user.id,
            username,
            avatar_initials: initials,
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

export async function signOut() {
    const sb = getSupabase();
    const { error } = await sb.auth.signOut();
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
    if (error) return null;
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

// ── Invite Links ─────────────────────────────────────────
function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
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

// ── Follows ──────────────────────────────────────────────
export async function follow(userId) {
    const session = await getSession();
    if (!session) return;
    const sb = getSupabase();
    await sb.from('follows').upsert({
        follower_id: session.user.id,
        following_id: userId,
    });
}

export async function unfollow(userId) {
    const session = await getSession();
    if (!session) return;
    const sb = getSupabase();
    await sb.from('follows').delete()
        .eq('follower_id', session.user.id)
        .eq('following_id', userId);
}

export async function isFollowing(userId) {
    const session = await getSession();
    if (!session) return false;
    const sb = getSupabase();
    const { data } = await sb.from('follows')
        .select('follower_id')
        .eq('follower_id', session.user.id)
        .eq('following_id', userId)
        .single();
    return !!data;
}

export async function getFollowing() {
    const session = await getSession();
    if (!session) return [];
    const sb = getSupabase();
    const { data } = await sb.from('follows')
        .select('following_id, profiles:following_id(id, username, avatar_initials, avatar_icon, bio, created_at)')
        .eq('follower_id', session.user.id);
    return (data || []).map(f => f.profiles);
}

export async function getFollowers() {
    const session = await getSession();
    if (!session) return [];
    const sb = getSupabase();
    const { data } = await sb.from('follows')
        .select('follower_id, profiles:follower_id(id, username, avatar_initials, avatar_icon, bio, created_at)')
        .eq('following_id', session.user.id);
    return (data || []).map(f => f.profiles);
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

export async function getMyVisitsCloud() {
    const session = await getSession();
    if (!session) return [];
    const sb = getSupabase();
    const { data } = await sb.from('visits')
        .select('*')
        .eq('user_id', session.user.id)
        .order('date', { ascending: false });
    return data || [];
}

export async function getUserVisitsCloud(userId) {
    const sb = getSupabase();
    const { data } = await sb.from('visits')
        .select('*, profiles:user_id(id, username, avatar_initials, avatar_icon)')
        .eq('user_id', userId)
        .order('date', { ascending: false });
    return data || [];
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

    return data || [];
}

// ── Visits by house/opera (all users) ────────────────────
export async function getVisitsByHouseCloud(houseId) {
    const sb = getSupabase();
    const { data } = await sb.from('visits')
        .select('*, profiles:user_id(id, username, avatar_initials, avatar_icon)')
        .eq('house_id', houseId)
        .order('date', { ascending: false });
    return data || [];
}

export async function getVisitsByOperaCloud(operaId) {
    const sb = getSupabase();
    const { data } = await sb.from('visits')
        .select('*, profiles:user_id(id, username, avatar_initials, avatar_icon)')
        .eq('opera_id', operaId)
        .order('date', { ascending: false });
    return data || [];
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
    return data || [];
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
    return data || [];
}

export async function getListByIdCloud(listId) {
    const sb = getSupabase();
    const { data } = await sb.from('lists')
        .select('*')
        .eq('id', listId)
        .single();
    return data;
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
            .eq('user_id', userId)
            .eq('target_type', targetType)
            .eq('target_id', targetId);
        return false;
    } else {
        // Like
        await sb.from('likes').insert({
            user_id: userId,
            target_type: targetType,
            target_id: targetId,
        });
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

// ── Search users ─────────────────────────────────────────
export async function searchUsers(query) {
    const sb = getSupabase();
    const { data } = await sb.from('profiles')
        .select('*')
        .ilike('username', `%${query}%`)
        .limit(10);
    return data || [];
}
