// ── Supabase Client & Backend-Funktionen ─────────────────
import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from '../config.js';
import { passkeyVermerken } from '../passkey.js';

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
                // Passkeys gelten bei Supabase als experimentell und müssen
                // ausdrücklich eingeschaltet werden. Die Bibliothek liegt in
                // vendor/ in fester Version, eine Änderung der Schnittstelle
                // kommt also nicht unbemerkt über Nacht.
                experimental: { passkey: true },
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
            // Name und Bild gehören in die Metadaten, nicht in ein eigenes
            // Schreiben danach: verlangt das Projekt eine E-Mail-Bestätigung,
            // gibt signUp() keine Sitzung zurück. Ein upsert liefe dann als
            // anon und scheiterte an der Regel "auth.uid() = id" – genau das
            // war der Fehler "new row violates row-level security policy".
            //
            // Der Trigger handle_new_user() liest sie von hier und legt das
            // Profil an. Er läuft als SECURITY DEFINER und braucht keine
            // Sitzung.
            data: { username, avatar_icon: avatarIcon || '' },
            // Ohne diese Zeile nimmt der Bestätigungslink die Site URL aus den
            // Projekteinstellungen – eine zweite Stelle, an der die Adresse
            // stimmen muss, und die einzige, die niemand sieht. Anmeldung über
            // Google und das Zurücksetzen des Passworts geben ihr Ziel längst
            // ausdrücklich mit; die Registrierung war die Ausnahme.
            emailRedirectTo: window.location.origin,
        }
    });
    if (error) throw error;

    // Das Profil hat der Trigger schon angelegt. Hier wird nur noch
    // nachgezogen – und ausschließlich dann, wenn es wirklich eine Sitzung
    // gibt. Ohne sie würde der Aufruf an der Regel scheitern und eine
    // gelungene Registrierung als Fehler erscheinen lassen.
    //
    // Wann es eine Sitzung gibt: wenn die E-Mail-Bestätigung im Projekt
    // abgeschaltet ist. Dann ist man sofort angemeldet.
    if (data.session && data.user) {
        const initials = username.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
        const profileData = {
            id: data.user.id,
            username,
            avatar_initials: initials,
            profile_complete: true,
        };
        if (avatarIcon) profileData.avatar_icon = avatarIcon;
        const { error: profileError } = await sb.from('profiles').upsert(profileData, { onConflict: 'id' });
        // Kein Wurf mehr: das Profil steht bereits, dies ist die Kür. Ein
        // Fehler hier soll keine gelungene Registrierung zunichtemachen.
        if (profileError) console.error('[Supabase] Profil nachziehen', profileError);
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

// ── Passkeys ─────────────────────────────────────────────
//
// Anmelden mit Face ID, Fingerabdruck oder Gerätesperre. Ein Passkey ersetzt
// kein Konto: anlegen kann ihn nur, wer schon angemeldet und bestätigt ist.
//
// Die Passkeys sind an die Domain opernlog.vercel.app gebunden (Relying Party
// ID im Supabase-Dashboard). Zieht die App auf eine andere Domain, taugt keiner
// mehr – dann muss jeder einen neuen anlegen.

export async function signInWithPasskey() {
    const sb = getSupabase();
    const { data, error } = await sb.auth.signInWithPasskey();
    if (error) throw error;
    return data;
}

export async function registerPasskey() {
    const sb = getSupabase();
    const { data, error } = await sb.auth.registerPasskey();
    if (error) throw error;
    return data;
}

export async function listPasskeys() {
    const sb = getSupabase();
    const { data, error } = await sb.auth.passkey.list();
    if (error) throw error;
    return data || [];
}

export async function deletePasskey(passkeyId) {
    const sb = getSupabase();
    const { error } = await sb.auth.passkey.delete({ passkeyId });
    if (error) throw error;
}

// ── Push-Mitteilungen ────────────────────────────────────
//
// Versand und Auslöser liegen auf dem Server (supabase/migrations/
// push_migration.sql, supabase/functions/push-senden). Hier nur, was die App
// selbst braucht: den öffentlichen Schlüssel zum Abonnieren und das Ablegen
// oder Entfernen des Abos für dieses Gerät.

export async function pushSchluessel() {
    const sb = getSupabase();
    const { data, error } = await sb.functions.invoke('push-senden', { method: 'GET' });
    if (error) throw error;
    if (!data?.schluessel) throw new Error('Kein Schlüssel für Mitteilungen');
    return data.schluessel;
}

export async function pushAboSpeichern({ endpoint, p256dh, auth }) {
    const sb = getSupabase();
    const { error } = await sb.rpc('push_abo_speichern', { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth });
    if (error) throw new SupabaseError('Mitteilungen einschalten', error);
}

export async function pushAboLoeschen(endpoint) {
    const sb = getSupabase();
    const { error } = await sb.rpc('push_abo_loeschen', { p_endpoint: endpoint });
    if (error) throw new SupabaseError('Mitteilungen ausschalten', error);
}

/** Schickt eine Probemitteilung an die eigenen Geräte. false: gerade erst eine geschickt. */
export async function pushTest() {
    const sb = getSupabase();
    const { data, error } = await sb.rpc('push_test');
    if (error) throw new SupabaseError('Probemitteilung', error);
    return data === true;
}

export async function signOut() {
    const sb = getSupabase();
    // Nur dieses Gerät. Ohne Angabe meldet Supabase überall ab: wer sich am
    // Mac abmeldete, flog auch auf dem iPhone raus und merkte es erst, als
    // die Sitzung dort nicht mehr verlängert werden konnte ("Refresh Token
    // Not Found").
    const { error } = await sb.auth.signOut({ scope: 'local' });
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
        // Die Kennung vergibt der Browser (store.addVisit), damit ein
        // wiederholter Versuch nicht doppelt anlegt.
        ...(visit.id ? { id: visit.id } : {}),
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
    // Erst die Fotos des Abends: ihre Zeilen gehen mit dem Abend, die Dateien
    // nicht. Scheitert das, bleibt der Abend stehen und man kann es erneut
    // versuchen.
    await andenkenDateienLoeschen({ visitId });
    const sb = getSupabase();
    return unwrapWritten(
        await sb.from('visits').delete().eq('id', visitId).select(),
        'Besuch löschen'
    );
}

async function enrichVisitsWithSocial(visits) {
    if (!visits || visits.length === 0) return [];
    const visitIds = visits.map(v => v.id);
    // Gleichzeitig: die drei Abfragen hängen nicht voneinander ab.
    const [likeCounts, myLikes, commentsByVisit] = await Promise.all([
        getLikesForItems('visit', visitIds),
        getMyLikesForItems('visit', visitIds),
        getCommentsForItems(visitIds),
    ]);

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

/**
 * Wie vielen Leuten der angemeldete Nutzer folgt.
 *
 * getFeedCloud() gibt in zwei ganz verschiedenen Fällen eine leere Liste
 * zurück: wenn man niemandem folgt, und wenn die Gefolgten noch nichts
 * geloggt haben. Der Feed konnte das nicht auseinanderhalten und schrieb auch
 * dem, der längst jemandem folgt, "Du folgst noch niemandem" hin.
 *
 * Eine eigene kleine Abfrage statt eines anderen Rückgabewerts von
 * getFeedCloud(): die Funktion hat drei Aufrufer, und diese hier läuft nur,
 * wenn der Feed ohnehin leer ist.
 */
export async function getFollowingCount() {
    const session = await getSession();
    if (!session) return 0;
    const sb = getSupabase();
    const data = unwrap(await sb.from('follows')
        .select('following_id')
        .eq('follower_id', session.user.id), 'Gefolgte zählen');
    return (data || []).length;
}

/**
 * Die letzten Abende aller – die Rückfallebene des Feeds.
 *
 * Der Feed lebt von den Freunden; wer noch niemandem folgt, bekam bisher eine
 * leere Kiste mit dem Rat, doch Opernfreunde zu suchen. Statt dessen zeigt der
 * Feed dann, was sonst geloggt wurde. Die Besuche sind dafür freigegeben –
 * "Visits sind öffentlich lesbar" steht so in supabase/schema.sql, und die
 * Haus- und Werkseiten zeigen sie längst.
 *
 * Ohne die eigenen: die stehen im Tagebuch, und im Feed wäre der eigene Abend
 * zwischen fremden nur Verwirrung.
 *
 * @param {number} [limit]
 */
export async function getRecentCommunityVisits(limit = 20) {
    const sb = getSupabase();
    const session = await getSession();

    let abfrage = sb.from('visits')
        .select('*, profiles:user_id(id, username, avatar_initials, avatar_icon)')
        .order('created_at', { ascending: false })
        .limit(limit);
    if (session) abfrage = abfrage.neq('user_id', session.user.id);

    const data = unwrap(await abfrage, 'Letzte Abende der Community laden');
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
    // Die Markierungen "schon gesehen" sind öffentlich (seit 30.9.2026) und
    // zählen wie im eigenen Profil bei "Werke gesehen" mit – und bei den
    // Sammlungen, dafür kommen sie als gesehen zurück.
    const [visits, markiert] = await Promise.all([
        sb.from('visits').select('*').eq('user_id', userId),
        sb.from('seen_operas').select('opera_id').eq('user_id', userId),
    ]);
    const v = unwrap(visits, 'Statistiken des Nutzers laden') || [];
    const gesehen = (unwrap(markiert, 'Gesehene Werke des Nutzers laden') || []).map(r => r.opera_id);
    const houses = new Set(v.map(x => x.house_id));
    const operas = new Set([...v.map(x => x.opera_id), ...gesehen]);
    const avgRating = v.length ? (v.reduce((s, x) => s + parseFloat(x.rating), 0) / v.length) : 0;

    return {
        totalVisits: v.length,
        uniqueHouses: houses.size,
        uniqueOperas: operas.size,
        averageRating: avgRating,
        gesehen,
    };
}

// ── Lists (Cloud) ────────────────────────────────────────

async function enrichListsWithSocial(lists) {
    if (!lists || lists.length === 0) return [];
    const listIds = lists.map(l => l.id);
    // Gleichzeitig: die drei Abfragen hängen nicht voneinander ab.
    const [likeCounts, myLikes, commentsByList] = await Promise.all([
        getLikesForItems('list', listIds),
        getMyLikesForItems('list', listIds),
        getCommentsForItems(listIds),
    ]);

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

// ── Fehlerprotokoll ──────────────────────────────────────
/**
 * Eine Zeile ins Fehlerprotokoll (src/fehlerprotokoll.js). Ohne .select():
 * lesen dürfen die Tabelle nur Admins, die Antwort bliebe leer. Kein
 * console.error bei einem Fehlschlag – der Aufrufer schweigt ohnehin.
 */
export async function fehlerMelden(eintrag) {
    const sb = getSupabase();
    if (!sb) return;
    const { error } = await sb.from('fehlerprotokoll').insert(eintrag);
    if (error) throw error;
}

// ── Datenexport ──────────────────────────────────────────
/**
 * Alles, was die Datenbank zum angemeldeten Konto hält, Zeile für Zeile –
 * für "Meine Daten herunterladen" (src/datenExport.js macht daraus die
 * Datei). Jede Abfrage filtert selbst auf die eigene Id: visits, comments,
 * likes und follows sind öffentlich lesbar, RLS allein ließe also auch
 * Fremdes durch.
 *
 * Nicht dabei ist push_protokoll (wann welche Mitteilung ging): die Tabelle
 * ist für die App gar nicht lesbar.
 */
export async function meineDatenCloud() {
    const session = await getSession();
    if (!session) throw new SupabaseError('Daten zusammenstellen', { message: 'Nicht eingeloggt' });
    const sb = getSupabase();
    const ich = session.user.id;
    const lesen = (tabelle, abfrage) => retryRead(() => abfrage(sb.from(tabelle)), `Datenexport: ${tabelle}`);

    const [profil, abende, listen, gesehen, kommentare, likes, ichFolge, folgenMir, anfragen,
        einladungen, vorschlaege, pushAbos, admin, werke, haeuser, komponisten, bildausschnitte, geplant] = await Promise.all([
        lesen('profiles', q => q.select('*').eq('id', ich).maybeSingle()),
        lesen('visits', q => q.select('*').eq('user_id', ich).order('date')),
        lesen('lists', q => q.select('*').eq('user_id', ich).order('created_at')),
        lesen('seen_operas', q => q.select('*').eq('user_id', ich).order('created_at')),
        lesen('comments', q => q.select('*').eq('user_id', ich).order('created_at')),
        lesen('likes', q => q.select('*').eq('user_id', ich).order('created_at')),
        lesen('follows', q => q.select('*').eq('follower_id', ich)),
        lesen('follows', q => q.select('*').eq('following_id', ich)),
        lesen('friend_requests', q => q.select('*').or(`sender_id.eq.${ich},receiver_id.eq.${ich}`).order('created_at')),
        lesen('invites', q => q.select('*').eq('created_by', ich).order('created_at')),
        lesen('suggestions', q => q.select('*').eq('user_id', ich).order('created_at')),
        // Ohne p256dh und auth – siehe src/datenExport.js.
        lesen('push_abos', q => q.select('id, endpoint, created_at, zuletzt_benutzt').eq('user_id', ich)),
        lesen('admins', q => q.select('*').eq('user_id', ich).maybeSingle()),
        lesen('catalog_operas', q => q.select('*').eq('created_by', ich)),
        lesen('catalog_houses', q => q.select('*').eq('created_by', ich)),
        lesen('catalog_composers', q => q.select('*').eq('created_by', ich)),
        lesen('bild_ausschnitte', q => q.select('*').eq('geaendert_von', ich)),
        lesen('geplante_besuche', q => q.select('*').eq('user_id', ich).order('datum')),
    ]);

    // Namen der anderen Seite von Freundschaften und Anfragen. profiles ist
    // öffentlich lesbar; es geht nur um den Benutzernamen.
    const andere = [...new Set([
        ...(ichFolge || []).map(f => f.following_id),
        ...(folgenMir || []).map(f => f.follower_id),
        ...(anfragen || []).flatMap(a => [a.sender_id, a.receiver_id]),
    ])].filter(id => id && id !== ich);
    const personen = andere.length
        ? await lesen('profiles', q => q.select('id, username').in('id', andere))
        : [];

    // Passkeys verwaltet Supabase Auth, nicht die Datenbank. Geht die Liste
    // nicht (Browser ohne WebAuthn, Dienst gestört), fehlt nur dieser Teil.
    let passkeys = null;
    try { passkeys = await listPasskeys(); } catch (e) { console.warn('[Supabase] Datenexport: Passkeys', e); }

    // Die Fotos mit Adressen, die einen Tag lang gelten – zum Herunterladen.
    const andenken = await mitAdressen(await lesen('andenken', q => q.select('*').eq('user_id', ich).order('created_at')) || [], 86400);

    const u = session.user;
    return {
        konto: {
            id: u.id,
            email: u.email ?? null,
            angelegt: u.created_at ?? null,
            letzte_anmeldung: u.last_sign_in_at ?? null,
            anmeldung_ueber: u.app_metadata?.providers ?? (u.app_metadata?.provider ? [u.app_metadata.provider] : []),
            admin: !!admin,
        },
        profil, abende, listen, gesehen, kommentare, likes, ichFolge, folgenMir, anfragen,
        einladungen, vorschlaege, pushAbos, passkeys, personen, geplant, andenken,
        katalog: { werke, haeuser, komponisten, bildausschnitte },
    };
}

// ── Geplante Besuche ─────────────────────────────────────
// Privat: nur die eigenen Zeilen (supabase/migrations/geplante_besuche_migration.sql).
const alsPlan = z => ({ id: z.id, operaId: z.opera_id, houseId: z.house_id, datum: z.datum, zeit: z.zeit || null });

export async function getGeplanteBesucheCloud() {
    const session = await getSession();
    if (!session) return [];
    const sb = getSupabase();
    const data = await retryRead(
        () => sb.from('geplante_besuche').select('id, opera_id, house_id, datum, zeit').eq('user_id', session.user.id).order('datum'),
        'Geplante Besuche laden'
    );
    return (data || []).map(alsPlan);
}

/** Legt einen Plan an; die Kennung vergibt der Browser, wie bei Besuchen. */
export async function addGeplantCloud(plan) {
    const session = await getSession();
    if (!session) throw new SupabaseError('Vormerken', { message: 'Nicht eingeloggt' });
    const sb = getSupabase();
    const result = await sb.from('geplante_besuche').insert({
        id: plan.id, user_id: session.user.id, opera_id: plan.operaId, house_id: plan.houseId, datum: plan.datum, zeit: plan.zeit || null,
    }).select('id, opera_id, house_id, datum, zeit');
    return alsPlan(unwrapWritten(result, 'Vormerken'));
}

export async function deleteGeplantCloud(id) {
    const session = await getSession();
    if (!session) throw new SupabaseError('Vormerkung entfernen', { message: 'Nicht eingeloggt' });
    const sb = getSupabase();
    const { error } = await sb.from('geplante_besuche').delete().eq('id', id).eq('user_id', session.user.id);
    if (error) throw new SupabaseError('Vormerkung entfernen', error);
    return true;
}

// ── Andenken: Fotos zu einem Abend ───────────────────────
//
// Zeilen in andenken, Dateien im privaten Bucket gleichen Namens unter
// <user_id>/<visit_id>/<id>.jpg, dazu die Vorschau <id>-klein.jpg – siehe
// supabase/migrations/andenken_migration.sql. Angezeigt wird über signierte
// Adressen; der Speicher gibt sie nur aus, wenn das Lesen erlaubt ist
// (eigene, oder die für Freunde freigegebenen von Freunden).

const ANDENKEN = 'andenken';
const ANDENKEN_SPALTEN = 'id, user_id, visit_id, pfad, vorschau, oeffentlich, breite, hoehe, created_at';
// Eine Stunde reicht für eine Sitzung auf der Seite eines Abends.
const ANZEIGE_SEKUNDEN = 3600;
// Die Dateien ändern sich nie (jedes Foto hat seinen eigenen Namen); der
// Browser darf sie also lange behalten.
const DATEI_CACHE = '31536000';

// Signierte Adressen, solange sie noch eine Weile gelten. Jede neue
// Signatur ist eine neue Adresse – und damit für den Browser eine neue
// Datei, die er noch einmal lädt. Wer zwischen Feed und Abend hin- und
// herwechselt, bekäme sonst dasselbe Foto jedes Mal frisch übers Netz.
const adressen = new Map();   // pfad -> { url, bis }
const RESTZEIT_MS = 10 * 60 * 1000;

async function mitAdressen(zeilen, sekunden = ANZEIGE_SEKUNDEN) {
    if (!zeilen.length) return [];
    const merken = sekunden === ANZEIGE_SEKUNDEN;
    const pfade = [...new Set(zeilen.flatMap(z => [z.pfad, z.vorschau]).filter(Boolean))];
    const jetzt = Date.now();
    const offen = merken ? pfade.filter(p => !(adressen.get(p)?.bis - jetzt > RESTZEIT_MS)) : pfade;
    const neu = new Map();
    if (offen.length) {
        const sb = getSupabase();
        const { data, error } = await sb.storage.from(ANDENKEN).createSignedUrls(offen, sekunden);
        if (error) throw new SupabaseError('Fotos laden', error);
        for (const d of data || []) {
            if (!d.signedUrl) continue;
            neu.set(d.path, d.signedUrl);
            if (merken) adressen.set(d.path, { url: d.signedUrl, bis: jetzt + sekunden * 1000 });
        }
    }
    const adresse = p => neu.get(p) || (merken ? adressen.get(p)?.url : null) || null;
    return zeilen.map(z => ({
        ...z,
        url: adresse(z.pfad),
        // Ältere Fotos haben keine Vorschau – dann eben das Foto selbst.
        vorschauUrl: (z.vorschau && adresse(z.vorschau)) || adresse(z.pfad),
    }));
}

/** Die Andenken eines Abends, die man sehen darf – eigene alle, von Freunden die freigegebenen. */
export async function getAndenkenCloud(visitId) {
    const sb = getSupabase();
    const zeilen = unwrap(await sb.from('andenken')
        .select(ANDENKEN_SPALTEN)
        .eq('visit_id', visitId)
        .order('created_at'), 'Fotos laden') || [];
    return mitAdressen(zeilen);
}

/**
 * Die für Freunde freigegebenen Andenken mehrerer Abende, für den Feed – in
 * einer Abfrage statt einer je Karte. Die Regel in der Datenbank lässt nur
 * die von Freunden durch; hier kommt nur die Freigabe dazu, damit auch die
 * eigenen privaten nicht im Feed stehen.
 * @returns {Promise<Map<string, Array>>} Abend-ID -> Fotos
 */
export async function getFreigegebeneAndenkenCloud(visitIds) {
    const ids = [...new Set(visitIds.map(String))];
    const nachAbend = new Map();
    if (!ids.length) return nachAbend;
    const sb = getSupabase();
    const zeilen = unwrap(await sb.from('andenken')
        .select(ANDENKEN_SPALTEN)
        .in('visit_id', ids)
        .eq('oeffentlich', true)
        .order('created_at'), 'Fotos im Feed laden') || [];
    for (const z of await mitAdressen(zeilen)) {
        const id = String(z.visit_id);
        if (!nachAbend.has(id)) nachAbend.set(id, []);
        nachAbend.get(id).push(z);
    }
    return nachAbend;
}

/**
 * Lädt ein vorbereitetes Foto samt Vorschau hoch (src/bild.js) und legt die
 * Zeile an. Scheitert etwas danach, werden die Dateien wieder entfernt –
 * sonst lägen sie verwaist im Speicher.
 */
export async function addAndenkenCloud(visitId, id, { blob, vorschau: vorschauBlob, breite, hoehe, oeffentlich = false }) {
    const session = await getSession();
    if (!session) throw new SupabaseError('Foto hochladen', { message: 'Nicht eingeloggt' });
    const sb = getSupabase();
    const pfad = `${session.user.id}/${visitId}/${id}.jpg`;
    const vorschau = vorschauBlob ? pfad.replace(/\.jpg$/, '-klein.jpg') : null;
    const optionen = { contentType: 'image/jpeg', upsert: false, cacheControl: DATEI_CACHE };
    const hochgeladen = [];
    const aufraeumen = () => (hochgeladen.length
        ? sb.storage.from(ANDENKEN).remove(hochgeladen).catch(() => {}) : null);
    try {
        const hoch = await sb.storage.from(ANDENKEN).upload(pfad, blob, optionen);
        if (hoch.error) throw new SupabaseError('Foto hochladen', hoch.error);
        hochgeladen.push(pfad);
        if (vorschau) {
            const klein = await sb.storage.from(ANDENKEN).upload(vorschau, vorschauBlob, optionen);
            if (klein.error) throw new SupabaseError('Foto hochladen', klein.error);
            hochgeladen.push(vorschau);
        }
        const result = await sb.from('andenken')
            .insert({ id, user_id: session.user.id, visit_id: visitId, pfad, vorschau, breite, hoehe, oeffentlich: !!oeffentlich })
            .select(ANDENKEN_SPALTEN);
        const zeile = unwrapWritten(result, 'Foto speichern');
        return (await mitAdressen([zeile]))[0];
    } catch (e) {
        await aufraeumen();
        throw e;
    }
}

export async function setAndenkenOeffentlichCloud(id, oeffentlich) {
    const sb = getSupabase();
    unwrapWritten(await sb.from('andenken').update({ oeffentlich }).eq('id', id).select('id'), 'Sichtbarkeit ändern');
    return true;
}

/** Erst die Dateien, dann die Zeile: blieben die Dateien stehen, fände sie niemand mehr. */
export async function deleteAndenkenCloud({ id, pfad, vorschau = null }) {
    const sb = getSupabase();
    const weg = await sb.storage.from(ANDENKEN).remove([pfad, vorschau].filter(Boolean));
    if (weg.error) throw new SupabaseError('Foto löschen', weg.error);
    const { error } = await sb.from('andenken').delete().eq('id', id);
    if (error) throw new SupabaseError('Foto löschen', error);
    return true;
}

/**
 * Entfernt die Dateien der eigenen Andenken – eines Abends oder alle. Vor dem
 * Löschen eines Abends und des Kontos: die Zeilen verschwinden dann von
 * selbst, die Dateien nicht (per SQL lassen sie sich nicht löschen).
 */
export async function andenkenDateienLoeschen({ visitId = null } = {}) {
    const session = await getSession();
    if (!session) return;
    const sb = getSupabase();
    let abfrage = sb.from('andenken').select('pfad, vorschau').eq('user_id', session.user.id);
    if (visitId) abfrage = abfrage.eq('visit_id', visitId);
    const pfade = (unwrap(await abfrage, 'Fotos zum Löschen finden') || [])
        .flatMap(z => [z.pfad, z.vorschau]).filter(Boolean);
    if (!pfade.length) return;
    const { error } = await sb.storage.from(ANDENKEN).remove(pfade);
    if (error) throw new SupabaseError('Fotos löschen', error);
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

// ── Katalog: die Einträge, die der Admin selbst angelegt hat ─────────────
//
// Sie liegen in catalog_operas, catalog_houses und catalog_composers und
// werden beim Start unter den Katalog aus dem Repo gemischt; siehe
// src/data/katalogZusatz.js.
//
// Lesen darf jeder, auch ohne Anmeldung – der Katalog ist der Inhalt der App.
// Schreiben lässt nur die Datenbank zu, und zwar nur, wer in admins steht.
// Die Prüfung hier in der Oberfläche ist reine Höflichkeit: sie blendet
// Schaltflächen aus, die ohnehin nichts bewirkt hätten.

/** Steht das angemeldete Konto in der Admin-Tabelle? */
// Ob jemand Admin ist, ändert sich nicht mitten in der Sitzung. Gefragt
// wurde trotzdem bei jedem Seitenwechsel – am 26.09.2026 über 700-mal an
// einem Tag. Die Antwort gilt jetzt je Konto, bis die Seite neu lädt; ein
// Fehlschlag wird nicht gemerkt, beim nächsten Mal wird wieder gefragt.
let adminAntwort = null; // { nutzer, antwort: Promise<boolean> }

/**
 * Wie viel bei Supabase belegt ist, in Bytes – nur für Admins, siehe
 * supabase/migrations/speicher_belegt_migration.sql.
 * @returns {Promise<{dateien: number, datenbank: number}>}
 */
export async function getSpeicherBelegtCloud() {
    const sb = getSupabase();
    const daten = unwrap(await sb.rpc('speicher_belegt'), 'Speicher prüfen');
    const zeile = Array.isArray(daten) ? daten[0] : daten;
    return { dateien: Number(zeile?.dateien) || 0, datenbank: Number(zeile?.datenbank) || 0 };
}

export async function istAdmin() {
    const session = await getSession();
    if (!session) return false;
    const sb = getSupabase();
    if (!sb) return false;
    if (adminAntwort?.nutzer === session.user.id) return adminAntwort.antwort;
    // Die Regel auf admins zeigt jedem nur die eigene Zeile. Kommt eine
    // zurück, ist man Admin; kommt keine, nicht. Wer sonst Admin ist, erfährt
    // man auf diesem Weg nicht.
    const eintrag = { nutzer: session.user.id };
    eintrag.antwort = (async () => {
        const { data, error } = await sb.from('admins').select('user_id').maybeSingle();
        if (error) {
            console.error('[Supabase] Adminrecht prüfen', error);
            if (adminAntwort === eintrag) adminAntwort = null;
            return false;
        }
        return !!data;
    })();
    adminAntwort = eintrag;
    return eintrag.antwort;
}

/** Alle drei Zusatztabellen auf einmal, dazu die Bildausschnitte. */
export async function getKatalogZusatzCloud() {
    const sb = getSupabase();
    if (!sb) return { werke: [], haeuser: [], komponisten: [] };

    const [werke, haeuser, komponisten, ausschnitte] = await Promise.all([
        sb.from('catalog_operas').select('*'),
        sb.from('catalog_houses').select('*'),
        sb.from('catalog_composers').select('*'),
        sb.from('bild_ausschnitte').select('art, id, x, y'),
    ]);

    return {
        werke: unwrap(werke, 'Werke aus dem Katalog holen') ?? [],
        haeuser: unwrap(haeuser, 'Häuser aus dem Katalog holen') ?? [],
        komponisten: unwrap(komponisten, 'Komponisten aus dem Katalog holen') ?? [],
        // Ohne Ausschnitte ist der Katalog trotzdem vollständig. Ein Fehler
        // hier soll ihn nicht mitreißen; dann gilt der Stand von zuletzt.
        ausschnitte: ausschnitte.error
            ? (console.error('[Supabase] Bildausschnitte holen', ausschnitte.error), undefined)
            : ausschnitte.data ?? [],
    };
}

/**
 * Den Ausschnitt eines Katalogbilds speichern (nur Admins, siehe
 * supabase/migrations/bild_ausschnitte_migration.sql). Ohne Adminrecht
 * verwirft die Regel die Zeile, und unwrapWritten meldet das als Fehler.
 */
export async function setBildAusschnitt(art, id, { x, y }) {
    const session = await getSession();
    if (!session) throw new Error('Dafür musst du angemeldet sein.');
    const sb = getSupabase();
    return unwrapWritten(
        await sb.from('bild_ausschnitte')
            .upsert({ art, id, x, y, geaendert_von: session.user.id, geaendert: new Date().toISOString() }, { onConflict: 'art,id' })
            .select(),
        'Bildausschnitt speichern');
}

/**
 * Zurück auf die Mitte: die Zeile fällt weg. Hatte der Eintrag gar keinen
 * Ausschnitt, ist nichts zu löschen – dann ist auch keine Zeile kein Fehler.
 */
export async function deleteBildAusschnitt(art, id, { hatteEinen = true } = {}) {
    const sb = getSupabase();
    if (!sb) throw new Error('Keine Verbindung.');
    const antwort = await sb.from('bild_ausschnitte').delete().eq('art', art).eq('id', id).select();
    return hatteEinen ? unwrapWritten(antwort, 'Bildausschnitt zurücksetzen') : unwrap(antwort, 'Bildausschnitt zurücksetzen');
}

/**
 * Legt einen Katalogeintrag an.
 *
 * Schlägt die Regel der Datenbank zu, kommt "Keine Zeile betroffen" zurück –
 * unwrapWritten macht daraus einen Fehler statt eines stillen Nichts. Genau
 * das würde passieren, wenn jemand ohne Adminrecht das Formular aufruft.
 */
async function katalogAnlegen(tabelle, zeile, was) {
    const session = await getSession();
    if (!session) throw new Error('Dafür musst du angemeldet sein.');
    const sb = getSupabase();
    return unwrapWritten(
        await sb.from(tabelle).insert({ ...zeile, created_by: session.user.id }).select(),
        was);
}

export const addKatalogWerk = (werk) => katalogAnlegen('catalog_operas', {
    id: werk.id,
    title: werk.title,
    composer: werk.composer,
    year_composed: Number(werk.yearComposed),
    language: werk.language,
    acts: Number(werk.acts),
    genre: werk.genre,
    librettist: werk.librettist,
    description: werk.description,
    image: werk.image,
}, 'Werk zum Katalog hinzufügen');

export const addKatalogHaus = (haus) => katalogAnlegen('catalog_houses', {
    id: haus.id,
    name: haus.name,
    city: haus.city,
    state: haus.state,
    lat: Number(haus.lat),
    lon: Number(haus.lon),
    capacity: Number(haus.capacity),
    founded: Number(haus.founded),
    description: haus.description,
    color: haus.color,
    image_url: haus.imageUrl,
}, 'Haus zum Katalog hinzufügen');

export const addKatalogKomponist = (k) => katalogAnlegen('catalog_composers', {
    id: k.id,
    name: k.name,
    kurz: k.kurz,
    bio: k.bio,
    bild: k.bild || '',
    bild_lizenz: k.bildLizenz || '',
    bild_urheber: k.bildUrheber || '',
    wikipedia: k.wikipedia,
}, 'Komponist zum Katalog hinzufügen');

/**
 * Was hängt an einem Katalogeintrag? Nur Zahlen, keine Namen.
 *
 * Die Zählung läuft in der Datenbank, weil der Admin das meiste davon gar
 * nicht sehen darf: seen_operas zeigt jedem nur die eigenen Markierungen.
 */
export async function katalogVerweise(art, id) {
    const sb = getSupabase();
    if (!sb) throw new Error('Keine Verbindung.');
    const { data, error } = await sb.rpc('katalog_verweise', { p_art: art, p_id: id });
    if (error) throw new SupabaseError('Verweise auf den Eintrag zählen', error);
    const z = Array.isArray(data) ? data[0] : data;
    return {
        besuche: Number(z?.besuche ?? 0),
        markierungen: Number(z?.markierungen ?? 0),
        listen: Number(z?.listen ?? 0),
    };
}

/**
 * Einen selbst angelegten Katalogeintrag löschen.
 *
 * Greift nur bei Einträgen aus der Datenbank. Was in src/data/ als Datei
 * liegt, kann die App nicht entfernen – dafür braucht es einen Commit.
 */
async function katalogLoeschen(tabelle, id, was) {
    const sb = getSupabase();
    if (!sb) throw new Error('Keine Verbindung.');
    return unwrapWritten(await sb.from(tabelle).delete().eq('id', id).select(), was);
}

export const deleteKatalogWerk = (id) => katalogLoeschen('catalog_operas', id, 'Werk aus dem Katalog entfernen');
export const deleteKatalogHaus = (id) => katalogLoeschen('catalog_houses', id, 'Haus aus dem Katalog entfernen');

/**
 * Das eigene Konto endgültig löschen.
 *
 * Die Funktion in der Datenbank nimmt keine Kennung entgegen – sie nimmt die
 * des Aufrufers. Es gibt also keinen Weg, darüber ein fremdes Konto zu
 * treffen, auch nicht mit einem aufgebohrten Client.
 *
 * Was mitgeht, regeln die Fremdschlüssel: Profil, Abende, Markierungen,
 * Listen, Likes, Kommentare, Folgebeziehungen, Einladungen, Vorschläge. Was
 * bleibt, sind selbst angelegte Katalogeinträge – die gehören nach dem
 * Anlegen allen, nur die Urheberangabe fällt weg.
 */
export async function kontoLoeschen() {
    const session = await getSession();
    if (!session) throw new Error('Dafür musst du angemeldet sein.');
    const sb = getSupabase();
    if (!sb) throw new Error('Keine Verbindung.');
    // Die Fotos zuerst – mit dem Konto gingen nur ihre Zeilen, die Dateien
    // blieben im Speicher.
    await andenkenDateienLoeschen();
    const { error } = await sb.rpc('konto_loeschen');
    if (error) throw new SupabaseError('Konto löschen', error);
    // Mit dem Konto sind auch seine Passkeys weg. Bliebe der Vermerk, böte die
    // Anmeldeseite einen Knopf an, der nur noch scheitern kann.
    passkeyVermerken(session.user?.id, false);
}
