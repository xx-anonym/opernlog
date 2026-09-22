// Push-Mitteilungen auf diesem Gerät: kann der Browser sie, sind sie an,
// und das Ein- und Ausschalten.
//
// Die Oberfläche steht in components/Mitteilungen.js, der Versand auf dem
// Server (supabase/functions/push-senden). Alles, was hier den Browser
// anfasst, bekommt ihn als "umgebung" hinein – so lässt es sich ohne echten
// Push-Dienst prüfen.

import * as sb from './store/supabase.js';

/**
 * Was dieses Gerät kann:
 *
 *   'unmoeglich'   kein Push in diesem Browser – der Bereich bleibt weg
 *   'installieren' iPhone oder iPad im Safari-Tab: Push gibt es dort erst,
 *                  wenn OpernLog auf dem Home-Bildschirm liegt
 *   'verweigert'   in den Einstellungen des Geräts blockiert
 *   'bereit'       lässt sich einschalten (oder ist es schon)
 */
export function pushZustand(umgebung = globalThis) {
    const nav = umgebung.navigator || {};
    const ios = /iPad|iPhone|iPod/.test(nav.userAgent || '')
        // iPadOS gibt sich als Mac aus; verraten wird es durch den Touchscreen.
        || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
    const installiert = nav.standalone === true
        || !!umgebung.matchMedia?.('(display-mode: standalone)')?.matches;

    const kannPush = 'serviceWorker' in nav && 'PushManager' in umgebung && 'Notification' in umgebung;
    if (!kannPush) return ios && !installiert ? 'installieren' : 'unmoeglich';
    if (umgebung.Notification.permission === 'denied') return 'verweigert';
    return 'bereit';
}

/** Der öffentliche VAPID-Schlüssel (base64url) als Bytes für subscribe(). */
export function schluesselZuBytes(b64u) {
    const b64 = String(b64u).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    return Uint8Array.from(bin, c => c.charCodeAt(0));
}

function gleicheBytes(a, b) {
    if (!a || !b) return false;
    const x = new Uint8Array(a), y = new Uint8Array(b);
    return x.length === y.length && x.every((v, i) => v === y[i]);
}

/** Das Abo, wie die Datenbank es erwartet. */
function aboDaten(abo) {
    const j = abo.toJSON();
    return { endpoint: j.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth };
}

async function registrierung(umgebung) {
    return umgebung.navigator.serviceWorker.ready;
}

const STANDARD = {
    schluessel: () => sb.pushSchluessel(),
    speichern: (abo) => sb.pushAboSpeichern(abo),
    loeschen: (endpoint) => sb.pushAboLoeschen(endpoint),
};

/**
 * Sind Mitteilungen auf diesem Gerät an? Wenn ja, wird das Abo bei der
 * Gelegenheit noch einmal abgelegt: es kann in der Datenbank fehlen, etwa weil
 * sich vorher jemand anderes auf dem Gerät angemeldet hatte oder der
 * Push-Dienst es verworfen hat.
 */
export async function pushAn({ umgebung = globalThis, dienste = {} } = {}) {
    const d = { ...STANDARD, ...dienste };
    if (pushZustand(umgebung) !== 'bereit' || umgebung.Notification.permission !== 'granted') return false;
    const reg = await registrierung(umgebung);
    const abo = await reg.pushManager.getSubscription();
    if (!abo) return false;
    await d.speichern(aboDaten(abo));
    return true;
}

/**
 * Schaltet Mitteilungen ein. Muss aus einem Tippen heraus aufgerufen werden:
 * Safari fragt sonst gar nicht erst nach der Erlaubnis.
 *
 * @param {string} [schluessel]  vorab geholter VAPID-Schlüssel. Vorab, weil
 *   Safari die Erlaubnisfrage nur unmittelbar nach dem Tippen stellt – ein
 *   Netzaufruf dazwischen kann das Tippen "verbrauchen".
 * @returns {Promise<'an'|'aus'|'verweigert'>}
 */
