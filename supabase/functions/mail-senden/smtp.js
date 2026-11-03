// SMTP, gerade so viel, wie OpernLog zum Verschicken einer Mail braucht.
//
// Ohne Fremdbibliothek, aus demselben Grund wie die Push-Verschlüsselung
// nebenan: eine Abhängigkeit weniger, die sich unter der Funktion ändern
// kann. Das Protokoll ist überschaubar: Begrüßung, EHLO, Anmeldung, Absender,
// Empfänger, Text, Ende.
//
// Die Verbindung ist schon verschlüsselt, wenn sie hier ankommt (Port 465,
// "implicit TLS"). Supabase sperrt für Edge Functions die Ports 25 und 587;
// 465 ist offen, und Gmail spricht dort von Anfang an TLS – STARTTLS braucht
// es also nicht.
//
// Die Verbindung wird hereingereicht ({ lesen, schreiben, schliessen }), damit
// tests/unit/smtp.test.js einen Server spielen kann, ohne Netz.

const ZEILE = '\r\n';

/** Eine Antwort, die nicht die erwartete war. code ist die dreistellige Zahl. */
export class SmtpFehler extends Error {
    constructor(schritt, antwort) {
        super(`${schritt}: ${antwort.text}`);
        this.name = 'SmtpFehler';
        this.schritt = schritt;
        this.code = antwort.code;
    }
}

// Eine Adresse für die SMTP-Umschläge. Bewusst eng: keine Leerzeichen, keine
// spitzen Klammern, kein Zeilenumbruch – sonst ließe sich über die Adresse ein
// weiterer Befehl einschleusen.
const ADRESSE = /^[^\s<>()\[\]\\,;:"@]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export function adresseGueltig(adresse) {
    return typeof adresse === 'string' && adresse.length <= 254 && ADRESSE.test(adresse);
}

/** UTF-8 als Base64 – btoa kann nur Latin-1. */
export function base64(text) {
    const bytes = text instanceof Uint8Array ? text : new TextEncoder().encode(text);
    let binaer = '';
    for (const b of bytes) binaer += String.fromCharCode(b);
    return btoa(binaer);
}

/**
 * Zeilenenden auf CRLF und Punkte am Zeilenanfang verdoppelt: eine Zeile, die
 * nur aus "." besteht, beendete sonst die Nachricht mittendrin (RFC 5321,
 * 4.5.2).
 */
export function punktieren(nachricht) {
    return nachricht
        .replace(/\r?\n/g, ZEILE)
        .split(ZEILE)
        .map(z => (z.startsWith('.') ? `.${z}` : z))
        .join(ZEILE);
}

/** Liest Antworten des Servers, auch mehrzeilige ("250-…" bis "250 …"). */
function antwortLeser(verbindung) {
    const dekoder = new TextDecoder();
    let puffer = '';
    return async function antwort() {
        const zeilen = [];
        for (;;) {
            let ende;
            while ((ende = puffer.indexOf(ZEILE)) === -1) {
                const stueck = await verbindung.lesen();
                if (stueck === null) throw new Error('Der Mailserver hat die Verbindung geschlossen');
                puffer += dekoder.decode(stueck, { stream: true });
            }
            const zeile = puffer.slice(0, ende);
            puffer = puffer.slice(ende + ZEILE.length);
            zeilen.push(zeile);
            if (/^\d{3}( |$)/.test(zeile)) return { code: Number(zeile.slice(0, 3)), text: zeilen.join(' | ') };
            if (!/^\d{3}-/.test(zeile)) throw new Error(`Unverständliche Antwort des Mailservers: ${zeile.slice(0, 80)}`);
        }
    };
}

/**
 * Verschickt eine fertige Nachricht (siehe nachricht.js) an eine Adresse.
 *
 * @param {{ lesen: () => Promise<Uint8Array|null>, schreiben: (b: Uint8Array) => Promise<void>, schliessen?: () => void|Promise<void> }} verbindung
 * @param {object} o
 * @param {string} o.benutzer  Anmeldename beim Mailserver (bei Gmail die Adresse)
 * @param {string} o.passwort  bei Gmail ein App-Passwort, nie das Kontopasswort
 * @param {string} o.von       Absender im Umschlag
 * @param {string} o.an        Empfänger im Umschlag
 * @param {string} o.nachricht Kopfzeilen und Inhalt
 * @param {string} [o.name]    wie sich der Absender beim EHLO nennt
 */
export async function smtpSenden(verbindung, { benutzer, passwort, von, an, nachricht, name = 'opernlog.vercel.app' }) {
    if (!adresseGueltig(von)) throw new Error('Ungültige Absenderadresse');
    if (!adresseGueltig(an)) throw new Error('Ungültige Empfängeradresse');

    const kodierer = new TextEncoder();
    const antwort = antwortLeser(verbindung);

    // anzeige: was im Fehler steht. Bei der Anmeldung nie der Befehl selbst –
    // in ihm steckt das Passwort.
    async function schritt(befehl, erwartet, anzeige) {
        if (befehl !== null) await verbindung.schreiben(kodierer.encode(befehl + ZEILE));
        const a = await antwort();
        if (!erwartet.includes(a.code)) throw new SmtpFehler(anzeige, a);
        return a;
    }

    try {
        await schritt(null, [220], 'Begrüßung');
        await schritt(`EHLO ${name}`, [250], 'EHLO');
        await schritt(`AUTH PLAIN ${base64(`\0${benutzer}\0${passwort}`)}`, [235], 'Anmeldung');
        await schritt(`MAIL FROM:<${von}>`, [250], 'Absender');
        await schritt(`RCPT TO:<${an}>`, [250, 251], 'Empfänger');
        await schritt('DATA', [354], 'DATA');
        await schritt(`${punktieren(nachricht)}${ZEILE}.`, [250], 'Nachricht');
        // Die Mail ist angenommen; ein holpriges Ende ändert daran nichts mehr.
        await schritt('QUIT', [221], 'QUIT').catch(() => {});
    } finally {
        try { await verbindung.schliessen?.(); } catch { /* schon zu */ }
    }
}
