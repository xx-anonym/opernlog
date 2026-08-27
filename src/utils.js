// Utility functions shared across OpernLog

/**
 * Baut den Hintergrund für Karten- und Kopfbilder aus drei Ebenen:
 * Abdunklung, Foto, farbiger Verlauf.
 *
 * Der Verlauf liegt unter dem Foto statt in einem else-Zweig. Scheitert das
 * Laden – Netz weg, Host blockiert, Bild verschwunden – malt die Foto-Ebene
 * einfach nichts und der Verlauf wird sichtbar. Vorher stand der Verlauf im
 * else-Zweig einer Bedingung, die prüfte, ob eine URL existiert; da alle
 * Einträge eine haben, war er unerreichbar und an der Stelle blieb ein
 * schwarzes Loch.
 *
 * @param {string} url         Bild-URL (darf leer sein)
 * @param {string} fallback    CSS-Verlauf, z.B. linear-gradient(...)
 * @param {string} scrim       Farbstopps der Abdunklung über dem Bild
 */
export function coverBackground(url, fallback, scrim = 'rgba(0,0,0,0.15), rgba(20,24,28,0.85)') {
    const layers = [];
    if (scrim) layers.push(`linear-gradient(to bottom, ${scrim})`);
    if (url) layers.push(`url('${cssUrl(url)}')`);
    layers.push(fallback);
    return `background-image: ${layers.join(', ')}; background-size: cover; background-position: center;`;
}

// Nur die Zeichen maskieren, die url('...') aufbrechen könnten. Bewusst kein
// encodeURI: die Wikimedia-Adressen sind bereits prozentkodiert und würden
// dabei ein zweites Mal kodiert.
function cssUrl(url) {
    return String(url).replace(/['"()\\\s]/g, c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'));
}

/**
 * Escapes HTML special characters to prevent XSS attacks.
 * Use this for ALL user-generated content before inserting into innerHTML.
 */
export function escapeHTML(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Kopiert Text in die Zwischenablage und meldet, ob es geklappt hat.
 *
 * Die Zwischenablage-API scheitert regelmäßig: in unsicheren Kontexten, ohne
 * Nutzergeste (Safari), bei verweigerter Berechtigung. Vorher hing der Aufruf
 * an einem .then() ohne .catch – schlug er fehl, passierte schlicht nichts und
 * der Nutzer stand ohne Rückmeldung da.
 *
 * Als Rückfallebene wird der Text im übergebenen Feld markiert, damit man ihn
 * von Hand kopieren kann.
 *
 * @param {string} text
 * @param {HTMLInputElement} [inputEl]  Feld, dessen Inhalt notfalls markiert wird
 * @returns {Promise<boolean>}
 */
export async function copyToClipboard(text, inputEl) {
    try {
        if (!navigator.clipboard?.writeText) throw new Error('Zwischenablage nicht verfügbar');
        await navigator.clipboard.writeText(text);
        return true;
    } catch (e) {
        console.error('[Zwischenablage] Kopieren fehlgeschlagen', e);
        if (inputEl) {
            inputEl.focus();
            inputEl.select();
        }
        return false;
    }
}

// ── Standort ──────────────────────────────────────────────
//
// Wird für die Vorauswahl des nächstgelegenen Opernhauses beim Loggen
// gebraucht. Zwei Eigenheiten bestimmen den Aufbau:
//
// 1. getCurrentPosition öffnet einen Berechtigungsdialog und kann Sekunden
//    dauern. Deshalb wird die letzte bekannte Position gespeichert: beim
//    nächsten Mal steht die Vorauswahl sofort, auch offline.
// 2. Eine einmal verweigerte Berechtigung soll nicht bei jedem Öffnen des
//    Formulars erneut erfragt werden. Chrome liefert das über die
//    Permissions-API, Safari nicht – dafür der gemerkte Vermerk.

const POSITION_KEY = 'opernlog:position';
const POSITION_DENIED_KEY = 'opernlog:positionDenied';
const POSITION_MAX_AGE = 12 * 60 * 60 * 1000;   // gespeicherte Position: 12 h
const DENIED_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // Vermerk „verweigert“: 7 Tage

function readStored(key) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        // localStorage fehlt im privaten Modus mancher Browser
        return null;
    }
}

function writeStored(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        /* ohne Speicher läuft alles weiter, nur ohne Gedächtnis */
    }
}

function positionDenied() {
    const mark = readStored(POSITION_DENIED_KEY);
    return !!mark && Number.isFinite(mark.at) && Date.now() - mark.at < DENIED_MAX_AGE;
}

function rememberDenied() {
    writeStored(POSITION_DENIED_KEY, { at: Date.now() });
}

function forgetDenied() {
    try {
        localStorage.removeItem(POSITION_DENIED_KEY);
    } catch (e) { /* siehe oben */ }
}

/**
 * Die zuletzt gespeicherte Position – ohne Nachfrage und ohne Wartezeit.
 * @returns {{lat: number, lon: number, cached: true}|null}
 */
export function getCachedPosition(maxAge = POSITION_MAX_AGE) {
    const p = readStored(POSITION_KEY);
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return null;
    if (!Number.isFinite(p.at) || Date.now() - p.at > maxAge) return null;
    return { lat: p.lat, lon: p.lon, cached: true };
}

/**
 * Fragt den aktuellen Standort ab. Scheitert das – kein Empfang, verweigert,
 * unsicherer Kontext –, kommt null zurück; die Stelle im Aufrufer verhält sich
 * dann so, als hätte es die Funktion nie gegeben.
 *
 * @returns {Promise<{lat: number, lon: number, cached: false}|null>}
 */
export async function requestPosition({ timeout = 8000, maximumAge = 10 * 60 * 1000 } = {}) {
    // Geolocation gibt es nur in sicheren Kontexten (https bzw. localhost)
    if (!navigator.geolocation) return null;
    if (positionDenied()) return null;

    if (navigator.permissions?.query) {
        try {
            const status = await navigator.permissions.query({ name: 'geolocation' });
            if (status.state === 'denied') { rememberDenied(); return null; }
            // Nachträglich erteilt: den alten Vermerk wegräumen
            forgetDenied();
        } catch (e) {
            // Manche Browser kennen den Namen 'geolocation' nicht – dann eben fragen
        }
    }

    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lon = pos.coords.longitude;
                writeStored(POSITION_KEY, { lat, lon, at: Date.now() });
                resolve({ lat, lon, cached: false });
            },
            (err) => {
                if (err && err.code === err.PERMISSION_DENIED) rememberDenied();
                console.warn('[Standort] nicht ermittelbar:', err?.message || err);
                resolve(null);
            },
            { enableHighAccuracy: false, timeout, maximumAge }
        );
    });
}
