// Web Push ohne Fremdbibliothek: Verschlüsselung nach RFC 8291 (aes128gcm)
// und Absenderausweis nach RFC 8292 (VAPID).
//
// Warum selbst: die üblichen Bibliotheken (web-push für Node) setzen auf das
// crypto-Modul von Node, das in Supabases Edge Runtime nur teilweise da ist.
// Alles hier braucht nur WebCrypto – das gibt es in Deno, in Node ab 20 und in
// jedem Browser gleich. Deshalb lässt sich diese Datei auch in den Tests unter
// Node laden und gegen das Rechenbeispiel aus RFC 8291 prüfen, Byte für Byte.
//
// Plain JavaScript statt TypeScript aus demselben Grund: Node soll die Datei
// ohne Übersetzungsschritt importieren können.

const te = new TextEncoder();

/** base64url ohne Auffüllung, wie Web Push es überall verwendet. */
export function b64u(bytes) {
    let bin = '';
    for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function vonB64u(text) {
    const b64 = String(text).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    return Uint8Array.from(bin, c => c.charCodeAt(0));
}

function verbinde(...teile) {
    const laenge = teile.reduce((s, t) => s + t.length, 0);
    const aus = new Uint8Array(laenge);
    let pos = 0;
    for (const t of teile) { aus.set(t, pos); pos += t.length; }
    return aus;
}

async function hkdf(salt, ikm, info, bytes) {
    const schluessel = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, schluessel, bytes * 8);
    return new Uint8Array(bits);
}

/** Öffentlicher P-256-Punkt (65 Byte, unkomprimiert) als JWK-Teile. */
function punktZuJwk(punkt) {
    if (punkt.length !== 65 || punkt[0] !== 4) throw new Error('P-256-Schlüssel muss 65 Byte unkomprimiert sein');
    return { kty: 'EC', crv: 'P-256', x: b64u(punkt.slice(1, 33)), y: b64u(punkt.slice(33, 65)) };
}

// ── Schlüssel ───────────────────────────────────────────────────────────

/**
 * Ein neues VAPID-Schlüsselpaar. Der öffentliche Teil geht an jeden Browser,
 * der Mitteilungen abonniert; der private bleibt im Supabase Vault.
 * @returns {Promise<{oeffentlich: string, privatJwk: string}>}
 */
export async function vapidSchluesselErzeugen() {
    const paar = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const roh = new Uint8Array(await crypto.subtle.exportKey('raw', paar.publicKey));
    const jwk = await crypto.subtle.exportKey('jwk', paar.privateKey);
    return { oeffentlich: b64u(roh), privatJwk: JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y, d: jwk.d }) };
}

// ── VAPID (RFC 8292) ────────────────────────────────────────────────────

/**
 * Der Authorization-Kopf, mit dem sich der Absender beim Push-Dienst ausweist.
 *
 * aud ist der Ursprung des Push-Dienstes, nicht die ganze Adresse. exp liegt
 * zwölf Stunden in der Zukunft; mehr als 24 lehnt jeder Dienst ab.
 *
 * @param {string} endpunkt  Adresse aus dem Abo
 * @param {{oeffentlich: string, privatJwk: string}} vapid
 * @param {string} kontakt   mailto:… oder https://… – Apple verlangt es
 * @param {number} [jetzt]   Sekunden seit 1970, für Tests
 */
