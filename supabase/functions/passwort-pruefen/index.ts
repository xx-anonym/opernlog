// Fragt für den Browser bei HaveIBeenPwned nach, ob ein Passwort in einem
// bekannten Datenleck steht.
//
// Warum überhaupt jemand dazwischen steht: die App holt sonst nichts von
// Dritten. Genau dafür sind die Schriften ins Projekt gewandert, und in der
// README steht es als Zusage. Ein Aufruf von api.pwnedpasswords.com aus dem
// Browser würde die IP jedes Neuanmelders an Cloudflare geben und diese Zusage
// brechen. Also fragt der Server, und der Browser spricht weiter nur mit
// Supabase.
//
// Das Passwort selbst erfährt hier niemand. Der Browser bildet den SHA-1-Hash
// und schickt nur dessen erste fünf Zeichen. HaveIBeenPwned antwortet mit allen
// Hashes, die so anfangen – ein paar hundert – und erst der Browser sieht nach,
// ob seiner dabei ist (k-Anonymität). Weder diese Funktion noch HaveIBeenPwned
// können aus dem Präfix auf das Passwort schließen.
//
// Deshalb wird der Rest des Hashes hier auch nicht entgegengenommen. Wer ihn
// mitschickte, hätte den vollen SHA-1 auf einem fremden Rechner liegen, und
// damit wäre der ganze Aufwand hinfällig.

const HIBP = 'https://api.pwnedpasswords.com/range/';

// Fünf Hexzeichen, groß geschrieben – mehr nimmt die Funktion nicht an. Ohne
// diese Prüfung wäre sie ein offener Weiterleiter, über den sich beliebige
// Adressen bei HaveIBeenPwned abfragen ließen.
const PRAEFIX = /^[0-9A-F]{5}$/;

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function antwort(text: string, status = 200) {
    return new Response(text, {
        status,
        headers: { ...CORS, 'Content-Type': 'text/plain; charset=utf-8' },
    });
}

Deno.serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return antwort('Nur POST', 405);

    let praefix: unknown;
    try {
        praefix = (await req.json())?.praefix;
    } catch {
        return antwort('Kein JSON im Rumpf', 400);
    }

    if (typeof praefix !== 'string' || !PRAEFIX.test(praefix)) {
        return antwort('praefix muss fünf Hexzeichen in Großschreibung sein', 400);
    }

    try {
        const r = await fetch(HIBP + praefix, {
            // Ohne Polsterung verrät schon die Länge der Antwort, wie viele
            // Treffer es zu diesem Präfix gibt. Mit ihr sind es immer 800 bis
            // 1000 Zeilen, die überzähligen mit Zähler 0.
            headers: { 'Add-Padding': 'true', 'User-Agent': 'OpernLog' },
        });
        if (!r.ok) return antwort(`HaveIBeenPwned antwortet mit ${r.status}`, 502);
        return antwort(await r.text());
    } catch (e) {
        // Erreichbar ist der Dienst nicht immer. Was der Browser daraus macht,
        // entscheidet er selbst – siehe src/passwort.js: er lässt das Passwort
        // dann durch, statt die Anmeldung zu blockieren.
        return antwort(`HaveIBeenPwned nicht erreichbar: ${e}`, 502);
    }
});
