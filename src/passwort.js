// Passwortprüfung für Registrierung und Passwortwechsel.
//
// Vorher stand als einzige Hürde ein minlength="6" an vier Eingabefeldern. Das
// ist Formularschmuck: der Browser prüft es beim Absenden des Formulars, sonst
// niemand. Wer die Seite umgeht, konnte "1" als Passwort setzen.
//
// Hier stehen zwei Prüfungen. Die erste läuft im Gerät und braucht kein Netz.
// Die zweite fragt, ob das Passwort in einem bekannten Datenleck steht, und
// geht dafür über supabase/functions/passwort-pruefen – siehe dort, warum
// nicht geradewegs zu HaveIBeenPwned.
//
// Was hier bewusst NICHT geprüft wird: ob Großbuchstabe, Ziffer und Sonder-
// zeichen vorkommen. Solche Regeln erzeugen "Passwort1!" und stehen seit
// NIST SP 800-63B ausdrücklich nicht mehr in der Empfehlung. Was hilft, ist
// Länge und ein Abgleich gegen das, was ohnehin schon geleakt ist. Genau die
// zwei Dinge macht diese Datei.

import { getSupabase } from './store/supabase.js';

// Acht Zeichen ist die Untergrenze, unterhalb derer auch Supabase' eigene
// Dokumentation abrät. Höher zu gehen klingt sicherer, verschiebt die Leute
// aber zu Mustern, die eine Leak-Liste ohnehin kennt.
export const MINDESTLAENGE = 8;

// bcrypt liest nur die ersten 72 Byte. Alles danach ist wirkungslos – ein
// langer Merksatz wäre also stillschweigend gekürzt, und der Nutzer hielte
// sich für besser geschützt, als er ist. Deshalb lieber sagen.
export const HOECHSTLAENGE_BYTE = 72;

/**
 * Was an einem Passwort auszusetzen ist, ohne Netz und ohne Dritte.
 * Leeres Feld heißt: nichts auszusetzen.
 */
export function passwortMaengel(passwort, { email = '', benutzername = '' } = {}) {
    const p = String(passwort ?? '');
    const maengel = [];

    if (p.length < MINDESTLAENGE) {
        maengel.push(`Mindestens ${MINDESTLAENGE} Zeichen, du hast ${p.length}.`);
    }

    // Nach Byte zählen, nicht nach Zeichen: ein Umlaut belegt zwei, ein Emoji
    // vier. Bei .length käme man erst bei 72 Zeichen ins Stutzen, bcrypt aber
    // schon viel früher.
    if (new TextEncoder().encode(p).length > HOECHSTLAENGE_BYTE) {
        maengel.push(`Höchstens ${HOECHSTLAENGE_BYTE} Byte – was darüber steht, zählt nicht mehr mit.`);
    }

    // Der eigene Name und die eigene Adresse sind das Erste, was jemand
    // ausprobiert, der einen kennt.
    const klein = p.toLowerCase();
    for (const teil of [benutzername, String(email).split('@')[0]]) {
        const t = String(teil ?? '').toLowerCase().trim();
        if (t.length >= 3 && klein.includes(t)) {
            maengel.push('Dein Name oder deine E-Mail-Adresse darf nicht im Passwort stehen.');
            break;
        }
    }

    return maengel;
}

/** SHA-1 als Hexkette in Großschreibung – die Form, die HaveIBeenPwned führt. */
export async function sha1Hex(text) {
    const roh = new TextEncoder().encode(text);
    const hash = await crypto.subtle.digest('SHA-1', roh);
    return [...new Uint8Array(hash)]
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
}

/** Standardweg zur Liste: über die eigene Edge Function, nicht über Dritte. */
async function ueberSupabase(praefix) {
    const sb = getSupabase();
    if (!sb) throw new Error('kein Supabase-Client');
    const { data, error } = await sb.functions.invoke('passwort-pruefen', {
        body: { praefix },
    });
    if (error) throw error;
    return String(data ?? '');
}

/**
 * Steht das Passwort in einem bekannten Datenleck?
 *
 * `geprueft: false` heißt: es ließ sich nicht feststellen. Dann gilt das
 * Passwort als in Ordnung. Das ist Absicht – wer sich anmelden will, soll
 * nicht daran scheitern, dass ein fremder Dienst gerade nicht antwortet.
 * Die erste Prüfung oben greift ja weiterhin.
 *
 * @param holePraefix nur für Tests: liefert die Liste zu einem Präfix.
 */
export async function istGeleakt(passwort, holePraefix = ueberSupabase) {
    const p = String(passwort ?? '');
    if (!p) return { geprueft: false, geleakt: false, anzahl: 0 };

    try {
        const hash = await sha1Hex(p);
        const liste = await holePraefix(hash.slice(0, 5));
        const gesucht = hash.slice(5);

        for (const zeile of liste.split('\n')) {
            const [suffix, zaehler] = zeile.trim().split(':');
            if (suffix === gesucht) {
                // Die Polsterung der Antwort füllt mit Zähler 0 auf. Ein
                // Treffer mit 0 ist also keiner.
                const anzahl = Number(zaehler) || 0;
                return { geprueft: true, geleakt: anzahl > 0, anzahl };
            }
        }
        return { geprueft: true, geleakt: false, anzahl: 0 };
    } catch (e) {
        console.warn('[Passwort] Leak-Abgleich nicht möglich:', e?.message ?? e);
        return { geprueft: false, geleakt: false, anzahl: 0 };
    }
}

/**
 * Beide Prüfungen zusammen, als fertiger Satz für die Oberfläche.
 * Gibt null zurück, wenn nichts zu beanstanden ist.
 */
export async function passwortEinwand(passwort, angaben = {}, holePraefix) {
    const maengel = passwortMaengel(passwort, angaben);
    if (maengel.length) return maengel.join(' ');

    const leak = await istGeleakt(passwort, holePraefix);
    if (leak.geleakt) {
        return 'Dieses Passwort steht in einer bekannten Liste geleakter Passwörter'
            + ` (${leak.anzahl.toLocaleString('de-DE')}-mal). Bitte wähle ein anderes.`;
    }
    return null;
}