export async function pushEinschalten({ schluessel, umgebung = globalThis, dienste = {} } = {}) {
    const d = { ...STANDARD, ...dienste };
    const erlaubnis = await umgebung.Notification.requestPermission();
    if (erlaubnis === 'denied') return 'verweigert';
    if (erlaubnis !== 'granted') return 'aus';

    const s = schluesselZuBytes(schluessel || await d.schluessel());
    const reg = await registrierung(umgebung);
    let abo = await reg.pushManager.getSubscription();
    // Ein altes Abo mit einem anderen Schlüssel taugt nicht: der Push-Dienst
    // nähme unsere Mitteilungen dafür nicht an.
    if (abo && !gleicheBytes(abo.options?.applicationServerKey, s)) {
        await abo.unsubscribe();
        abo = null;
    }
    if (!abo) abo = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: s });
    await d.speichern(aboDaten(abo));
    return 'an';
}

/** Schaltet Mitteilungen auf diesem Gerät aus – im Browser und in der Datenbank. */
export async function pushAusschalten({ umgebung = globalThis, dienste = {} } = {}) {
    const d = { ...STANDARD, ...dienste };
    const reg = await registrierung(umgebung);
    const abo = await reg.pushManager.getSubscription();
    if (!abo) return;
    const { endpoint } = aboDaten(abo);
    await d.loeschen(endpoint);
    await abo.unsubscribe();
}

/**
 * Beim Abmelden: das Gerät soll dem abgemeldeten Konto nichts mehr zeigen.
 * Scheitert das, wird trotzdem abgemeldet – deshalb schluckt diese Funktion
 * jeden Fehler.
 */
export async function pushBeimAbmelden({ umgebung = globalThis, dienste = {} } = {}) {
    try {
        if (pushZustand(umgebung) !== 'bereit') return;
        const reg = await Promise.race([
            registrierung(umgebung),
            new Promise(fertig => setTimeout(() => fertig(null), 2000)),
        ]);
        if (!reg) return;
        const abo = await reg.pushManager.getSubscription();
        if (!abo) return;
        await pushAusschalten({ umgebung, dienste });
    } catch (e) {
        console.warn('[Push] Abmelden: Abo nicht entfernt', e);
    }
}

// ── Die Frage beim ersten Anmelden ──────────────────────────────────────

const GEFRAGT = 'opernlog:mitteilungenGefragt';
const NEU_TAGE = 30;

/**
 * Soll dieses Gerät jetzt fragen, ob Mitteilungen gewünscht sind?
 *
 * Nur bei neuen Konten (höchstens 30 Tage alt), nur einmal pro Gerät, und nur
 * wenn die Frage etwas bewirken kann: Push möglich, noch nie beantwortet,
 * nicht schon eingeschaltet. Das iPhone im Safari-Tab fragt deshalb nicht –
 * dort steht der Hinweis aufs Installieren, und gefragt wird beim ersten
 * Anmelden in der installierten App. Die hat ihren eigenen Speicher und
 * damit ihr eigenes "schon gefragt".
 *
 * @param {object} o
 * @param {string} o.profilErstellt  created_at des Profils
 */
export function mitteilungenFrageFaellig({ umgebung = globalThis, profilErstellt, jetzt = Date.now() } = {}) {
    if (pushZustand(umgebung) !== 'bereit') return false;
    if (umgebung.Notification.permission !== 'default') return false;
    const erstellt = Date.parse(profilErstellt || '');
    if (!Number.isFinite(erstellt) || jetzt - erstellt > NEU_TAGE * 24 * 3600 * 1000) return false;
    try {
        if (umgebung.localStorage?.getItem(GEFRAGT)) return false;
    } catch {
        // Ohne Speicher lieber nicht fragen: sonst käme die Frage bei jedem Start.
        return false;
    }
    return true;
}

/** Die Frage ist beantwortet – auf diesem Gerät nicht noch einmal stellen. */
export function mitteilungenFrageErledigt(umgebung = globalThis) {
    try {
        umgebung.localStorage?.setItem(GEFRAGT, new Date().toISOString());
    } catch {
        // siehe oben
    }
}
