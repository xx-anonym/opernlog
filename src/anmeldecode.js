// Der Einmalcode zur Anmeldung – was sich die Anmeldeseite dazu merkt.
//
// OpernLog kennt kein Passwort (seit 10.11.2026): wer sich anmeldet oder
// registriert, bekommt einen Code per E-Mail und tippt ihn ein. Dafür
// verlässt man die App und kommt aus dem Mailprogramm zurück. Am iPhone lädt
// die installierte App dabei oft neu – ohne Merker stünde wieder das leere
// Formular da, und der eben verschickte Code hätte kein Feld mehr. Deshalb
// steht hier, an welche Adresse zuletzt ein Code ging.
//
// Nur die Adresse, die Zeit und – beim Registrieren – der gewünschte Name
// samt Profilbild, auf diesem Gerät, höchstens eine Stunde.

export const CODE_OFFEN = 'opernlog:codeOffen';

// So lange gilt ein Code bei Supabase höchstens (Authentication → Email →
// "Email OTP Expiration"); danach hat das Feld keinen Sinn mehr.
export const GUELTIG_MS = 60 * 60 * 1000;

// Supabase verschickt je Adresse höchstens einen Code pro Minute.
export const NEU_SENDEN_NACH_MS = 60 * 1000;

// So viele Ziffern hat ein Code. Im Supabase-Dashboard eingestellt
// (Authentication → Sign In / Providers → Email → "Email OTP Length"), von
// Jonas am 10.11.2026 auf 6 gesetzt. Die Zahl lässt sich von außen nicht
// auslesen: wer sie dort ändert, muss sie auch hier ändern – sonst schickt
// die Seite den Code zu früh ab oder nimmt ihn nie an.
export const CODE_LAENGE = 6;

/** Nur die Ziffern, höchstens zehn – Leerzeichen und Striche aus der Mail fallen weg. */
export function codeLesen(text) {
    return String(text || '').replace(/\D/g, '').slice(0, 10);
}

/** Genau so viele Ziffern, wie ein Code hat. */
export function codeVollstaendig(text) {
    return codeLesen(text).length === CODE_LAENGE;
}

/** Name und Bild einer Registrierung, auf das Nötige gestutzt – oder null. */
function neuLesen(neu) {
    if (!neu || typeof neu !== 'object') return null;
    return { username: String(neu.username || '').slice(0, 60), avatarIcon: String(neu.avatarIcon || '').slice(0, 40) };
}

/**
 * Merken, dass an diese Adresse ein Code unterwegs ist.
 * @param {string} email
 * @param {object} [o]
 * @param {{username: string, avatarIcon?: string}|null} [o.neu]  beim Registrieren: Name und Bild
 */
export function codeOffenMerken(email, { neu = null, umgebung = globalThis, jetzt = Date.now() } = {}) {
    try {
        umgebung.localStorage?.setItem(CODE_OFFEN, JSON.stringify({ email, neu: neuLesen(neu), seit: jetzt }));
    } catch {
        // Ohne Speicher geht es auch – nur nicht über ein Neuladen hinweg.
    }
}

/** An welche Adresse zuletzt ein Code ging, solange er noch gelten kann – sonst null. */
export function codeOffen({ umgebung = globalThis, jetzt = Date.now() } = {}) {
    try {
        const d = JSON.parse(umgebung.localStorage?.getItem(CODE_OFFEN) || 'null');
        if (!d || typeof d.email !== 'string' || !d.email || !Number.isFinite(d.seit)) return null;
        if (jetzt < d.seit || jetzt - d.seit > GUELTIG_MS) return null;
        return { email: d.email, neu: neuLesen(d.neu), seit: d.seit };
    } catch {
        return null;
    }
}

/** Eingelöst oder verworfen. */
export function codeOffenVergessen(umgebung = globalThis) {
    try {
        umgebung.localStorage?.removeItem(CODE_OFFEN);
    } catch {
        // siehe oben
    }
}
