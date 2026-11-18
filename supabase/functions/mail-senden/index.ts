// Verschickt Mails der App, die nicht Supabase selbst verschickt:
//   'anfrage'     bei einer neuen Freundschaftsanfrage
//   'erinnerung'  einmal an Konten, die eine Woche alt und noch leer sind
//                 (seit 18.11.2026, mail_erinnerung_migration.sql)
//
//   POST  { art, empfaenger: uuid, absender: uuid }
//
// Bei der Erinnerung ist absender der Empfänger selbst.
//
// Aufrufen darf das nur die Datenbank (Auslöser mail_bei_anfrage, siehe
// supabase/migrations/mail_anfrage_migration.sql). Sie weist sich mit
// demselben Geheimnis aus wie bei push-senden.
//
// Bewusst keine Adresse und kein Text im Aufruf, nur zwei Kennungen. Adresse
// und Name holt die Funktion selbst (mail_anfrage_daten), und die liefert nur
// etwas, wenn wirklich eine offene Anfrage dieses Absenders an diesen
// Empfänger besteht, dessen Adresse bestätigt ist und der Mails nicht
// abgeschaltet hat. Selbst wer das Geheimnis kennte, könnte damit nur
// Nutzern der App genau diese Mail schicken – keine fremde Adresse, kein
// eigener Text.
//
// Verschickt wird per SMTP auf Port 465 (smtp.js). Die Zugangsdaten stehen in
// den Secrets der Edge Functions:
//   MAIL_ADRESSE       Absender, z. B. noreply@opernlog.de
//   MAIL_APP_PASSWORT  Passwort beim Mailserver (bei Resend der API-Schlüssel)
//   MAIL_HOST          Mailserver; ohne: smtp.gmail.com
//   MAIL_BENUTZER      Anmeldename; ohne: die Adresse (so bei Gmail)
//   MAIL_ANTWORT       Adresse für Antworten; ohne: support@opernlog.de
//                      (iCloud+, seit 17.11.2026). Der Absender ist ein
//                      noreply-Postfach, Antworten dorthin gingen verloren.
// Fehlen Adresse oder Passwort, antwortet die Funktion 503 und schickt nichts.
//
// Bis 17.11.2026 lief alles über ein Gmail-Konto. Dessen Mails landeten bei
// manchen Empfängern im Spam; seitdem geht der Versand über Resend mit der
// eigenen Domain (MAIL_HOST=smtp.resend.com, MAIL_BENUTZER=resend), wie die
// Anmeldemails von Supabase auch.
//
// Ohne JWT-Prüfung eingerichtet (verify_jwt: false) wie push-senden: die
// Datenbank hat kein Nutzer-JWT.

import { smtpSenden } from './smtp.js';
import { nachrichtBauen } from './nachricht.js';
import { VORLAGEN } from './vorlage.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const DIENST = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ADRESSE = Deno.env.get('MAIL_ADRESSE') || '';
const PASSWORT = (Deno.env.get('MAIL_APP_PASSWORT') || '').replace(/\s+/g, '');
const HOST = (Deno.env.get('MAIL_HOST') || 'smtp.gmail.com').trim();
const BENUTZER = (Deno.env.get('MAIL_BENUTZER') || '').trim() || ADRESSE;
const ANTWORT = (Deno.env.get('MAIL_ANTWORT') || '').trim() || 'support@opernlog.de';

