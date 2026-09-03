// ── Supabase Client & Backend-Funktionen ─────────────────
import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from '../config.js';

let supabaseClient = null;
let _sessionReady = null;

// ── Init ─────────────────────────────────────────────────
export function getSupabase() {
    if (!supabaseClient && isSupabaseConfigured()) {
        // Die Bibliothek liegt unter vendor/ und wird von index.html geladen.
        // Fehlt sie trotzdem, wird hier null zurückgegeben statt geworfen: ein
        // Wurf an dieser Stelle riss früher den ganzen Start mit sich, und
        // nach dem Vorhang blieb ein grauer Bildschirm. Ohne Client läuft die
        // App im lokalen Modus weiter – Katalog und eigene Daten sind da.
        if (!window.supabase?.createClient) {
            console.error('[Supabase] Bibliothek nicht geladen – die App läuft ohne Cloud weiter');
            return null;
        }

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

// ── Fehlerbehandlung ─────────────────────────────────────
//
// Supabase gibt Fehler als Wert zurück, nicht als Exception. Wer nur `data`
// destrukturiert, bekommt bei einem Fehler still `undefined` – die Oberfläche
// zeigt dann "keine Einträge" statt "kaputt", und fehlgeschlagene Schreib-
// vorgänge sehen wie Erfolge aus. Genau daran sind hier schon zweimal
// Änderungen spurlos verschwunden.
//
// Deshalb: jeder Aufruf geht durch unwrap(). Kein `data` ohne geprüften
// `error`.

// Vorübergehende Fehler, die sich von selbst erledigen. Ein erneuter Versuch
// ist sinnvoller, als den Nutzer damit zu behelligen.
//
// PGRST303 "JWT issued at future" ist der prominenteste Fall: Supabases
// Auth-Dienst und der PostgREST-Server haben leicht unterschiedliche Uhren,
// dadurch liegt die Ausstellungszeit des Tokens für die Datenbank in der
// Zukunft und sie weist es ab. Das liegt auf Serverseite, nicht am Gerät des
// Nutzers – und ist nach Sekunden meist vorbei.
function isTransient(cause) {
    const code = cause?.code;
    if (code === 'PGRST303' || code === 'PGRST301') return true;
    return /issued at future|jwt expired|failed to fetch|networkerror|network error|timeout|temporarily unavailable/i
        .test(String(cause?.message || ''));
}

// Verständliche Entsprechung zur technischen Meldung. Die Rohmeldung bleibt in
// message und damit in der Konsole – im Toast hat sie nichts verloren.
function userMessage(cause) {
    const code = cause?.code;
    const msg = String(cause?.message || '');

    if (code === 'PGRST303' || /issued at future/i.test(msg))
        return 'Der Server hat die Anmeldung kurz nicht angenommen. Das behebt sich meist von selbst – versuch es gleich noch einmal.';
    if (code === 'PGRST301' || /jwt expired/i.test(msg))
        return 'Deine Sitzung ist abgelaufen. Bitte melde dich neu an.';
    if (code === '42501' || /row-level security/i.test(msg))
        return 'Dafür fehlt die Berechtigung.';
    if (code === 'NO_ROWS_AFFECTED')
        return 'Der Eintrag wurde nicht gefunden oder darf nicht geändert werden.';
    if (code === '23505' || /duplicate key/i.test(msg))
        return 'Das gibt es bereits.';
    if (/failed to fetch|networkerror|network error/i.test(msg))
        return 'Keine Verbindung zum Server.';
    return null;
}

export class SupabaseError extends Error {
    constructor(operation, cause) {
        // Technische Meldung für Konsole und Protokoll
        super(`${operation}: ${cause?.message || 'Unbekannter Fehler'}`);
        this.name = 'SupabaseError';
        this.operation = operation;
        this.cause = cause;
        this.code = cause?.code;
        this.transient = isTransient(cause);
        // Für die Oberfläche
        this.userMessage = userMessage(cause) || `${operation} fehlgeschlagen.`;
    }
}

/**
 * Führt eine Leseabfrage aus und wiederholt sie bei vorübergehenden Fehlern.
 *
 * Bewusst nur für Lesevorgänge: Ein wiederholter Schreibvorgang könnte doppelte
 * Einträge erzeugen, wenn der erste Versuch die Datenbank doch erreicht hat.
 *
 * @param {() => PromiseLike<{data: any, error: any}>} build  erzeugt die Abfrage neu
 */
async function retryRead(build, operation, { attempts = 3, baseDelay = 400 } = {}) {
    for (let attempt = 0; ; attempt++) {
        const result = await build();
        if (!result.error) return result.data;

        const error = new SupabaseError(operation, result.error);
        if (!error.transient || attempt >= attempts - 1) {
            console.error(`[Supabase] ${operation}`, result.error);
            throw error;
        }
        console.warn(`[Supabase] ${operation}: vorübergehender Fehler, neuer Versuch`, result.error);
        await new Promise(r => setTimeout(r, baseDelay * 2 ** attempt));
    }
}

// Wirft bei Fehler, gibt sonst die Daten zurück.
function unwrap(result, operation) {
    if (result.error) {
        console.error(`[Supabase] ${operation}`, result.error);
        throw new SupabaseError(operation, result.error);
    }
    return result.data;
}

// Wie unwrap, aber für Schreibvorgänge mit .select(): eine leere Antwort ohne
// Fehler heißt, dass RLS die Zeile verworfen hat – dann ist nichts passiert.
function unwrapWritten(result, operation) {
    const data = unwrap(result, operation);
    if (!data || data.length === 0) {
        throw new SupabaseError(operation, {
            message: 'Keine Zeile betroffen – fehlende Berechtigung oder Datensatz nicht gefunden',
            code: 'NO_ROWS_AFFECTED',
        });
    }
    return data[0];
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
            // Einziger Fall, der bewusst still degradiert: ohne lesbare Sitzung
            // ist "nicht eingeloggt" die richtige Annahme, und die App zeigt
            // dann den Anmeldebildschirm – das ist Rückmeldung genug.
            console.error('[Auth] Sitzung lesen fehlgeschlagen', e);
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
        // Ohne Profil ist das Konto unbrauchbar – das darf nicht durchrutschen.
        if (profileError) throw new SupabaseError('Profil zum Konto anlegen', profileError);
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
    const { data, error } = await sb.auth.getSession();
    // Auth wird bewusst nicht geworfen: "keine Sitzung" ist ein normaler
    // Zustand. Ein echter Fehler soll aber sichtbar sein und nicht als
    // stiller Logout durchgehen.
    if (error) console.error('[Supabase] Sitzung lesen', error);
    return data?.session || null;
}

export async function getProfile(userId) {
    const sb = getSupabase();
    // maybeSingle: "kein Profil" ist ein gültiges Ergebnis (null), alles andere
    // ist ein echter Fehler und darf nicht als "kein Profil" durchgehen.
    return retryRead(
        () => sb.from('profiles').select('*').eq('id', userId).maybeSingle(),
        `Profil ${userId} laden`
    );
}

export async function getMyProfile() {
    const session = await getSession();
    if (!session) return null;
    return getProfile(session.user.id);
}

export async function updateProfile(updates) {
    const session = await getSession();
    if (!session) throw new SupabaseError('Profil speichern', { message: 'Nicht eingeloggt' });
    const sb = getSupabase();
    const result = await sb.from('profiles').update(updates).eq('id', session.user.id).select();
    return unwrapWritten(result, 'Profil speichern');
}

export async function isProfileComplete(userId) {
    const sb = getSupabase();
    const data = await retryRead(
        () => sb.from('profiles').select('profile_complete').eq('id', userId).maybeSingle(),
        'Profilstatus prüfen'
    );
    return data?.profile_complete === true;
}

export async function markProfileComplete(userId) {
    const sb = getSupabase();
    const result = await sb.from('profiles').update({ profile_complete: true }).eq('id', userId).select();
    return unwrapWritten(result, 'Profil als vollständig markieren');
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

    // Check if profile already exists. A failed check must not be mistaken for
    // "no profile" – that would send us into creating a duplicate.
    const existing = unwrap(
        await sb.from('profiles').select('id').eq('id', session.user.id).maybeSingle(),
        'Profil prüfen'
    );

    if (existing) return;

    // Profile missing – create it
    const meta = session.user?.user_metadata;
    let username = meta?.username || session.user?.email?.split('@')[0] || 'Opernfan';
    const initials = username.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

    // Try creating profile (might fail due to username UNIQUE constraint)
    let { error: insertErr } = await sb.from('profiles').upsert({
        id: session.user.id,
        username,
        avatar_initials: initials,
    }, { onConflict: 'id' });

    // If username taken, retry with unique suffix
    if (insertErr && insertErr.message?.includes('unique')) {
        const uniqueUsername = username + '_' + Math.random().toString(36).slice(2, 6);
        insertErr = (await sb.from('profiles').upsert({
            id: session.user.id,
            username: uniqueUsername,
            avatar_initials: initials,
        }, { onConflict: 'id' })).error;
    }

    if (insertErr) throw new SupabaseError('Profil anlegen', insertErr);
}

export async function createInvite() {
    const session = await getSession();
    if (!session) throw new SupabaseError('Einladung erstellen', { message: 'Nicht eingeloggt' });

    // Ensure profile exists before inserting (FK constraint)
    await ensureProfile(session);

    const sb = getSupabase();
    const code = generateCode();
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 Tage

    unwrapWritten(
        await sb.from('invites').insert({
            code,
            created_by: session.user.id,
            expires_at: expires.toISOString(),
        }).select(),
        'Einladung erstellen'
    );

    return code;
}

export async function acceptInvite(code) {
    const session = await getSession();
    if (!session) return { success: false, error: 'Nicht eingeloggt' };

    const sb = getSupabase();
    const upperCode = code.toUpperCase().trim();

    // Call securely defined RPC function to handle mutual follow bypassing RLS
    const { data: inviterId, error } = await sb.rpc('accept_invite', { invite_code: upperCode });

    // The RPC raises readable exceptions ("Ungültiger oder abgelaufener
    // Einladungslink"), so its message is shown to the user as-is.
    if (error) {
        console.error('[Supabase] Einladung annehmen', error);
        return { success: false, error: error.message || 'Fehler beim Akzeptieren der Einladung' };
    }

    if (!inviterId) {
        return { success: false, error: 'Einladung konnte nicht verarbeitet werden' };
    }

    try {
        return { success: true, friend: await getProfile(inviterId) };
    } catch (e) {
        // The friendship was created; only the profile lookup failed.
        console.error('[Supabase] Profil des Einladenden laden', e);
        return { success: true, friend: null };
    }
}

// ── Friends & Friend Requests ────────────────────────────

// Check if two users are mutual friends (follows in both directions)
export async function areFriends(userId) {
    const session = await getSession();
    if (!session) return false;
    const sb = getSupabase();
    const myId = session.user.id;

    // Check both directions
    const iFollow = unwrap(await sb.from('follows')
        .select('follower_id')
        .eq('follower_id', myId)
        .eq('following_id', userId)
        .maybeSingle(), 'Freundschaft prüfen');
    if (!iFollow) return false;

    const theyFollow = unwrap(await sb.from('follows')
        .select('follower_id')
        .eq('follower_id', userId)
        .eq('following_id', myId)
        .maybeSingle(), 'Freundschaft prüfen');
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
    const sentReq = unwrap(await sb.from('friend_requests')
        .select('id')
        .eq('sender_id', myId)
        .eq('receiver_id', userId)
        .eq('status', 'pending')
        .maybeSingle(), 'Gesendete Anfrage prüfen');
    if (sentReq) return 'request_sent';

    // Check for pending friend request I received
    const receivedReq = unwrap(await sb.from('friend_requests')
        .select('id')
        .eq('sender_id', userId)
        .eq('receiver_id', myId)
        .eq('status', 'pending')
        .maybeSingle(), 'Erhaltene Anfrage prüfen');
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
    const data = unwrap(await sb.from('friend_requests')
        .select('id, sender_id, created_at, profiles:sender_id(id, username, avatar_initials, avatar_icon, bio)')
        .eq('receiver_id', session.user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }), 'Erhaltene Freundschaftsanfragen laden');
    return data || [];
}

// Get all pending friend requests sent by current user
export async function getPendingRequestsSent() {
    const session = await getSession();
    if (!session) return [];
    const sb = getSupabase();
    const data = unwrap(await sb.from('friend_requests')
        .select('id, receiver_id, created_at, profiles:receiver_id(id, username, avatar_initials, avatar_icon)')
        .eq('sender_id', session.user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false }), 'Gesendete Freundschaftsanfragen laden');
    return data || [];
}

