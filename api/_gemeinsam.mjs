// Gemeinsames für die geteilten Seiten unter /abend/… und /rueckblick/…
// (api/abend.mjs, api/rueckblick.mjs). Dateien mit _ vorn sind für Vercel
// keine eigenen Funktionen.
//
// Warum Funktionen und nicht die App: ein Link auf opernlog.de/#/visit/…
// zeigt in WhatsApp und Co. nur die Vorschau der Startseite – was hinter dem
// # steht, liest kein Vorschau-Dienst –, und wer kein Konto hat, landet bei
// der Anmeldung. Diese Seiten werden auf dem Server gebaut: die Vorschau
// zeigt Werk, Haus und Sterne, und der Abend ist ohne Konto lesbar.
//
// Gelesen wird mit dem öffentlichen Schlüssel der App, also nur, was die
// Datenbank ohnehin jedem zeigt (visits und profiles sind öffentlich
// lesbar). Fotos (Momentaufnahmen) erscheinen nie: die sind nur für Freunde.
// Suchmaschinen sollen die Seiten nicht aufnehmen – geteilt wird mit
// Menschen, nicht mit Google.

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../src/config.js';
import { NEUE_ADRESSE } from '../src/umzug.js';
import { uebernehmen } from '../src/data/katalogZusatz.js';
import { BILDNACHWEISE } from '../src/data/bildnachweise.js';
import { dateinameAus, nachweisZeile } from '../src/data/bildnachweisRegeln.js';

export const SEITE = NEUE_ADRESSE;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Unter diesem Schlüssel legt supabase-js die Anmeldung im localStorage ab.
const SITZUNG = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