// Je Art die Datenbankfunktion, die Adresse und Name liefert – nur wenn die
// Mail wirklich fällig ist.
const DATEN = { anfrage: 'mail_anfrage_daten', erinnerung: 'mail_erinnerung_daten' } as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(daten: unknown, status = 200) {
    return new Response(JSON.stringify(daten), {
        status, headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
}

/** PostgREST mit dem Dienstschlüssel, wie in push-senden. */
async function rest(pfad: string, optionen: RequestInit = {}) {
    const kopf: Record<string, string> = { apikey: DIENST, 'Content-Type': 'application/json' };
    if (DIENST.startsWith('eyJ')) kopf.Authorization = `Bearer ${DIENST}`;
    const antwort = await fetch(`${SUPABASE_URL}/rest/v1/${pfad}`, {
        ...optionen, headers: { ...kopf, ...(optionen.headers || {}) },
    });
    if (!antwort.ok) throw new Error(`${pfad}: ${antwort.status} ${await antwort.text()}`);
    const text = await antwort.text();
    return text ? JSON.parse(text) : null;
}

const maskieren = (text: string) => text.replace(/[&<>"']/g, z =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[z]!));

/** Eine Deno-TLS-Verbindung in der Form, die smtp.js erwartet. */
function verbindung(tls: Deno.TlsConn) {
    const puffer = new Uint8Array(4096);
    return {
        lesen: async () => {
            const n = await tls.read(puffer);
            return n === null ? null : puffer.slice(0, n);
        },
        schreiben: async (daten: Uint8Array) => {
            for (let geschrieben = 0; geschrieben < daten.length;) {
                geschrieben += await tls.write(daten.subarray(geschrieben));
            }
        },
        schliessen: () => tls.close(),
    };
}

Deno.serve(async (req) => {
    if (req.method !== 'POST') return json({ fehler: 'Nur POST' }, 405);

    try {
        const { geheimnis } = await rest('rpc/push_intern', { method: 'POST', body: '{}' });
        const gegeben = req.headers.get('x-push-geheimnis') || '';
        if (!geheimnis || gegeben.length !== geheimnis.length || gegeben !== geheimnis) {
            return json({ fehler: 'Nicht berechtigt' }, 401);
        }

        const { art, empfaenger, absender } = await req.json();
        // hasOwn, nicht in: 'constructor' oder 'toString' stünden sonst auch drin.
        if (typeof art !== 'string' || !Object.hasOwn(DATEN, art) || !UUID.test(empfaenger || '') || !UUID.test(absender || '')) {
            return json({ fehler: 'art, empfaenger oder absender fehlt' }, 400);
        }
        if (!ADRESSE || !PASSWORT) {
            console.error('[mail-senden] MAIL_ADRESSE oder MAIL_APP_PASSWORT fehlt in den Secrets');
            return json({ fehler: 'Mailversand nicht eingerichtet' }, 503);
        }

        const daten = await rest(`rpc/${DATEN[art as keyof typeof DATEN]}`, {
            method: 'POST',
            body: JSON.stringify(art === 'anfrage'
                ? { p_empfaenger: empfaenger, p_absender: absender }
                : { p_empfaenger: empfaenger }),
        });
        // Nicht (mehr) fällig: keine offene Anfrage, Konto nicht mehr leer,
        // Adresse unbestätigt oder Mails abgeschaltet.
        if (!daten?.adresse) return json({ gesendet: false });

        const name = String(daten.name || (art === 'anfrage' ? 'Jemand' : 'Opernfan')).slice(0, 60);
        const vorlage = VORLAGEN[art as keyof typeof VORLAGEN];
        const einsetzen = (text: string, wert: string) => text.split('%%NAME%%').join(wert);
        const nachricht = nachrichtBauen({
            von: ADRESSE,
            an: daten.adresse,
            antwortAn: ANTWORT,
            betreff: einsetzen(vorlage.betreff, name),
            text: einsetzen(vorlage.text, name),
            html: einsetzen(vorlage.html, maskieren(name)),
            id: `${crypto.randomUUID()}@${ADRESSE.split('@')[1] || 'opernlog.de'}`,
        });

        const tls = await Deno.connectTls({ hostname: HOST, port: 465 });
        await smtpSenden(verbindung(tls), {
            benutzer: BENUTZER, passwort: PASSWORT, von: ADRESSE, an: daten.adresse, nachricht,
        });
        return json({ gesendet: true });
    } catch (e) {
        // Ohne Adresse im Protokoll: die Fehlermeldungen von smtp.js nennen
        // nur den Schritt und die Antwort des Servers.
        console.error('[mail-senden]', (e as Error).message);
        return json({ fehler: 'Versand fehlgeschlagen' }, 500);
    }
});