// Get friend request privacy setting for a user
export async function getFriendRequestPrivacy(userId) {
    const sb = getSupabase();
    const data = unwrap(await sb.from('profiles')
        .select('friend_request_privacy')
        .eq('id', userId)
        .maybeSingle(), 'Privatsphäre-Einstellung laden');
    return data?.friend_request_privacy || 'everyone';
}

// Update own friend request privacy setting
export async function updateFriendRequestPrivacy(setting) {
    const session = await getSession();
    if (!session) throw new SupabaseError('Privatsphäre speichern', { message: 'Nicht eingeloggt' });
    const sb = getSupabase();
    return unwrapWritten(
        await sb.from('profiles').update({ friend_request_privacy: setting }).eq('id', session.user.id).select(),
        'Privatsphäre speichern'
    );
}

// Get all friends (mutual follows) — replaces old getFollowing()
export async function getFriends() {
    const session = await getSession();
    if (!session) return [];
    const sb = getSupabase();
    const myId = session.user.id;

    // Get people I follow
    const iFollow = unwrap(await sb.from('follows')
        .select('following_id')
        .eq('follower_id', myId), 'Gefolgte laden');
    const followingIds = (iFollow || []).map(f => f.following_id);
    if (followingIds.length === 0) return [];

    // Of those, find who also follows me back (mutual)
    const mutuals = unwrap(await sb.from('follows')
        .select('follower_id, profiles:follower_id(id, username, avatar_initials, avatar_icon, bio, created_at)')
        .eq('following_id', myId)
        .in('follower_id', followingIds), 'Freunde laden');

    return (mutuals || []).map(f => f.profiles).filter(Boolean);
}