export const maske = (s) => String(s ?? '').replace(/[&<>"']/g, z =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[z]));

/** Eine Abfrage an die Datenbank, wie die App sie ohne Anmeldung stellen dürfte. */
export async function holen(pfad, { abruf = fetch } = {}) {
    const r = await abruf(`${SUPABASE_URL}/rest/v1/${pfad}`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (!r.ok) throw new Error(`${pfad.split('?')[0]}: HTTP ${r.status}`);
    return r.json();
}

// Werke und Häuser, die in der Datenbank angelegt wurden, kennt der Katalog im
// Repo nicht. Einmal je warmer Funktion holen, nach zehn Minuten neu.
let katalogStand = 0;
export async function katalogLaden({ abruf = fetch, jetzt = Date.now() } = {}) {
    if (jetzt - katalogStand < 10 * 60 * 1000) return;
    try {
        const [werke, haeuser, komponisten] = await Promise.all(
            ['catalog_operas', 'catalog_houses', 'catalog_composers'].map(t => holen(`${t}?select=*`, { abruf })));
        uebernehmen({ werke, haeuser, komponisten });
        katalogStand = jetzt;
    } catch (e) {
        // Dann eben nur der Katalog im Repo; ein Werk aus der Datenbank
        // erscheint dann als "Oper" ohne Titel, die Seite steht trotzdem.
        console.warn('[geteilte Seite] Katalog aus der Datenbank fehlt:', e.message);
    }
}

/** Eine Datenbankzeile in die Form, die die App rechnet (src/data/season.js). */
export const alsBesuch = (z) => ({
    ...z,
    userId: z.user_id,
    houseId: z.house_id,
    operaId: z.opera_id,
    castList: z.cast_list,
});

/** "★★★★½" – halbe Sterne als ½, wie sie in Texten lesbar sind. */
export function sterneZeichen(note) {
    const n = Math.min(5, Math.max(0, Math.round((Number(note) || 0) * 2) / 2));
    const ganz = Math.floor(n);
    const halb = n - ganz ? 1 : 0;
    return '★'.repeat(ganz) + (halb ? '½' : '') + '☆'.repeat(5 - ganz - halb);
}

export function bildTeil(url, alt) {
    if (!url) return '';
    const n = BILDNACHWEISE[dateinameAus(url)];
    const nachweis = n
        ? `<a href="${maske(n.seite)}" rel="nofollow noopener" target="_blank">${maske(nachweisZeile(n))}</a>`
        : 'Bild: Wikimedia Commons';
    return `
      <figure class="bild">
        <img src="${maske(url)}" alt="${maske(alt)}" width="500" decoding="async">
        <figcaption>${nachweis}</figcaption>
      </figure>`;
}

/**
 * Das Gerüst – wie die Seiten unter /oper/ (tests/werkzeug/seiten-erzeugen.mjs),
 * aber ohne Aufnahme in Suchmaschinen.
 *
 * @param {string} app       wohin "In OpernLog öffnen" führt (#/…)
 * @param {string|null} sofort  Angemeldete gleich in die App weiterleiten?
 *   'immer' oder eine Nutzer-Id: nur dieser Nutzer wird weitergeleitet.
 * @param {string} [ziel]   wohin weitergeleitet wird, sonst wie app
 */
export function seite({ titel, beschreibung, url, bild, inhalt, app, sofort = null, ziel = app, knopf = 'In OpernLog öffnen' }) {
    const weiter = sofort ? `
  <script>
    // Wer hier angemeldet ist, sieht den Eintrag gleich in der App.
    (function () {
      try {
        var s = JSON.parse(localStorage.getItem(${JSON.stringify(SITZUNG)}) || 'null');
        var id = s && s.user && s.user.id;
        if (id && (${JSON.stringify(sofort)} === 'immer' || id === ${JSON.stringify(sofort)})) location.replace(${JSON.stringify(ziel)});
      } catch (e) {}
    })();
  </script>` : '';
    return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <title>${maske(titel)}</title>
  <meta name="description" content="${maske(beschreibung)}">
  <meta name="theme-color" content="#8b1a2b">
  <meta name="color-scheme" content="dark">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="OpernLog">
  <meta property="og:locale" content="de_DE">
  <meta property="og:url" content="${maske(url)}">
  <meta property="og:title" content="${maske(titel)}">
  <meta property="og:description" content="${maske(beschreibung)}">
  <meta property="og:image" content="${maske(bild || `${SEITE}/icons/vorschau.png`)}">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="/icons/icon-any-192.png" sizes="192x192" type="image/png">
  <link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/fonts/schriften.css">
  <link rel="stylesheet" href="/seiten/stil.css">${weiter}
</head>
<body>
  <header class="kopf">
    <a class="marke" href="/">OpernLog</a>
    <a class="knopf knopf--kopf" href="${maske(app)}">${maske(knopf)}</a>
  </header>
  <main>
${inhalt}
    <p class="weiter"><a class="knopf" href="${maske(app)}">${maske(knopf)}</a></p>
    <p class="klein">OpernLog ist ein Operntagebuch: Abende festhalten und bewerten, sehen, was wo läuft, mit Freunden teilen. Kostenlos, ohne Werbung.</p>
  </main>
  <footer class="fuss">
    <a href="/">opernlog.de</a> · <a href="/#/datenschutz">Datenschutz</a> · <a href="/#/bildnachweise">Bildnachweise</a>
  </footer>
</body>
</html>
`;
}

/** "Gibt es nicht (mehr)" – gelöscht, nie da gewesen oder vertippt. */
export function nichtDa(was) {
    return seite({
        titel: `${was} nicht gefunden | OpernLog`,
        beschreibung: 'OpernLog – das Operntagebuch.',
        url: `${SEITE}/`,
        app: '/',
        knopf: 'OpernLog öffnen',
        inhalt: `
    <article>
      <h1>${maske(was)} nicht gefunden</h1>
      <p>Den Eintrag gibt es nicht mehr, oder der Link ist unvollständig.</p>
    </article>`,
    });
}

/**
 * Als Antwort. Kurz zwischengespeichert: eine geänderte oder gelöschte
 * Review ist nach höchstens fünf Minuten auch hier anders.
 */
export function antwort(html, status = 200) {
    return new Response(html, {
        status,
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': status === 200 ? 'public, max-age=0, s-maxage=300, stale-while-revalidate=600' : 'public, max-age=0, s-maxage=60',
            'X-Robots-Tag': 'noindex',
        },
    });
}
