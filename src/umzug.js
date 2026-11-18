// Der Umzug von opernlog.vercel.app nach opernlog.de.
//
// Er soll fast unsichtbar sein (Jonas, 15.11.2026): Freunde sollen nichts
// tun müssen. Unter der alten Adresse schickt die App deshalb jeden zur
// neuen weiter, und wer angemeldet ist, bleibt es dabei:
//
//   1. Ohne Netz geloggte Abende gehen vorher hoch – sie liegen nur im
//      Speicher der alten Adresse und wären danach unerreichbar.
//   2. Die Edge Function umzug stellt einen Einmal-Code für das eigene Konto
//      aus (supabase/functions/umzug/index.ts).
//   3. Die App öffnet opernlog.de/#/umzug?code=…&weiter=…; dort löst sie den
//      Code ein (umzugEinloesen, aus main.js beim Start) und springt dahin,
//      wo man unter der alten Adresse war.
//
// Push-Mitteilungen gehören ebenfalls zur Adresse. Waren sie unter der alten
// an, wird das Abo dort vor dem Wechsel entfernt (sonst kämen später alle
// doppelt), und die Übergabe trägt push=1. Unter der neuen Adresse kommt dann
// die Frage nach Mitteilungen noch einmal – mit einem Tippen sind sie wieder
// an (UMZUG_MITTEILUNGEN, gelesen in main.js).
//
// Wer die App auf dem Home-Bildschirm hat, kann nicht einfach weitergeleitet
// werden: das Fenster der installierten App gehört zur alten Adresse, eine
// fremde öffnet darin nur ein Browserblatt. Dort zeigt die App stattdessen
// einen Hinweis mit Knopf, der opernlog.de im Browser öffnet, und bittet, die
// App von dort neu hinzuzufügen. Ohne Code: eine neu hinzugefügte App hat am
// iPhone ihren eigenen Speicher, die Anmeldung aus Safari käme nicht mit.
// Angemeldet wird dort einmal neu.
//
// Eingelöst wird ein Code nur, wenn die Seite wirklich von der alten Adresse
// kam (document.referrer; vercel.json schickt den Ursprung mit). Sonst
// könnte jemand einen Link mit dem Code seines eigenen Kontos verschicken,
// und wer ihn antippt, wäre unbemerkt in fremdem Konto angemeldet und
// loggte seine Abende dort.
//
// Umgeschaltet am 18.11.2026 (vorher false: unter der alten Adresse geschah
// nichts). Wieder auf false, falls die Übergabe klemmt – dann bleibt jeder,
// wo er ist.

export const UMZUG_AKTIV = true;

export const NEUE_ADRESSE = 'https://opernlog.de';

/** Merker unter der neuen Adresse: nach dem Umzug nach Mitteilungen fragen. */
export const UMZUG_MITTEILUNGEN = 'opernlog:umzugMitteilungen';
export const ALTE_HOSTS = ['opernlog.vercel.app'];

/** Läuft die App gerade unter der alten Adresse? */
export function istAlteAdresse(umgebung = globalThis) {
    return ALTE_HOSTS.includes(umgebung.location?.hostname);
}

/**
 * Was beim Start unter der alten Adresse zu tun ist.
 * @returns {'nichts'|'hinweis'|'mitAnmeldung'|'weiter'}
 *   hinweis       installierte App: Hinweis mit Knopf statt Weiterleitung
 *   mitAnmeldung  angemeldet: Code holen, dann weiter
 *   weiter        nicht angemeldet: einfach weiter, an dieselbe Stelle
 */
export function umzugSchritt({ aktiv = UMZUG_AKTIV, alteAdresse, installiert, angemeldet }) {
    if (!aktiv || !alteAdresse) return 'nichts';
    if (installiert) return 'hinweis';
    return angemeldet ? 'mitAnmeldung' : 'weiter';
}

/**
 * Die Adresse unter opernlog.de. Ohne Code dieselbe Stelle (#/…); mit Code
 * erst #/umzug, das den Code einlöst und dann dorthin weiterspringt.
 * Der Code steht im #-Teil: der geht an keinen Server.
 */
export function umzugZiel({ hash = '', code = null, push = false } = {}) {
    const stelle = /^#\//.test(hash) && !/^#\/umzug\b/.test(hash) ? hash : '#/';
    if (!code) return `${NEUE_ADRESSE}/${stelle}`;
    const p = new URLSearchParams({ code, weiter: stelle });
    if (push) p.set('push', '1');
    return `${NEUE_ADRESSE}/#/umzug?${p}`;
}

/**
 * Liest #/umzug?code=…&weiter=… – oder null, wenn die Adresse keine Übergabe
 * ist. weiter ist nur eine Stelle in der App (#/…), nie eine fremde Adresse.
 */
export function umzugAusHash(hash = '') {
    const m = /^#\/umzug\?(.*)$/.exec(hash);
    if (!m) return null;
    const p = new URLSearchParams(m[1]);
    const code = p.get('code') || '';
    if (!/^[A-Za-z0-9_-]{8,200}$/.test(code)) return null;
    const weiter = p.get('weiter') || '#/';
    return {
        code,
        weiter: /^#\/(?!umzug\b)[^\s]*$/.test(weiter) ? weiter : '#/',
        push: p.get('push') === '1',
    };
}

/** Kam die Seite von der alten Adresse? (document.referrer, nur der Ursprung) */
export function vonAlterAdresse(referrer = '') {
    try {
        const r = new URL(referrer);
        return r.protocol === 'https:' && ALTE_HOSTS.includes(r.hostname);
    } catch {
        return false;
    }
}

/**
 * Unter der neuen Adresse: einen mitgebrachten Code einlösen. Danach steht
 * die Adresse auf der Stelle, an der man unter der alten war – auch wenn das
 * Einlösen scheitert (dann eben abgemeldet, mit dem Anmeldeformular).
 * Ersetzt den Verlaufseintrag, damit "Zurück" nicht noch einmal einlöst.
 *
 * @param {object} o
 * @param {(code: string) => Promise<void>} o.einloesen  verifyOtp mit token_hash
 * @returns {Promise<boolean>} ob die Anmeldung übernommen wurde
 */
export async function umzugEinloesen({ umgebung = globalThis, einloesen }) {
    const uebergabe = umzugAusHash(umgebung.location?.hash);
    if (!uebergabe) return false;
    umgebung.history.replaceState(null, '', uebergabe.weiter);
    if (!vonAlterAdresse(umgebung.document?.referrer)) {
        console.warn('[Umzug] Code nicht von der alten Adresse – nicht eingelöst');
        return false;
    }
    try {
        await einloesen(uebergabe.code);
        if (uebergabe.push) {
            try { umgebung.localStorage?.setItem(UMZUG_MITTEILUNGEN, '1'); } catch { /* dann ohne Frage */ }
        }
        return true;
    } catch (e) {
        console.warn('[Umzug] Anmeldung nicht übernommen', e);
        return false;
    }
}