// Legacy aliases for backward compatibility with feed loading
export async function getFollowing() {
    return getFriends();
}

export async function isFollowing(userId) {
    return areFriends(userId);
}

// ── Visits (Cloud) ───────────────────────────────────────

/**
 * Eine Besuchszeile aus der Cloud in die Schreibweise der Oberfläche.
 *
 * Diese Abbildung stand wortgleich an vier Stellen – im Store, im Feed, auf
 * der Opern- und auf der Hausseite. Als die Mitwirkenden dazukamen, haben drei
 * davon sie prompt nicht mitbekommen und ließen Dirigent, Regie und Besetzung
 * stillschweigend fallen: in der Datenbank standen sie, angezeigt wurden sie
 * nur im Tagebuch. Deshalb jetzt an einer Stelle.
 */
export function mapCloudVisit(v) {
    return {
        id: v.id,
        userId: v.user_id,
        houseId: v.house_id,
        operaId: v.opera_id,
        date: v.date,
        rating: v.rating,
        review: v.review || '',
        conductor: v.conductor || '',
        director: v.director || '',
        castList: v.cast_list || '',
        likes: v.likes || 0,
        comments: v.comments || [],
        likedBy: v.liked_by || [],
        user: v.profiles ? {
            id: v.profiles.id,
            name: v.profiles.username,
            avatar: v.profiles.avatar_initials,
            avatarIcon: v.profiles.avatar_icon,
        } : null,
    };
}

