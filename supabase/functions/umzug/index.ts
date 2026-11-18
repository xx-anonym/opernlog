// Übergabe der Anmeldung beim Umzug von opernlog.vercel.app nach opernlog.de.
//
// Die Anmeldung liegt im Speicher des Browsers, und der gehört zur Adresse:
// unter opernlog.de wäre jeder erst einmal abgemeldet. Damit der Umzug fast
// unsichtbar bleibt (Jonas: Freunde "umziehen" zu lassen ist ihm peinlich),
// holt sich die App unter der alten Adresse hier einen Einmal-Code und
// öffnet damit opernlog.de. Dort löst sie ihn mit verifyOtp({ token_hash })
// ein und ist angemeldet – ohne Mail, ohne Code abtippen.
//
//   POST  (mit dem Zugangstoken des angemeldeten Nutzers als Bearer)
//   →     { code }   den token_hash eines Magic Links für genau dieses Konto
//
// Sicherheit:
//   - Den Code gibt es nur für das Konto, dessen Token mitkommt. Wer kein
//     gültiges Token hat, bekommt nichts; eine fremde Adresse lässt sich
//     nicht angeben.
//   - Der Code gilt einmal und läuft ab wie jeder Anmeldecode (OTP-Ablauf im
//     Dashboard). Die App trägt ihn im #-Teil der Adresse – der geht an
//     keinen Server und steht in keinem Protokoll.
//   - generate_link verschickt keine Mail; es legt nur den Code an.
//
// Ohne JWT-Prüfung durch Supabase eingerichtet (verify_jwt: false): die
// Funktion prüft das Token selbst über /auth/v1/user, und so geht auch die
// CORS-Vorabanfrage (OPTIONS, ohne Token) durch.
//
// Ohne supabase-js, wie die anderen Funktionen: eine Abhängigkeit weniger.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const DIENST = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(daten: unknown, status = 200) {
    return new Response(JSON.stringify(daten), {
        status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
    });
}

/** Der angemeldete Nutzer zu einem Zugangstoken, oder null. */
async function nutzer(token: string) {
    const antwort = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: DIENST, Authorization: `Bearer ${token}` },
    });
    if (!antwort.ok) return null;
    return await antwort.json();
}

/** Ein Magic Link für diese Adresse, ohne Mail. Zurück kommt sein token_hash. */
async function einmalCode(adresse: string): Promise<string> {
    const kopf: Record<string, string> = { apikey: DIENST, 'Content-Type': 'application/json' };
    if (DIENST.startsWith('eyJ')) kopf.Authorization = `Bearer ${DIENST}`;
    const antwort = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
        method: 'POST', headers: kopf, body: JSON.stringify({ type: 'magiclink', email: adresse }),
    });
    if (!antwort.ok) throw new Error(`generate_link: ${antwort.status}`);
    const daten = await antwort.json();
    const code = daten.hashed_token ?? daten.properties?.hashed_token;
    if (typeof code !== 'string' || !code) throw new Error('generate_link: kein hashed_token');
    return code;
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (req.method !== 'POST') return json({ fehler: 'Nur POST' }, 405);

    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return json({ fehler: 'Nicht angemeldet' }, 401);

    try {
        const ich = await nutzer(token);
        if (!ich?.id || !ich.email) return json({ fehler: 'Nicht angemeldet' }, 401);
        return json({ code: await einmalCode(ich.email) });
    } catch (e) {
        // Ohne Adresse und ohne Token im Protokoll.
        console.error('[umzug]', (e as Error).message);
        return json({ fehler: 'Übergabe nicht möglich' }, 500);
    }
});
