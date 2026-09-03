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
/**
 * Verzögerung für das Einblenden einer Karte in einer langen Liste.
 *
 * Gestaffelt wird nur das erste Bildschirmfoto voll – danach ist die
 * Verzögerung gedeckelt. Ungedeckelt war sie der Grund, warum die Rückkehr in
 * eine Liste "lange lud": bei 106 Werken startete die letzte Karte nach 3,2
 * Sekunden, und wer an Position 12000 zurückkam, sah dort gemessen 1,9
 * Sekunden lang nichts. Karten unterhalb des sichtbaren Bereichs haben von der
 * Staffelung ohnehin nichts – dort ist längst niemand mehr, wenn sie an die
 * Reihe kommen.
 *
 * @param {number} i        Position in der Liste
 * @param {number} schritt  Abstand zwischen zwei Karten in Sekunden
 * @param {number} maxIndex ab hier laufen alle gemeinsam los
 * @returns {string}        Wert für style.animationDelay
 */
export function einblendVerzoegerung(i, schritt = 0.03, maxIndex = 10) {
    return `${(Math.min(i, maxIndex) * schritt).toFixed(2)}s`;
}

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

// ── Grobe Ortung über die IP-Adresse ──────────────────────
//
// Nur als letzte Rückfallebene, wenn weder die Standortfreigabe noch das
// Tagebuch etwas hergeben. Der Browser kann seine eigene öffentliche IP nicht
// auslesen; es braucht dafür zwingend einen Dienst, der sie zurückspiegelt –
// der sieht dabei die IP. Deshalb wird er auch nur dann überhaupt gefragt.
//
// Die Genauigkeit ist stadtgenau im Festnetz und im Mobilfunk oft deutlich
// schlechter, weil Netze über zentrale Knoten leiten. Die Aufrufstelle
// kennzeichnet das Ergebnis entsprechend als Schätzung.

const IP_POSITION_KEY = 'opernlog:positionIP';
const IP_POSITION_MAX_AGE = 6 * 60 * 60 * 1000;

// Beide ohne Schlüssel und mit CORS-Freigabe. Der zweite wird nur gefragt,
// wenn der erste nicht antwortet – im Normalfall sieht also genau ein Dienst
// die IP.
const IP_SERVICES = [
    'https://ipwho.is/',
    'https://get.geojs.io/v1/ip/geo.json',
];

// Die Dienste schreiben die Felder unterschiedlich, geojs liefert sie zudem
// als Zeichenketten.
function readLatLon(data) {
    if (!data || data.success === false || data.error) return null;
    const lat = Number(data.latitude ?? data.lat);
    const lon = Number(data.longitude ?? data.lon ?? data.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
    if (lat === 0 && lon === 0) return null;   // manche Dienste antworten so, wenn sie nichts wissen
    return { lat, lon };
}

/**
 * Ungefähre Position anhand der IP-Adresse.
 *
 * @returns {Promise<{lat: number, lon: number, approximate: true}|null>}
 */
export async function requestPositionByIP() {
    const cached = readStored(IP_POSITION_KEY);
    if (cached && Number.isFinite(cached.at) && Date.now() - cached.at < IP_POSITION_MAX_AGE) {
        const p = readLatLon(cached);
        if (p) return { ...p, approximate: true };
    }

    // Offline gibt es nichts zu holen – und der Dienst würde nur unnötig
    // in eine Zeitüberschreitung laufen.
    if (navigator.onLine === false) return null;

    for (const url of IP_SERVICES) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 5000);
            let data;
            try {
                const res = await fetch(url, { signal: controller.signal, cache: 'no-store' });
                if (!res.ok) continue;
                data = await res.json();
            } finally {
                clearTimeout(timer);
            }

            const p = readLatLon(data);
            if (!p) continue;

            writeStored(IP_POSITION_KEY, { ...p, at: Date.now() });
            return { ...p, approximate: true };
        } catch (e) {
            console.warn(`[Standort] IP-Ortung über ${url} fehlgeschlagen:`, e?.message || e);
        }
    }
    return null;
}

/**
 * Die Mitwirkenden eines Besuchs: Dirigent, Regie, Besetzung. Alle drei sind
 * optional und können leer sein.
 *
 * Besuche kommen in zwei Schreibweisen daher – aus der Cloud in snake_case,
 * aus dem lokalen Speicher in camelCase. Diese Funktion ist die einzige
 * Stelle, die beide kennt. Sonst stünde `visit.castList || visit.cast_list`
 * über die halbe Oberfläche verteilt, und genau solche Doppelungen sind hier
 * schon zweimal der Grund gewesen, warum eine Änderung eine Stelle vergessen
 * hat.
 *
 * @returns {{conductor: string, director: string, castList: string, any: boolean}}
 */
export function visitCredits(visit = {}) {
    const text = (...werte) => String(werte.find(w => w != null) ?? '').trim();
    const conductor = text(visit.conductor);
    const director = text(visit.director);
    const castList = text(visit.castList, visit.cast_list);
    return { conductor, director, castList, any: !!(conductor || director || castList) };
}