export async function addVisitCloud(visit) {
    const session = await getSession();
    if (!session) return null;
    const sb = getSupabase();
    return unwrapWritten(await sb.from('visits').insert({
        user_id: session.user.id,
        house_id: visit.houseId,
        opera_id: visit.operaId,
        date: visit.date,
        rating: visit.rating,
        review: visit.review || '',
        conductor: visit.conductor || '',
        director: visit.director || '',
        cast_list: visit.castList || '',
    }).select(), 'Besuch speichern');
}

export async function updateVisitCloud(visitId, updates) {
    const sb = getSupabase();
    const payload = {};
    if (updates.houseId !== undefined) payload.house_id = updates.houseId;
    if (updates.operaId !== undefined) payload.opera_id = updates.operaId;
    if (updates.date !== undefined) payload.date = updates.date;
    if (updates.rating !== undefined) payload.rating = updates.rating;
    if (updates.review !== undefined) payload.review = updates.review;
    if (updates.conductor !== undefined) payload.conductor = updates.conductor;
    if (updates.director !== undefined) payload.director = updates.director;
    if (updates.castList !== undefined) payload.cast_list = updates.castList;

    return unwrapWritten(
        await sb.from('visits').update(payload).eq('id', visitId).select(),
        'Besuch aktualisieren'
    );
}