export async function vapidKopf(endpunkt, vapid, kontakt, jetzt = Math.floor(Date.now() / 1000)) {
    const kopf = b64u(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
    const inhalt = b64u(te.encode(JSON.stringify({
        aud: new URL(endpunkt).origin,
        exp: jetzt + 12 * 3600,
        sub: kontakt,
    })));
    const schluessel = await crypto.subtle.importKey('jwk', JSON.parse(vapid.privatJwk),
        { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    // WebCrypto liefert die Signatur bereits als r‖s mit je 32 Byte – genau
    // das Format, das ES256 in einem JWT verlangt. Kein DER-Umbau nötig.
    const signatur = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, schluessel,
        te.encode(`${kopf}.${inhalt}`));
    return `vapid t=${kopf}.${inhalt}.${b64u(signatur)}, k=${vapid.oeffentlich}`;
}

// ── Verschlüsselung (RFC 8291, aes128gcm nach RFC 8188) ─────────────────

/**
 * Verschlüsselt eine Nachricht für ein Abo. Nur der Browser, der das Abo
 * angelegt hat, kann sie lesen – der Push-Dienst von Apple oder Google sieht
 * nichts als Bytes.
 *
 * @param {Uint8Array} nachricht
 * @param {{p256dh: string, auth: string}} abo  die Schlüssel aus dem Abo
 * @param {object} [fest]  nur für den Test gegen RFC 8291: salt und
 *                         Serverschlüssel vorgeben, sonst zufällig
 * @returns {Promise<Uint8Array>} der fertige Rumpf der Anfrage
 */
export async function verschluesseln(nachricht, abo, fest = {}) {
    const uaOeffentlich = vonB64u(abo.p256dh);
    const authGeheimnis = vonB64u(abo.auth);
    if (authGeheimnis.length !== 16) throw new Error('auth muss 16 Byte lang sein');

    // Ein Schlüsselpaar nur für diese eine Nachricht.
    let asPrivat, asOeffentlich;
    if (fest.asPrivat) {
        asOeffentlich = vonB64u(fest.asOeffentlich);
        asPrivat = await crypto.subtle.importKey('jwk',
            { ...punktZuJwk(asOeffentlich), d: fest.asPrivat },
            { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    } else {
        const paar = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
        asPrivat = paar.privateKey;
        asOeffentlich = new Uint8Array(await crypto.subtle.exportKey('raw', paar.publicKey));
    }
    const salt = fest.salt ? vonB64u(fest.salt) : crypto.getRandomValues(new Uint8Array(16));

    const uaSchluessel = await crypto.subtle.importKey('raw', uaOeffentlich,
        { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaSchluessel }, asPrivat, 256));

    // RFC 8291, 3.4: aus dem gemeinsamen Geheimnis und auth das IKM …
    const schluesselInfo = verbinde(te.encode('WebPush: info\0'), uaOeffentlich, asOeffentlich);
    const ikm = await hkdf(authGeheimnis, ecdh, schluesselInfo, 32);
    // … und daraus nach RFC 8188 Inhaltsschlüssel und Nonce.
    const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
    const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);

    // Ein einziger Datensatz: Nachricht plus Trennzeichen 0x02 ("letzter").
    const klartext = verbinde(nachricht, new Uint8Array([2]));
    const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
    const geheim = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, klartext));

    // Kopf: salt (16) ‖ Datensatzgröße (4, 4096) ‖ Länge der Kennung (1) ‖ Kennung = asOeffentlich (65)
    const kopf = new Uint8Array(16 + 4 + 1 + asOeffentlich.length);
    kopf.set(salt, 0);
    new DataView(kopf.buffer).setUint32(16, 4096);
    kopf[20] = asOeffentlich.length;
    kopf.set(asOeffentlich, 21);

    return verbinde(kopf, geheim);
}

// ── Versand ─────────────────────────────────────────────────────────────

// Nur an diese Push-Dienste wird geschickt. Die Adresse eines Abos kommt vom
// Browser und landet über die App in der Datenbank – ohne diese Liste ließe
// sich die Funktion benutzen, um beliebige Adressen im Netz anzurufen.
export const PUSH_DIENSTE = /^https:\/\/(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.apple\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*notify\.windows\.com)\//;

/**
 * Schickt eine Nachricht an ein Abo.
 * @returns {Promise<number>} HTTP-Status des Push-Dienstes. 404 und 410
 *   heißen: das Abo gibt es nicht mehr, es kann weg.
 */
export async function senden(abo, nachricht, vapid, kontakt, holen = fetch) {
    if (!PUSH_DIENSTE.test(abo.endpoint)) throw new Error(`kein bekannter Push-Dienst: ${abo.endpoint}`);
    const rumpf = await verschluesseln(te.encode(JSON.stringify(nachricht)), abo);
    const antwort = await holen(abo.endpoint, {
        method: 'POST',
        headers: {
            Authorization: await vapidKopf(abo.endpoint, vapid, kontakt),
            'Content-Encoding': 'aes128gcm',
            'Content-Type': 'application/octet-stream',
            // Einen Tag lang zustellen, wenn das Gerät gerade aus ist.
            TTL: '86400',
            Urgency: 'normal',
        },
        body: rumpf,
    });
    return antwort.status;
}
