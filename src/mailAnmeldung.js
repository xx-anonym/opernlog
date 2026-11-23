// Angemeldet per Knopf in der Mail (seit 23.11.2026).
//
// Die Mails zur Freundschaftsanfrage und zum Saisonrückblick (Edge Function
// mail-senden) tragen im Knopf einen Einmal-Code für das Konto, an das sie
// gehen: opernlog.de/#/mail?code=…&weiter=#/season. Wer darauf tippt und auf
// dem Gerät noch nicht angemeldet ist, ist es danach – ohne Code abtippen.
// Jonas, 23.11.2026: "es wäre toll, wenn man bei klick auf den button in der
// mail direkt angemeldet wäre".
//
// Derselbe Weg wie beim Umzug (src/umzug.js): ein token_hash aus
// generate_link, eingelöst mit verifyOtp. Er gilt einmal und so lange wie ein
// Anmeldecode (OTP-Ablauf im Supabase-Dashboard, Standard eine Stunde). Ist
// er abgelaufen, öffnet der Knopf die App wie vorher, nur ohne Anmeldung.
//
// Vorsichtsmaßnahmen:
//   - Der Code steht im #-Teil. Der geht an keinen Server und steht in keinem
//     Protokoll, und Mailprogramme, die Links zur Prüfung selbst aufrufen,
//     lösen ihn nicht ein – das täte erst das Skript der Seite.
//   - Wer auf dem Gerät schon angemeldet ist, bleibt es, auch in einem
//     anderen Konto. Ein Link wechselt nie das Konto. Sonst könnte jemand
//     einen Link mit dem Code seines eigenen Kontos weitergeben, und wer ihn
//     antippt, loggte seine Abende unbemerkt dort.
//   - Nach dem Einlösen sagt ein Hinweis, als wer man angemeldet ist, mit
//     "Abmelden" daneben – für den Fall, dass die Mail nicht die eigene war.
//   - Der Code verschwindet sofort aus der Adresse und dem Verlauf.
//
// Bekannte Grenze: Am iPhone öffnet ein Link aus Mail immer Safari, nicht die
// App auf dem Home-Bildschirm, und die beiden haben getrennten Speicher.
// Angemeldet ist man dann in Safari. Das lässt sich von hier aus nicht ändern.

export const MAIL_STELLE = '#/mail';

/**
 * Liest #/mail?code=…&weiter=… – oder null, wenn die Adresse keiner ist.
 * weiter ist nur eine Stelle in der App (#/…), nie eine fremde Adresse.
 */
export function mailLinkAusHash(hash = '') {
    const m = /^#\/mail\?(.*)$/.exec(hash);
    if (!m) return null;
    const p = new URLSearchParams(m[1]);
    const code = p.get('code') || '';
    const weiter = p.get('weiter') || '#/';
    return {
        // Ein unbrauchbarer Code wird gar nicht erst versucht.
        code: /^[A-Za-z0-9_-]{8,200}$/.test(code) ? code : null,
        weiter: /^#\/(?!mail\b|umzug\b)[^\s]*$/.test(weiter) ? weiter : '#/',
    };
}

/**
 * Beim Start: einen Code aus der Mail einlösen. Die Adresse steht danach in
 * jedem Fall auf der Stelle, zu der der Knopf führen sollte.
 *
 * @param {object} o
 * @param {() => Promise<boolean>} o.angemeldet  ist auf dem Gerät schon jemand angemeldet?
 * @param {(code: string) => Promise<void>} o.einloesen  verifyOtp mit token_hash
 * @returns {Promise<'kein'|'schon'|'angemeldet'|'abgelaufen'>}
 *   kein        die Adresse war kein Link aus einer Mail (oder ohne Code)
 *   schon       es war schon jemand angemeldet; der Code bleibt ungenutzt
 *   angemeldet  eingelöst
 *   abgelaufen  Einlösen gescheitert (abgelaufen, schon benutzt, kein Netz)
 */
export async function mailLinkEinloesen({ umgebung = globalThis, angemeldet, einloesen }) {
    const link = mailLinkAusHash(umgebung.location?.hash);
    if (!link) return 'kein';
    // Zuerst aufräumen: "Zurück" soll nicht noch einmal einlösen, und der
    // Code soll nirgends stehen bleiben, auch wenn unten etwas scheitert.
    umgebung.history.replaceState(null, '', link.weiter);
    if (!link.code) return 'kein';
    try {
        if (await angemeldet()) return 'schon';
    } catch {
        // Unklar, ob jemand angemeldet ist: lieber nichts tun.
        return 'schon';
    }
    try {
        await einloesen(link.code);
        return 'angemeldet';
    } catch (e) {
        console.warn('[Mail-Link] nicht eingelöst', e?.message || e);
        return 'abgelaufen';
    }
}

/** Der Hinweis nach dem Einlösen. */
export function mailAnmeldungText(name) {
    return name ? `Angemeldet als ${name}.` : 'Du bist jetzt angemeldet.';
}