/**
 * Wie viele Besuche jeder Nutzer in einem Zeitraum geloggt hat.
 *
 * Gezählt wird im Browser: PostgREST kann ohne eigene Datenbankfunktion nicht
 * gruppieren. Geladen wird deshalb nur die Nutzerkennung je Besuch und nur für
 * den angefragten Zeitraum – nicht die ganze Tabelle. Sollte die App einmal
 * deutlich größer werden, gehört das in eine Funktion mit GROUP BY.
 *
 * @returns {Promise<Map<string, number>>}
 */
export async function getSeasonVisitCounts(vonISO, bisISO) {
    const sb = getSupabase();
    const data = unwrap(await sb.from('visits')
        .select('user_id')
        .gte('date', vonISO)
        .lte('date', bisISO), 'Saisonvergleich laden');

    const zaehler = new Map();
    (data || []).forEach(v => {
        if (!v.user_id) return;
        zaehler.set(v.user_id, (zaehler.get(v.user_id) || 0) + 1);
    });
    return zaehler;
}

export async function deleteVisitCloud(visitId) {
    const sb = getSupabase();
    return unwrapWritten(
        await sb.from('visits').delete().eq('id', visitId).select(),
        'Besuch löschen'
    );
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
    const data = await retryRead(
        () => sb.from('visits')
            .select('*')
            .eq('user_id', session.user.id)
            .order('date', { ascending: false }),
        'Eigene Besuche laden'
    );
    return await enrichVisitsWithSocial(data || []);
}

export async function getUserVisitsCloud(userId) {
    const sb = getSupabase();
    const data = unwrap(await sb.from('visits')
        .select('*, profiles:user_id(id, username, avatar_initials, avatar_icon)')
        .eq('user_id', userId)
        .order('date', { ascending: false }), 'Besuche des Nutzers laden');
    return await enrichVisitsWithSocial(data || []);
}

export async function getFeedCloud() {
    const session = await getSession();
    if (!session) return [];
    const sb = getSupabase();

    // Get who I follow
    const follows = unwrap(await sb.from('follows')
        .select('following_id')
        .eq('follower_id', session.user.id), 'Feed: Gefolgte laden');

    const followingIds = (follows || []).map(f => f.following_id);
    if (followingIds.length === 0) return [];

    // Get their recent visits
    const data = unwrap(await sb.from('visits')
        .select('*, profiles:user_id(id, username, avatar_initials, avatar_icon)')
        .in('user_id', followingIds)
        .order('created_at', { ascending: false })
        .limit(50), 'Feed laden');

    return await enrichVisitsWithSocial(data || []);
}

// ── Visits by house/opera (all users) ────────────────────
export async function getVisitByIdCloud(visitId) {
    const sb = getSupabase();
    const data = unwrap(await sb.from('visits')
        .select('*, profiles:user_id(id, username, avatar_initials, avatar_icon)')
        .eq('id', visitId)
        .maybeSingle(), 'Besuch laden');
    if (!data) return null;
    const enriched = await enrichVisitsWithSocial([data]);
    return enriched[0];
}

