// Google-Anmeldung auf opernlog.de selbst (Jonas, 20.11.2026).
//
// Der alte Weg (signInWithOAuth) schickt zu Googles Anmeldeseite, und die
// sagt "In gqdblqymteclmdlushox.supabase.co anmelden" – die Adresse, an die
// Google zurückleitet. Für Fremde klingt das nach Phishing. Den Namen
// "OpernLog" zeigte Google erst nach einer Markenprüfung, und die verlangt,
// dass alle beteiligten Domains uns gehören; supabase.co gehört uns nicht.
//
// Hier zeichnet Google seinen eigenen Knopf (Google Identity Services) und
// öffnet beim Tippen ein kleines Fenster "In opernlog.de anmelden". Heraus
// kommt ein ID-Token, das Supabase per signInWithIdToken annimmt. Eine eigene
// Gestaltung des Knopfs erlaubt Google dafür nicht; gewählt: hell, rund
// (Jonas, 20.11.2026).
//
// Damit Google den Knopf an opernlog.de zulässt, steht die Adresse in der
// Google Cloud Console unter "Autorisierte JavaScript-Quellen" des
// OAuth-Clients. Die Nonce schützt davor, dass ein abgefangenes Token ein
// zweites Mal eingelöst wird: Google bekommt ihren SHA-256, Supabase die
// Nonce selbst und vergleicht.
//
// Der alte Knopf bleibt als Rückfall stehen und wird erst ersetzt, wenn
// Googles Knopf wirklich da ist – ohne Netz, mit Werbeblocker oder in der
// iPhone-App vom Home-Bildschirm (dort sperrt iOS das Fenster oft) gilt
// weiter der alte Weg.

export const GOOGLE_CLIENT_ID = '756834185649-k8pe270rs7bg6ja5fupq1afg84ms8s89.apps.googleusercontent.com';
const SKRIPT = 'https://accounts.google.com/gsi/client';

/** Ob Googles Knopf hier taugt. Auf dem iPhone-Home-Bildschirm nicht. */
export function googleKnopfMoeglich(nav = navigator) {
    return nav.standalone !== true;
}

let laden = null;

/** Lädt Googles Skript einmal; null, wenn es nicht kommt. */
export function gisLaden({ zeit = 8000 } = {}) {
    if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
    if (!laden) {
        laden = new Promise((fertig) => {
            const s = document.createElement('script');
            s.src = SKRIPT;
            s.async = true;
            const aus = () => { laden = null; fertig(null); };
            const uhr = setTimeout(aus, zeit);
            s.onload = () => { clearTimeout(uhr); fertig(window.google?.accounts?.id ?? null); };
            s.onerror = () => { clearTimeout(uhr); s.remove(); aus(); };
            document.head.append(s);
        });
    }
    return laden;
}

const hex = (puffer) => [...new Uint8Array(puffer)].map(b => b.toString(16).padStart(2, '0')).join('');

/** Eine frische Nonce und ihr SHA-256 (hex) für Google. */
export async function nonceErzeugen() {
    const roh = hex(crypto.getRandomValues(new Uint8Array(32)));
    const hash = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(roh)));
    return { roh, hash };
}

/**
 * Setzt Googles Knopf in ziel. Gibt true zurück, wenn er steht.
 * anmelden(token, nonce) löst das Token bei Supabase ein; fehler(err) meldet.
 */
export async function googleKnopfEinsetzen(ziel, { anmelden, fehler, breite = 320 }) {
    if (!googleKnopfMoeglich()) return false;
    const gis = await gisLaden();
    if (!gis || !ziel.isConnected) return false;

    const zeichnen = async () => {
        const { roh, hash } = await nonceErzeugen();
        gis.initialize({
            client_id: GOOGLE_CLIENT_ID,
            nonce: hash,
            ux_mode: 'popup',
            auto_select: false,
            itp_support: true,
            callback: async (antwort) => {
                try { await anmelden(antwort.credential, roh); }
                catch (err) { fehler(err); }
                // Jede Nonce nur einmal: für den nächsten Versuch eine neue.
                finally { if (ziel.isConnected) zeichnen(); }
            },
        });
        ziel.replaceChildren();
        gis.renderButton(ziel, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            shape: 'pill',
            text: 'signin_with',
            logo_alignment: 'center',
            locale: 'de',
            width: Math.max(200, Math.min(400, Math.round(breite))),
        });
    };
    await zeichnen();
    return true;
}
