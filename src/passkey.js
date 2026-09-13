// Passkeys: was der Browser kann und was eine Fehlermeldung dem Nutzer sagt.
//
// Die Aufrufe selbst stehen in store/supabase.js, die Oberfläche in
// pages/Auth.js und components/Passkeys.js. Hier steht nur, was beide Stellen
// gleich beantworten müssen – sonst zeigt die Anmeldeseite einen Knopf, den
// das Profil für unmöglich hält, oder umgekehrt.

/**
 * Kann dieser Browser überhaupt Passkeys? Ohne WebAuthn gibt es keinen Knopf,
 * statt eines Knopfs, der erst beim Drücken "geht nicht" sagt.
 */
export function passkeysMoeglich(umgebung = globalThis) {
    return typeof umgebung.PublicKeyCredential === 'function'
        && typeof umgebung.navigator?.credentials?.get === 'function'
        && typeof umgebung.navigator?.credentials?.create === 'function';
}

/**
 * Der Satz, den der Nutzer zu einem gescheiterten Passkey-Vorgang liest.
 *
 * null heißt: nichts anzeigen. So endet ein Abbruch – wer im Dialog des
 * Systems auf "Abbrechen" tippt, weiß, dass er abgebrochen hat. Eine rote
 * Meldung darauf läse sich wie ein Fehler der App.
 *
 * Browser melden den Abbruch als NotAllowedError, und zwar auch dann, wenn
 * die Zeit abläuft oder auf dem Gerät gar kein Passkey liegt. Unterscheiden
 * lässt sich das von außen nicht; deshalb auch dort keine Meldung, sondern der
 * Hinweis unter dem Knopf, wo man einen Passkey anlegt.
 *
 * @param {Error & {code?: string, cause?: Error}} fehler
 * @param {'anmelden'|'anlegen'} vorgang
 * @returns {string|null}
 */
export function passkeyFehlertext(fehler, vorgang = 'anmelden') {
    const code = fehler?.code || '';
    const ursache = fehler?.cause?.name || fehler?.name || '';

    if (ursache === 'NotAllowedError' || ursache === 'AbortError' || code === 'ERROR_CEREMONY_ABORTED') {
        return null;
    }

    switch (code) {
        case 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED':
        case 'webauthn_credential_exists':
            return 'Auf diesem Gerät liegt schon ein Passkey für dein Konto.';
        case 'too_many_passkeys':
            return 'Du hast schon die größtmögliche Zahl an Passkeys. Lösche zuerst einen alten.';
        case 'webauthn_credential_not_found':
            return 'Diesen Passkey kennt OpernLog nicht mehr. Melde dich mit E-Mail und Passwort an und lege im Profil einen neuen an.';
        case 'webauthn_challenge_expired':
        case 'webauthn_challenge_not_found':
            return 'Das hat zu lange gedauert. Bitte versuch es noch einmal.';
        case 'passkey_disabled':
            return 'Passkeys sind gerade abgeschaltet. Melde dich mit E-Mail und Passwort an.';
        case 'email_not_confirmed':
            return 'Bitte bestätige zuerst deine E-Mail-Adresse.';
        case 'user_banned':
            return 'Dieses Konto ist gesperrt.';
        case 'ERROR_INVALID_DOMAIN':
        case 'ERROR_INVALID_RP_ID':
            return 'Passkeys funktionieren nur unter opernlog.vercel.app.';
    }

    if (/does not support WebAuthn/i.test(fehler?.message || '')) {
        return 'Dieser Browser kann keine Passkeys.';
    }

    return vorgang === 'anlegen'
        ? 'Der Passkey ließ sich nicht anlegen. Bitte versuch es noch einmal.'
        : 'Die Anmeldung mit Passkey hat nicht geklappt. Bitte versuch es noch einmal.';
}

const MONATE = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

function datum(wert) {
    const d = new Date(wert);
    return Number.isNaN(d.getTime()) ? '' : `${d.getDate()}. ${MONATE[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Eine Zeile der Passkey-Liste im Profil.
 *
 * Supabase leitet den Namen aus dem Authenticator ab ("iCloud-Schlüsselbund",
 * "Google Password Manager"). Fehlt er, bleibt "Passkey" – eine leere Zeile
 * mit Löschknopf ließe offen, was man da löscht.
 */
export function passkeyZeile(passkey = {}) {
    const angelegt = datum(passkey.created_at);
    const benutzt = passkey.last_used_at ? datum(passkey.last_used_at) : '';
    return {
        name: String(passkey.friendly_name || '').trim() || 'Passkey',
        unterzeile: [
            angelegt && `angelegt am ${angelegt}`,
            benutzt ? `zuletzt benutzt am ${benutzt}` : 'noch nie benutzt',
        ].filter(Boolean).join(' · '),
    };
}