export async function getVisitsByHouseCloud(houseId) {
    const sb = getSupabase();
    const data = unwrap(await sb.from('visits')
        .select('*, profiles:user_id(id, username, avatar_initials, avatar_icon)')
        .eq('house_id', houseId)
        .order('date', { ascending: false }), 'Besuche des Hauses laden');
    return await enrichVisitsWithSocial(data || []);
}

export async function getVisitsByOperaCloud(operaId) {
    const sb = getSupabase();
    const data = unwrap(await sb.from('visits')
        .select('*, profiles:user_id(id, username, avatar_initials, avatar_icon)')
        .eq('opera_id', operaId)
        .order('date', { ascending: false }), 'Besuche der Oper laden');
    return await enrichVisitsWithSocial(data || []);
}

// ── Community Stats (all users) ─────────────────────────
export async function getAllCommunityStats() {
    const sb = getSupabase();
    const data = unwrap(await sb.from('visits').select('opera_id, house_id, rating'),
        'Community-Statistiken laden');

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
    const visits = unwrap(await sb.from('visits')
        .select('*')
        .eq('user_id', userId), 'Statistiken des Nutzers laden');

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
    return unwrapWritten(await sb.from('lists').insert({
        user_id: session.user.id,
        name: list.name,
        description: list.description || '',
        type: list.type,
        items: list.items,
        is_public: true,
    }).select(), 'Liste anlegen');
}

export async function getMyListsCloud() {
    const session = await getSession();
    if (!session) return [];
    const sb = getSupabase();
    const data = await retryRead(
        () => sb.from('lists').select('*').eq('user_id', session.user.id),
        'Eigene Listen laden'
    );
    return await enrichListsWithSocial(data || []);
}

export async function deleteListCloud(listId) {
    const sb = getSupabase();
    return unwrapWritten(
        await sb.from('lists').delete().eq('id', listId).select(),
        'Liste löschen'
    );
}

export async function updateListCloud(listId, updates) {
    const sb = getSupabase();
    return unwrapWritten(
        await sb.from('lists').update(updates).eq('id', listId).select(),
        'Liste aktualisieren'
    );
}

export async function getUserListsCloud(userId) {
    const sb = getSupabase();
    const data = unwrap(await sb.from('lists')
        .select('*')
        .eq('user_id', userId)
        .eq('is_public', true), 'Listen des Nutzers laden');
    return await enrichListsWithSocial(data || []);
}

export async function getListByIdCloud(listId) {
    const sb = getSupabase();
    const data = unwrap(await sb.from('lists')
        .select('*')
        .eq('id', listId)
        .maybeSingle(), 'Liste laden');
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
    const existing = unwrap(await sb.from('likes')
        .select('user_id')
        .eq('user_id', userId)
        .eq('target_type', targetType)
        .eq('target_id', targetId)
        .maybeSingle(), 'Like prüfen');

    if (existing) {
        // Unlike – the likes table has no "id" column, its primary key is
        // (user_id, target_type, target_id), so delete by that composite key.
        unwrap(await sb.from('likes').delete()
            .eq('user_id', userId)
            .eq('target_type', targetType)
            .eq('target_id', targetId), 'Like entfernen');
        return false;
    } else {
        // Like – use upsert to prevent duplicates from double-clicks
        unwrap(await sb.from('likes').upsert({
            user_id: userId,
            target_type: targetType,
            target_id: targetId,
        }, { onConflict: 'user_id,target_type,target_id', ignoreDuplicates: true }), 'Like setzen');
        return true;
    }
}

export async function getLikeCount(targetType, targetId) {
    const sb = getSupabase();
    const result = await sb.from('likes')
        .select('*', { count: 'exact', head: true })
        .eq('target_type', targetType)
        .eq('target_id', targetId);
    unwrap(result, 'Like-Anzahl laden');
    return result.count || 0;
}

export async function hasUserLiked(targetType, targetId) {
    const session = await getSession();
    if (!session) return false;
    const sb = getSupabase();
    const data = unwrap(await sb.from('likes')
        .select('user_id')
        .eq('user_id', session.user.id)
        .eq('target_type', targetType)
        .eq('target_id', targetId)
        .maybeSingle(), 'Like-Status laden');
    return !!data;
}

