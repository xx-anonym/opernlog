// Verschickt Push-Mitteilungen an die Geräte eines oder mehrerer Nutzer.
//
// Aufgerufen wird die Funktion auf zwei Wegen:
//
//   GET   liefert den öffentlichen VAPID-Schlüssel. Den braucht jeder Browser,
//         um Mitteilungen zu abonnieren. Gibt es noch keinen, wird hier einmal
//         ein Schlüsselpaar erzeugt und im Supabase Vault abgelegt – der
//         private Teil verlässt den Server damit nie.
//
//   POST  { empfaenger: uuid[], titel, text, url, tag } verschickt eine
//         Mitteilung. Das darf nur die Datenbank selbst (Auslöser für
//         Anfragen, Likes, Kommentare, Einladungen und den Saisonrückblick,
//         siehe supabase/migrations/push_migration.sql). Sie weist sich mit
//         einem Geheimnis aus, das ebenfalls nur im Vault liegt.
//
// Ohne JWT-Prüfung eingerichtet (verify_jwt: false): die Datenbank hat kein
// Nutzer-JWT, und das GET ist ohnehin öffentlich. Geschützt ist das POST
// allein durch das Geheimnis.

import { vapidSchluesselErzeugen, senden, PUSH_DIENSTE } from './webpush.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const DIENST = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Apple verlangt eine Kontaktangabe im VAPID-Ausweis. Die Adresse der App statt
// einer E-Mail: so steht keine persönliche Adresse in jeder Anfrage.
const KONTAKT = 'https://opernlog.vercel.app';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(daten: unknown, status = 200) {
    return new Response(JSON.stringify(daten), {
        status,
        headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
    });
}

/** PostgREST mit dem Dienstschlüssel – ohne supabase-js, eine Abhängigkeit weniger. */
async function rest(pfad: string, optionen: RequestInit = {}) {
    const kopf: Record<string, string> = { apikey: DIENST, 'Content-Type': 'application/json' };
    // Alte Dienstschlüssel sind JWTs und gehören zusätzlich als Bearer mit;
    // die neuen (sb_secret_…) nur als apikey.
    if (DIENST.startsWith('eyJ')) kopf.Authorization = `Bearer ${DIENST}`;
    const antwort = await fetch(`${SUPABASE_URL}/rest/v1/${pfad}`, {
        ...optionen, headers: { ...kopf, ...(optionen.headers || {}) },
    });
    if (!antwort.ok) throw new Error(`${pfad}: ${antwort.status} ${await antwort.text()}`);
    const text = await antwort.text();
    return text ? JSON.parse(text) : null;
}

type Intern = { geheimnis: string | null; vapid_oeffentlich: string | null; vapid_privat: string | null };

async function intern(): Promise<Intern> {
    return await rest('rpc/push_intern', { method: 'POST', body: '{}' });
}

/** Der VAPID-Schlüssel; beim allerersten Aufruf wird er erzeugt. */
async function vapid(): Promise<{ oeffentlich: string; privatJwk: string }> {
    const i = await intern();
    if (i.vapid_oeffentlich && i.vapid_privat) {
        return { oeffentlich: i.vapid_oeffentlich, privatJwk: i.vapid_privat };
    }
    const neu = await vapidSchluesselErzeugen();
    // push_vapid_speichern legt nur an, wenn noch keiner da ist, und gibt den
    // gültigen zurück – laufen zwei Aufrufe gleichzeitig hier hinein, gewinnt
    // einer, und beide benutzen danach denselben.
    const gespeichert = await rest('rpc/push_vapid_speichern', {
        method: 'POST',
        body: JSON.stringify({ p_oeffentlich: neu.oeffentlich, p_privat: neu.privatJwk }),
    });
    return { oeffentlich: gespeichert.vapid_oeffentlich, privatJwk: gespeichert.vapid_privat };
}

type Abo = { id: string; endpoint: string; p256dh: string; auth: string };

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

    try {
        if (req.method === 'GET') {
            const { oeffentlich } = await vapid();
            return json({ schluessel: oeffentlich });
        }
        if (req.method !== 'POST') return json({ fehler: 'Nur GET und POST' }, 405);

        const { geheimnis } = await intern();
        const gegeben = req.headers.get('x-push-geheimnis') || '';
        if (!geheimnis || gegeben.length !== geheimnis.length || gegeben !== geheimnis) {
            return json({ fehler: 'Nicht berechtigt' }, 401);
        }

        const { empfaenger, titel, text, url, tag } = await req.json();
        const ids = (Array.isArray(empfaenger) ? empfaenger : [])
            .filter((id: unknown) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id));
        if (!ids.length || typeof titel !== 'string') return json({ fehler: 'empfaenger und titel fehlen' }, 400);

        const abos: Abo[] = await rest(`push_abos?select=id,endpoint,p256dh,auth&user_id=in.(${ids.join(',')})`);
        const schluessel = await vapid();
        // Nur Pfade innerhalb der App. Die Adresse landet im Klick auf die
        // Mitteilung, und eine fremde Seite hat dort nichts verloren.
        const nachricht = { titel, text: String(text || ''), url: /^#\/[\w\-/?=&.%]*$/.test(url || '') ? url : '#/', tag };

        let gesendet = 0, entfernt = 0;
        const fehler: string[] = [];
        await Promise.all(abos.map(async (abo) => {
            if (!PUSH_DIENSTE.test(abo.endpoint)) {
                await rest(`push_abos?id=eq.${abo.id}`, { method: 'DELETE' });
                entfernt++;
                return;
            }
            try {
                const status = await senden(abo, nachricht, schluessel, KONTAKT);
                if (status === 404 || status === 410) {
                    // Das Gerät hat das Abo aufgegeben, etwa weil die App
                    // gelöscht wurde. Weiter dorthin zu senden ist zwecklos.
                    await rest(`push_abos?id=eq.${abo.id}`, { method: 'DELETE' });
                    entfernt++;
                } else if (status >= 200 && status < 300) {
                    await rest(`push_abos?id=eq.${abo.id}`, {
                        method: 'PATCH', body: JSON.stringify({ zuletzt_benutzt: new Date().toISOString() }),
                    });
                    gesendet++;
                } else {
                    fehler.push(`${new URL(abo.endpoint).host}: ${status}`);
                }
            } catch (e) {
                fehler.push(`${new URL(abo.endpoint).host}: ${(e as Error).message}`);
            }
        }));

        if (fehler.length) console.error('[push-senden]', fehler.join(' | '));
        return json({ abos: abos.length, gesendet, entfernt, fehler });
    } catch (e) {
        console.error('[push-senden]', e);
        return json({ fehler: 'Interner Fehler' }, 500);
    }
});
