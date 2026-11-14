// Eine Einladung, die noch auf ihr Konto wartet.
//
// Wer einen Einladungslink (#/invite/CODE) öffnet und noch nicht angemeldet
// ist, muss sich erst anmelden oder registrieren. Angenommen wurde die
// Einladung bisher nur, wenn das auf genau dieser Seite zu Ende ging. Kam
// man woanders an, war der Code weg, und Einladender und Eingeladener waren
// nicht befreundet. So geschehen am 26.10. und 2.11.2026 (Jonas): beide
// registrierten sich per E-Mail, und der Bestätigungslink aus der Mail
// führte auf die Startseite. Bei Google ist es genauso – die Anmeldung
// kehrt auf die Startseite zurück –, und am iPhone lädt die installierte
// App beim Zurückkommen aus der Mail oft neu.
//
// Deshalb merkt sich das Gerät den Code, bis die Einladung angenommen ist
// (main.js, vielleichtEinladungEinloesen). Höchstens 30 Tage – so lange gilt
// ein Link.

export const EINLADUNG_OFFEN = 'opernlog:einladung';
export const EINLADUNG_TAGE = 30;

const CODE = /^[A-Z0-9]{4,16}$/;

/** Ein Code, wie er im Link steht, in der Form der Datenbank – oder ''. */
export function einladungsCode(text) {
    const code = String(text || '').trim().toUpperCase();
    return CODE.test(code) ? code : '';
}

/** Merken, dass dieser Code auf ein Konto wartet. */
export function einladungMerken(code, { umgebung = globalThis, jetzt = Date.now() } = {}) {
    const c = einladungsCode(code);
    if (!c) return;
    try {
        umgebung.localStorage?.setItem(EINLADUNG_OFFEN, JSON.stringify({ code: c, seit: jetzt }));
    } catch {
        // Ohne Speicher geht es nur auf der Einladungsseite selbst – wie früher.
    }
}

/** Der wartende Code, solange er gelten kann – sonst ''. */
export function offeneEinladung({ umgebung = globalThis, jetzt = Date.now() } = {}) {
    try {
        const d = JSON.parse(umgebung.localStorage?.getItem(EINLADUNG_OFFEN) || 'null');
        const c = einladungsCode(d?.code);
        if (!c || !Number.isFinite(d.seit) || jetzt < d.seit || jetzt - d.seit > EINLADUNG_TAGE * 864e5) return '';
        return c;
    } catch {
        return '';
    }
}

/** Angenommen oder endgültig gescheitert. */
export function einladungVergessen(umgebung = globalThis) {
    try {
        umgebung.localStorage?.removeItem(EINLADUNG_OFFEN);
    } catch {
        // siehe oben
    }
}

/**
 * Ob ein Fehler beim Annehmen endgültig ist – dann bringt ein späterer
 * Versuch nichts, und der Code wird vergessen. Die Meldungen stammen aus der
 * Datenbankfunktion accept_invite. Alles andere (kein Netz, Server weg)
 * bleibt für den nächsten Start stehen.
 */
export function endgueltigGescheitert(fehlertext) {
    return /ungültig|abgelaufen|eigenen einladungslink/i.test(String(fehlertext || ''));
}