export async function getLikesForItems(targetType, targetIds) {
    if (!targetIds.length) return {};
    const sb = getSupabase();
    const data = unwrap(await sb.from('likes')
        .select('target_id')
        .eq('target_type', targetType)
        .in('target_id', targetIds), 'Likes laden');
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
    const data = unwrap(await sb.from('likes')
        .select('target_id')
        .eq('user_id', session.user.id)
        .eq('target_type', targetType)
        .in('target_id', targetIds), 'Eigene Likes laden');
    return new Set((data || []).map(l => l.target_id));
}

// ── Comments ─────────────────────────────────────────────
export async function addCommentCloud(targetId, text) {
    const session = await getSession();
    if (!session) return null;
    const sb = getSupabase();
    return unwrapWritten(await sb.from('comments').insert({
        user_id: session.user.id,
        target_id: targetId,
        text: text,
    }).select(), 'Kommentar speichern');
}

export async function deleteCommentCloud(commentId) {
    const sb = getSupabase();
    return unwrapWritten(
        await sb.from('comments').delete().eq('id', commentId).select(),
        'Kommentar löschen'
    );
}

export async function getCommentsForItems(targetIds) {
    if (!targetIds.length) return {};
    const sb = getSupabase();
    const data = unwrap(await sb.from('comments')
        .select('*, profiles:user_id(id, username, avatar_initials)')
        .in('target_id', targetIds)
        .order('created_at', { ascending: true }), 'Kommentare laden');

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
    const data = unwrap(await sb.from('profiles')
        .select('*')
        .ilike('username', `%${escaped}%`)
        .limit(10), 'Nutzersuche');
    return data || [];
}

// ── Bereits gesehen (ohne Besuchseintrag) ────────────────
export async function getSeenOperasCloud() {
    const session = await getSession();
    if (!session) return [];
    const sb = getSupabase();
    const data = await retryRead(
        () => sb.from('seen_operas').select('opera_id').eq('user_id', session.user.id),
        'Gesehene Werke laden'
    );
    return (data || []).map(r => r.opera_id);
}

export async function addSeenOperaCloud(operaId) {
    const session = await getSession();
    if (!session) return null;
    const sb = getSupabase();
    // upsert statt insert: zweimal markieren soll nicht am Primärschlüssel
    // scheitern, sondern schlicht nichts ändern.
    return unwrapWritten(await sb.from('seen_operas')
        .upsert({ user_id: session.user.id, opera_id: operaId })
        .select(), 'Als gesehen markieren');
}

export async function removeSeenOperaCloud(operaId) {
    const session = await getSession();
    if (!session) return null;
    const sb = getSupabase();
    // Der Schlüssel ist zusammengesetzt, es gibt keine id-Spalte. Genau daran
    // ist in diesem Projekt schon einmal das Zurücknehmen von Likes
    // gescheitert – deshalb hier beide Spalten.
    const { error } = await sb.from('seen_operas').delete()
        .eq('user_id', session.user.id)
        .eq('opera_id', operaId);
    if (error) {
        console.error('[Supabase] Markierung entfernen', error);
        throw new SupabaseError('Markierung entfernen', error);
    }
    return true;
}

// ── Suggestions ──────────────────────────────────────────
export async function addSuggestionCloud(suggestion) {
    const session = await getSession();
    if (!session) return null;
    const sb = getSupabase();
    return unwrapWritten(await sb.from('suggestions').insert({
        user_id: session.user.id,
        type: suggestion.type,
        name: suggestion.name,
        composer: suggestion.composer || null,
        location: suggestion.location || null,
        status: 'pending'
    }).select(), 'Vorschlag einreichen');
}

export async function hasPendingSuggestionCloud(type) {
    const session = await getSession();
    if (!session) return false;
    const sb = getSupabase();
    const data = unwrap(await sb.from('suggestions')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('type', type)
        .eq('status', 'pending'), 'Offene Vorschläge prüfen');
    return !!data && data.length > 0;
}
