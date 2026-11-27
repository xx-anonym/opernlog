// Erzeugt die Seiten für Suchmaschinen: je Werk, Haus und Komponist eine echte
// Seite unter opernlog.de, dazu je eine Übersicht und die sitemap.xml.
//
//   node tests/werkzeug/seiten-erzeugen.mjs            mit den Einträgen aus der Datenbank
//   node tests/werkzeug/seiten-erzeugen.mjs --ohne-db   nur der Katalog im Repo
//
// Warum: die App führt alles hinter #/… (#/opera/tosca), und Google wertet
// nichts hinter dem # aus. Für Google gab es nur die Startseite, nicht die
// 121 Werke, 92 Häuser und rund 3800 Termine (Jonas, 18.11.2026: OpernLog
// soll über Google findbar sein). Diese Seiten stehen unter
//   /oper/<id>/   /haus/<id>/   /komponist/<id>/
// und sind schlichtes HTML ohne die App: Titel, kurzer Text, Bild mit
// Nachweis, kommende Termine (mit Strukturdaten für Google), Verweise
// untereinander und ein Knopf in die App (#/opera/<id> usw.).
//
// Seit 24.11.2026 tragen die Termine, wo das Haus sie veröffentlicht, auch
// Dirigat, Regie und Besetzung (daten/besetzung/<haus>.json, wöchentlich von
// besetzung-lesen.mjs) – aufklappbar unter dem Termin und als performer in
// den Strukturdaten. Wer dort singt oder dirigiert, bekommt eine eigene Seite
// unter /person/<name>/ mit seinen kommenden Abenden: gesucht wird oft nach
// "Wer singt …" oder nach dem Namen selbst (Jonas: neue Nutzer über Google).
//
// Die Termine stammen aus src/data/spielplan.js. "Kommend" heißt ab dem
// Stand des Spielplans; was danach vorbei ist, blendet ein kleines Skript
// auf der Seite aus. Neu erzeugt wird mit jedem Spielplan-Lauf
// (spielplan-uebernehmen.mjs), so wie die Kalenderdateien.
//
// Die Seiten tragen die Adresse opernlog.de als canonical. Unter
// opernlog.vercel.app sagt vercel.json Suchmaschinen "nicht aufnehmen".

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { operas } from '../../src/data/operas.js';
import { operaHouses } from '../../src/data/operaHouses.js';
import { composers, composerByName } from '../../src/data/composers.js';
import { spielplan, SPIELPLAN_STAND } from '../../src/data/spielplan.js';
import { BILDNACHWEISE } from '../../src/data/bildnachweise.js';
import { dateinameAus, nachweisZeile } from '../../src/data/bildnachweisRegeln.js';
import { WERKTEXT_ORDNER, werkTextFehler, eigenerWerkText, stelleZitat } from '../../src/data/werkTexte.js';
import { idVorschlag } from '../../src/data/katalogRegeln.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SEITE = 'https://opernlog.de';
export const ORDNER = { werk: 'oper', haus: 'haus', komponist: 'komponist', stadt: 'stadt', person: 'person' };

// ── Kleinigkeiten ─────────────────────────────────────────────────────────

const maske = (s) => String(s ?? '').replace(/[&<>"']/g, z =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[z]));

const WOCHENTAG = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONAT = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/** "Sa, 15.05.2027" */
function datumText(iso) {
    const [j, m, t] = iso.split('-').map(Number);
    const tag = new Date(Date.UTC(j, m - 1, t)).getUTCDay();
    return `${WOCHENTAG[tag]}, ${String(t).padStart(2, '0')}.${String(m).padStart(2, '0')}.${j}`;
}

/** "2026/27" – die Spielzeit, in die ein Tag fällt (sie beginnt im August). */
export function spielzeit(iso) {
    const [j, m] = String(iso).split('-').map(Number);
    const beginn = m >= 8 ? j : j - 1;
    return `${beginn}/${String((beginn + 1) % 100).padStart(2, '0')}`;
}

/** "14. November 2026" */
const standText = (iso) => { const [j, m, t] = iso.split('-').map(Number); return `${t}. ${MONAT[m - 1]} ${j}`; };

/** Abstand von Mitteleuropa zu UTC an einem Tag: +01:00 oder +02:00. */
function zeitzone(iso) {
    const [j, m, t] = iso.split('-').map(Number);
    const mittag = new Date(Date.UTC(j, m - 1, t, 12));
    const teile = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', timeZoneName: 'shortOffset' }).formatToParts(mittag);
    const off = teile.find(p => p.type === 'timeZoneName')?.value || 'GMT+1';
    const std = Number(off.replace('GMT', '')) || 1;
    return `+0${std}:00`;
}

export function land(haus) {
    if (haus.state === 'Österreich') return { code: 'AT', name: 'Österreich' };
    if (haus.state === 'Schweiz') return { code: 'CH', name: 'Schweiz' };
    return { code: 'DE', name: 'Deutschland' };
}

const ortText = (haus) => [haus.city, haus.state && !['Österreich', 'Schweiz'].includes(haus.state) ? haus.state : land(haus).name]
    .filter(Boolean).join(', ');

export const adresse = (art, id) => `${SEITE}/${ORDNER[art]}/${encodeURIComponent(id)}/`;
const appAdresse = { werk: id => `/#/opera/${id}`, haus: id => `/#/house/${id}`, komponist: id => `/#/composer/${id}`, stadt: () => '/#/houses', person: name => `/#/person/${encodeURIComponent(name)}` };

/** "muenchen" aus "München" – die Adresse der Stadtseite. */
export const stadtId = (stadt) => idVorschlag(stadt);

function bildTeil(url, alt) {
    if (!url) return '';
    const n = BILDNACHWEISE[dateinameAus(url)];
    const nachweis = n
        ? `<a href="${maske(n.seite)}" rel="nofollow noopener" target="_blank">${maske(nachweisZeile(n))}</a>`
        : `<a href="https://commons.wikimedia.org/wiki/File:${maske(encodeURIComponent(dateinameAus(url) || ''))}" rel="nofollow noopener" target="_blank">Bild: Wikimedia Commons</a>`;
    return `
      <figure class="bild">
        <img src="${maske(url)}" alt="${maske(alt)}" width="500" loading="lazy" decoding="async">
        <figcaption>${nachweis}</figcaption>
      </figure>`;
}

// ── Gerüst ────────────────────────────────────────────────────────────────

// Die Brotkrumen im Treffer: "OpernLog › Opern › Tosca" statt der Adresse.
const BEREICH = { werk: 'Opern', haus: 'Häuser', komponist: 'Komponisten', stadt: 'Städte', person: 'Mitwirkende' };
function brotkrumen(art, name = null, url = null) {
    const stufen = [
        { name: 'OpernLog', url: `${SEITE}/` },
        { name: BEREICH[art], url: `${SEITE}/${ORDNER[art]}/` },
        ...(name ? [{ name, url }] : []),
    ];
    return {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: stufen.map((s, i) => ({ '@type': 'ListItem', position: i + 1, name: s.name, item: s.url })),
    };
}

function seite({ titel, beschreibung, url, bild, inhalt, daten = [], app, krumen = null, kanonisch = url }) {
    if (krumen) daten = [krumen, ...daten];
    const ld = daten.length
        ? `\n  <script type="application/ld+json">${JSON.stringify(daten.length === 1 ? daten[0] : daten).replace(/</g, '\\u003c')}</script>`
        : '';
    return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${maske(titel)}</title>
  <meta name="description" content="${maske(beschreibung)}">
  <link rel="canonical" href="${maske(kanonisch)}">
  <meta name="theme-color" content="#8b1a2b">
  <meta name="color-scheme" content="dark">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="OpernLog">
  <meta property="og:locale" content="de_DE">
  <meta property="og:url" content="${maske(kanonisch)}">
  <meta property="og:title" content="${maske(titel)}">
  <meta property="og:description" content="${maske(beschreibung)}">
  <meta property="og:image" content="${maske(bild || `${SEITE}/icons/vorschau.png`)}">
  <link rel="icon" href="/icons/icon-any-192.png" sizes="192x192" type="image/png">
  <link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/fonts/schriften.css">
  <link rel="stylesheet" href="/seiten/stil.css">${ld}
</head>
<body>
  <header class="kopf">
    <a class="marke" href="/">OpernLog</a>
    <a class="knopf knopf--kopf" href="${maske(app)}">In OpernLog öffnen</a>
  </header>
  <nav class="bereiche"><a href="/oper/">Opern</a><a href="/haus/">Häuser</a><a href="/stadt/">Städte</a><a href="/komponist/">Komponisten</a><a href="/person/">Mitwirkende</a></nav>
  <main>
${inhalt}
    <p class="weiter"><a class="knopf" href="${maske(app)}">In OpernLog öffnen</a></p>
    <p class="klein">OpernLog ist dein Operntagebuch: Abende festhalten und bewerten, sehen, was wo läuft, mit Freunden teilen. Kostenlos, ohne Werbung.</p>
  </main>
  <footer class="fuss">
    <a href="/">opernlog.de</a> · <a href="/#/datenschutz">Datenschutz</a> · <a href="/#/bildnachweise">Bildnachweise</a>
  </footer>
  <script>
    // Was seit dem Stand des Spielplans vorbei ist, ausblenden.
    (function () {
      var heute = new Date(); heute.setHours(0, 0, 0, 0);
      var iso = heute.getFullYear() + '-' + String(heute.getMonth() + 1).padStart(2, '0') + '-' + String(heute.getDate()).padStart(2, '0');
      document.querySelectorAll('[data-datum]').forEach(function (el) { if (el.getAttribute('data-datum') < iso) el.remove(); });
      // Vorn stehen die nächsten Termine, der Rest ist eingeklappt: was vorn
      // vorbei ist, rückt von hinten nach.
      document.querySelectorAll('[data-termine]').forEach(function (sek) {
        var vorn = sek.querySelector('ul.termine'), mehr = sek.querySelector('details.mehr');
        if (!vorn || !mehr) return;
        var hinten = mehr.querySelector('ul.termine');
        while (vorn.children.length < ${TERMINE_VORN} && hinten.firstElementChild) vorn.appendChild(hinten.firstElementChild);
        if (!hinten.children.length) mehr.remove();
        else mehr.querySelector('[data-anzahl]').textContent = hinten.children.length;
      });
      document.querySelectorAll('[data-termine]').forEach(function (el) { if (!el.querySelector('[data-datum]')) el.remove(); });
    })();
  </script>
</body>
</html>
`;
}

// ── Termine ───────────────────────────────────────────────────────────────

// So viele Termine stehen offen da, der Rest hinter "Weitere … Termine zeigen".
// Vorher stand die ganze Liste offen – bei Tosca 86 Zeilen, vor allem anderen.
export const TERMINE_VORN = 5;

/**
 * Kommende Termine je Werk und je Haus, sortiert. [{werk, haus, datum, zeit, url, besetzung}]
 * besetzung: Map Haus → abende aus daten/besetzung/<haus>.json; der Abend
 * daraus hängt am Termin (oder null).
 */
export function termineAb(stand, liste = spielplan, besetzung = new Map()) {
    const alle = [];
    for (const e of liste) {
        for (const datum of e.termine || []) {
            if (datum >= stand) {
                const abend = besetzung.get(e.haus)?.[`${e.werk}|${datum}`] || null;
                alle.push({ werk: e.werk, haus: e.haus, datum, zeit: e.zeiten?.[datum] || null, url: e.url, besetzung: abend });
            }
        }
    }
    return alle.sort((a, b) => a.datum.localeCompare(b.datum) || a.haus.localeCompare(b.haus));
}

/** Die Dateien aus daten/besetzung: Map Haus → { "werk|datum": abend }. */
export function besetzungLesen(wurzel = WURZEL) {
    const ordner = path.join(wurzel, 'daten/besetzung');
    const m = new Map();
    if (!fs.existsSync(ordner)) return m;
    for (const datei of fs.readdirSync(ordner).filter(d => d.endsWith('.json'))) {
        try {
            const d = JSON.parse(fs.readFileSync(path.join(ordner, datei), 'utf8'));
            if (d?.haus && d.abende) m.set(d.haus, d.abende);
        } catch { /* eine kaputte Datei kostet nur ihre Besetzung */ }
    }
    return m;
}

/** Wer an einem Abend mitwirkt: [{ name, als }] – als ist "Dirigat", "Regie" oder die Rolle. */
export function mitwirkende(abend) {
    if (!abend) return [];
    const teile = (text) => String(text || '').split(/,\s*/).map(n => n.trim()).filter(Boolean);
    return [
        ...teile(abend.dirigent).map(name => ({ name, als: 'Dirigat' })),
        ...teile(abend.regie).map(name => ({ name, als: 'Regie' })),
        ...(abend.besetzung || []).filter(b => b?.name).map(b => ({ name: String(b.name), als: String(b.rolle || '') })),
    ];
}

/** Die Adresse der Personenseite: "olena-tokar" aus "Olena Tokar". */
export const personId = (name) => idVorschlag(name);

/** "19:30" oder "19:30-22:00" → { beginn, ende } */
export function uhrzeiten(zeit) {
    const [beginn = null, ende = null] = String(zeit || '').match(/\b\d{1,2}:\d{2}\b/g) || [];
    return { beginn, ende };
}

function ereignis(t, werk, haus) {
    const { beginn, ende } = uhrzeiten(t.zeit);
    const start = beginn ? `${t.datum}T${beginn.padStart(5, '0')}:00${zeitzone(t.datum)}` : t.datum;
    const schluss = ende ? `${t.datum}T${ende.padStart(5, '0')}:00${zeitzone(t.datum)}` : null;
    return {
        '@context': 'https://schema.org',
        '@type': 'Event',
        name: `${werk.title} – ${haus.name}`,
        startDate: start,
        ...(schluss && schluss > start ? { endDate: schluss } : {}),
        eventStatus: 'https://schema.org/EventScheduled',
        eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
        location: {
            '@type': 'PerformingArtsTheater',
            name: haus.name,
            address: { '@type': 'PostalAddress', addressLocality: haus.city, addressCountry: land(haus).code },
        },
        organizer: { '@type': 'Organization', name: haus.name, url: t.url },
        // Das Ensemble des Hauses, und wo das Haus die Besetzung nennt, auch
        // die Einzelnen (seit 24.11.2026). Google fragt danach ("Missing
        // field 'performer'", Search Console, 19.11.2026). Preise, Vorverkauf
        // und Endzeit fehlen weiter – lieber keine Angabe als eine erfundene.
        performer: (() => {
            const gruppe = { '@type': 'PerformingGroup', name: haus.name };
            const leute = mitwirkende(t.besetzung).filter(m => m.als !== 'Regie');
            return leute.length
                ? [gruppe, ...leute.map(m => ({ '@type': 'Person', name: m.name, url: adresse('person', personId(m.name)) }))]
                : gruppe;
        })(),
        ...(werk.image ? { image: werk.image } : {}),
        description: `${werk.title}${werk.composer ? ` von ${werk.composer}` : ''} am ${haus.name}, ${haus.city}.`,
        url: t.url,
        offers: { '@type': 'Offer', url: t.url, availability: 'https://schema.org/InStock' },
    };
}

function terminZeile(t, { werk, haus }, zeigen) {
    const was = zeigen === 'haus'
        ? `<a href="${adresse('haus', haus.id)}">${maske(haus.name)}</a> <span class="ort">${maske(haus.city)}</span>`
        : zeigen === 'beides'
            ? `<a href="${adresse('werk', werk.id)}">${maske(werk.title)}</a> <span class="ort">${maske(haus.name)}</span>`
            : `<a href="${adresse('werk', werk.id)}">${maske(werk.title)}</a>${werk.composer ? ` <span class="ort">${maske(werk.composer)}</span>` : ''}`;
    const { beginn } = uhrzeiten(t.zeit);
    return `          <li data-datum="${t.datum}"><time datetime="${t.datum}${beginn ? `T${beginn.padStart(5, '0')}` : ''}">${datumText(t.datum)}${t.zeit ? ` · ${maske(t.zeit.replace('-', '–'))}` : ''}</time> ${was} <a class="karten" href="${maske(t.url)}" rel="nofollow noopener" target="_blank">Karten &amp; Infos</a>${besetzungTeil(t.besetzung)}</li>`;
}

const personLink = (name) => `<a href="${adresse('person', personId(name))}">${maske(name)}</a>`;

/** Dirigat, Regie und Besetzung eines Termins, eingeklappt unter der Zeile. */
function besetzungTeil(abend) {
    const leute = mitwirkende(abend);
    if (!leute.length) return '';
    const leitung = leute.filter(m => m.als === 'Dirigat' || m.als === 'Regie');
    const rollen = new Map();
    for (const m of leute.filter(m => m.als !== 'Dirigat' && m.als !== 'Regie')) rollen.set(m.als, [...(rollen.get(m.als) || []), m.name]);
    const zeilen = [
        ...['Dirigat', 'Regie'].map(als => [als === 'Dirigat' ? 'Musikalische Leitung' : 'Regie', leitung.filter(m => m.als === als).map(m => m.name)]),
        ...rollen,
    ].filter(([, namen]) => namen.length);
    return `
            <details class="besetzung"><summary>Besetzung</summary><dl>${zeilen.map(([was, namen]) => `<dt>${maske(was || 'Mit')}</dt><dd>${namen.map(personLink).join(', ')}</dd>`).join('')}</dl><p class="klein">Laut Spielplan des Hauses, Änderungen vorbehalten.</p></details>`;
}

// ── Die Seiten ────────────────────────────────────────────────────────────

const MONATSNAME = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
/** "14. Januar 1900" oder "1900" */
const datumLang = (d) => {
    const [j, m, t] = String(d).split('-').map(Number);
    return m ? `${t}. ${MONATSNAME[m - 1]} ${j}` : String(j);
};

/** Die Termine eines Werks: die nächsten offen, der Rest eingeklappt. */
function werkTermine(meine, werk, haeuser, stand) {
    const zeile = t => terminZeile(t, { werk, haus: haeuser.get(t.haus) }, 'haus');
    const vorn = meine.slice(0, TERMINE_VORN);
    const hinten = meine.slice(TERMINE_VORN);
    return `
      <section data-termine>
        <h2>Aktuelle Termine</h2>
        <ul class="termine">
${vorn.map(zeile).join('\n')}
        </ul>${hinten.length ? `
        <details class="mehr">
          <summary>Weitere <span data-anzahl>${hinten.length}</span> Termine zeigen</summary>
          <ul class="termine">
${hinten.map(zeile).join('\n')}
          </ul>
        </details>` : ''}
        <p class="klein">Stand des Spielplans: ${standText(stand)}. Maßgeblich ist die Seite des Hauses.</p>
      </section>`;
}

/** Steckbrief, Anriss, Handlung, bekannte Stellen, Wissenswertes – aus daten/werke/<id>.json. */
/**
 * Häufige Fragen zu einem Werk – so, wie Leute vor dem Opernbesuch suchen:
 * "Wie lange dauert Tosca?", "Worum geht es …?" (20.11.2026). Nur aus dem,
 * was im Werktext und im Spielplan steht; nichts dazuerfunden.
 */
export function werkFragen(werk, text, { meine = [], haeuser = new Map() } = {}) {
    const fragen = [];
    fragen.push({ frage: `Worum geht es in ${werk.title}?`, antwort: text.anriss });
    if (text.dauer) fragen.push({ frage: `Wie lange dauert ${werk.title}?`,
        antwort: `${werk.title} dauert ${text.dauer} ohne Pausen. Mit Pausen kommt je nach Haus und Inszenierung etwas hinzu.` });
    if (werk.acts) fragen.push({ frage: `Wie viele Akte hat ${werk.title}?`,
        antwort: `${werk.title} hat ${werk.acts === 1 ? 'einen Akt' : `${werk.acts} Akte`}${werk.composer ? `; die Musik ist von ${werk.composer}` : ''}${werk.librettist ? `, das Libretto von ${werk.librettist}` : ''}.` });
    const ua = text.urauffuehrung;
    if (ua) fragen.push({ frage: `Wann wurde ${werk.title} uraufgeführt?`,
        antwort: `Die Uraufführung war ${String(ua.datum).length === 4 ? `im Jahr ${ua.datum}` : `am ${datumLang(ua.datum)}`}${ua.ort ? ` (${ua.ort})` : ''}.` });
    const zitate = text.stellen.filter(s => s.zitat !== false).slice(0, 4);
    if (zitate.length) fragen.push({ frage: `Welche Arien und Stellen aus ${werk.title} sind bekannt?`,
        antwort: `Zum Beispiel ${zitate.map(s => `${stelleZitat(s.titel)} (${s.wer})`).join(', ').replace(/, ([^,]*)$/, ' und $1')}.` });
    if (meine.length) {
        // Ohne Datum: die Seite wird nur mit jedem Spielplan-Lauf neu
        // erzeugt, ein "nächster Termin" wäre bald überholt.
        const orte = [...new Set(meine.map(t => t.haus))].map(id => haeuser.get(id)).filter(Boolean);
        const beispiele = orte.slice(0, 3).map(h => `${h.name} (${h.city})`);
        fragen.push({ frage: `Wo läuft ${werk.title} gerade?`,
            antwort: `In dieser Spielzeit an ${orte.length} ${orte.length === 1 ? 'Opernhaus' : 'Opernhäusern'} in Deutschland, Österreich und der Schweiz${beispiele.length ? `, etwa ${beispiele.join(', ').replace(/, ([^,]*)$/, ' und $1')}` : ''}. Die nächsten Termine stehen oben auf dieser Seite.` });
    }
    return fragen;
}

function werkTextTeile(werk, text) {
    const ua = text.urauffuehrung;
    const stadt = ua?.ort ? ua.ort.split(',').pop().trim() : '';
    const steckbrief = [
        text.dauer && `${text.dauer} ohne Pausen`,
        werk.acts && `${werk.acts} ${werk.acts === 1 ? 'Akt' : 'Akte'}`,
        werk.language,
        ua && `Uraufführung ${String(ua.datum).slice(0, 4)}${stadt ? `, ${stadt}` : ''}`,
    ].filter(Boolean);
    return {
        oben: `
      <ul class="steckbrief">${steckbrief.map(x => `<li>${maske(x)}</li>`).join('')}</ul>
      <p class="anriss">${maske(text.anriss)}</p>`,
        handlung: `
      <section>
        <h2>Die Handlung</h2>
        <ol class="akte">
${text.akte.map(a => `          <li><span class="akt">${maske(a.titel)}${a.ort ? ` · ${maske(a.ort)}` : ''}</span>
            ${maske(a.text)}</li>`).join('\n')}
        </ol>
      </section>${text.stellen.length ? `
      <section>
        <h2>Bekannte Stellen</h2>
        <ul class="stellen">
${text.stellen.map(a => `          <li><span class="stelle">${maske(stelleZitat(a.titel, a.zitat))}</span><span class="wer">${maske(a.wer)} · ${maske(a.akt)}</span>${a.was ? `<span class="was">${maske(a.was)}</span>` : ''}</li>`).join('\n')}
        </ul>
      </section>` : ''}`,
        wissen: `${text.wissen.length ? `
      <section>
        <h2>Gut zu wissen</h2>
        <ul class="wissen">
${text.wissen.map(w => `          <li>${maske(w)}</li>`).join('\n')}
        </ul>
      </section>` : ''}`,
        urauffuehrung: ua ? `${datumLang(ua.datum)}${ua.ort ? `, ${ua.ort}` : ''}` : null,
    };
}

export function werkSeite(werk, { termine, haeuser, stand, text = null }) {
    const meine = termine.filter(t => t.werk === werk.id && haeuser.has(t.haus));
    const orte = [...new Set(meine.map(t => t.haus))];
    const komponist = werk.composer ? composerByName(werk.composer) : null;
    const teile = text ? werkTextTeile(werk, text) : null;
    const fragen = text ? werkFragen(werk, text, { meine, haeuser }) : [];
    const fragenTeil = fragen.length ? `
      <section class="fragen">
        <h2>Häufige Fragen</h2>
${fragen.map(f => `        <details><summary>${maske(f.frage)}</summary><p>${maske(f.antwort)}</p></details>`).join('\n')}
      </section>` : '';
    const zeilen = [
        werk.composer && `<dt>Musik</dt><dd>${komponist ? `<a href="${adresse('komponist', komponist.id)}">${maske(werk.composer)}</a>` : maske(werk.composer)}</dd>`,
        werk.librettist && `<dt>Libretto</dt><dd>${maske(werk.librettist)}</dd>`,
        (teile?.urauffuehrung || werk.yearComposed) && `<dt>Uraufführung</dt><dd>${maske(teile?.urauffuehrung || werk.yearComposed)}</dd>`,
        werk.language && `<dt>Sprache</dt><dd>${maske(werk.language)}</dd>`,
        werk.acts && `<dt>Akte</dt><dd>${maske(werk.acts)}</dd>`,
    ].filter(Boolean).join('');
    const von = werk.composer ? ` von ${werk.composer}` : '';
    const terminSatz = meine.length
        ? `${meine.length} ${meine.length === 1 ? 'Termin' : 'Termine'} an ${orte.length} ${orte.length === 1 ? 'Opernhaus' : 'Opernhäusern'} in Deutschland, Österreich und der Schweiz`
        : '';
    // Mit Text: so, wie Leute vor dem Opernbesuch suchen ("Zauberflöte
    // Handlung kurz", "wie lange dauert …") – Jonas, 19.11.2026. Im Titel
    // steht "Arien", weil so gesucht wird; auf der Seite heißt die Rubrik
    // weiter "Bekannte Stellen".
    const zitat = text?.stellen.find(s => s.zitat !== false);
    const akteText = werk.acts ? ` in ${werk.acts === 1 ? 'einem Akt' : `${werk.acts} Akten`}` : '';
    const beschreibung = text
        ? `${werk.title}${von} kurz erklärt: Inhalt und Handlung${akteText}${zitat ? `, bekannte Stellen wie ${stelleZitat(zitat.titel)}` : ''}${text.dauer ? `, Dauer ${text.dauer} ohne Pausen` : ''}${meine.length ? ` – und aktuelle Termine an ${orte.length} ${orte.length === 1 ? 'Opernhaus' : 'Opernhäusern'}` : ''}.`
        : meine.length
            ? `${werk.title}${von}: ${terminSatz} – Spielplan und Karten.`
            : `${werk.title}${von}: Werk, Hintergrund und wo es gespielt wird – im Operntagebuch OpernLog.`;
    const termineTeil = meine.length
        ? werkTermine(meine, werk, haeuser, stand)
        : `
      <p class="klein">Gerade kennt OpernLog keine Termine. Spielpläne von über 90 Häusern werden jeden Monat neu gelesen.</p>`;
    const unterzeile = werk.genre
        ? `<p class="unterzeile">${maske(werk.genre)}${werk.composer ? ` von ${maske(werk.composer)}` : ''}</p>`
        : (werk.composer ? `<p class="unterzeile">von ${maske(werk.composer)}</p>` : '');
    return seite({
        titel: text
            // "Inhalt" und "Dauer": so wird gesucht (Search Console, 23.11.2026:
            // "tosca inhalt", "wie lange dauert die oper tosca").
            ? `${werk.title}: Handlung & Inhalt kurz, Arien, Dauer | OpernLog`
            : `${werk.title}${werk.composer ? ` (${composerKurz(werk.composer)})` : ''} – Termine und Spielplan | OpernLog`,
        beschreibung: beschreibung.slice(0, 300),
        url: adresse('werk', werk.id),
        bild: werk.image,
        app: appAdresse.werk(werk.id),
        krumen: brotkrumen('werk', werk.title, adresse('werk', werk.id)),
        daten: [
            ...(fragen.length ? [{
                '@context': 'https://schema.org',
                '@type': 'FAQPage',
                mainEntity: fragen.map(f => ({ '@type': 'Question', name: f.frage, acceptedAnswer: { '@type': 'Answer', text: f.antwort } })),
            }] : []),
            ...meine.slice(0, 50).map(t => ereignis(t, werk, haeuser.get(t.haus))),
        ],
        // Mit Text steht die Handlung vorn (20.11.2026): danach wird am
        // meisten gesucht. Die Termine folgen, eingeklappt bis auf fünf.
        inhalt: teile ? `
    <article>
      <h1>${maske(werk.title)}</h1>
      ${unterzeile}${teile.oben}${teile.handlung}${termineTeil}${teile.wissen}${fragenTeil}${bildTeil(werk.image, werk.title)}
      ${zeilen ? `<dl class="fakten">${zeilen}</dl>` : ''}
    </article>` : `
    <article>
      <h1>${maske(werk.title)}</h1>
      ${unterzeile}${bildTeil(werk.image, werk.title)}
      ${werk.description ? `<p>${maske(werk.description)}</p>` : ''}
      ${zeilen ? `<dl class="fakten">${zeilen}</dl>` : ''}${termineTeil}
    </article>`,
    });
}

/** Alle Werktexte aus daten/werke/ – fehlerhafte brechen den Lauf ab. */
export function werkTexteLesen(wurzel = WURZEL) {
    const ordner = path.join(wurzel, WERKTEXT_ORDNER);
    const texte = new Map();
    if (!fs.existsSync(ordner)) return texte;
    for (const datei of fs.readdirSync(ordner).filter(d => d.endsWith('.json')).sort()) {
        const t = JSON.parse(fs.readFileSync(path.join(ordner, datei), 'utf8'));
        const fehler = werkTextFehler(t);
        if (fehler.length) throw new Error(`${WERKTEXT_ORDNER}/${datei}: ${fehler.join(', ')}`);
        texte.set(datei.replace(/\.json$/, ''), t);
    }
    return texte;
}

/** "Puccini" aus "Giacomo Puccini" – für den Titel der Seite. */
function composerKurz(name) {
    const teile = String(name).trim().split(/\s+/);
    return teile.length > 1 ? teile[teile.length - 1] : name;
}

export function hausSeite(haus, { termine, werke, stand, mitStadt = false }) {
    const meine = termine.filter(t => t.haus === haus.id && werke.has(t.werk));
    const zahl = new Set(meine.map(t => t.werk)).size;
    const zeilen = [
        `<dt>Ort</dt><dd>${maske(ortText(haus))}</dd>`,
        haus.founded && `<dt>Gegründet</dt><dd>${maske(haus.founded)}</dd>`,
        haus.capacity && `<dt>Plätze</dt><dd>${maske(Number(haus.capacity).toLocaleString('de-DE'))}</dd>`,
    ].filter(Boolean).join('');
    const termineTeil = meine.length
        ? `
      <section data-termine>
        <h2>Spielplan: Oper</h2>
        <ul class="termine">
${meine.map(t => terminZeile(t, { werk: werke.get(t.werk), haus }, 'werk')).join('\n')}
        </ul>
        <p class="klein">Stand: ${standText(stand)}. Maßgeblich ist die Seite des Hauses.</p>
      </section>`
        : `
      <p class="klein">Gerade kennt OpernLog keine Termine dieses Hauses.</p>`;
    return seite({
        // "Programm" und die Spielzeit: so wird gesucht (Search Console,
        // 23.11.2026: "opernhaus frankfurt programm", "oper freiburg spielplan
        // 2026"). Die Stadt nur, wenn sie nicht schon im Namen steht – "Oper
        // Frankfurt" braucht kein "Frankfurt am Main", "Wiener Staatsoper" kein "Wien".
        titel: `${haus.name}${haus.name.includes(String(haus.city).split(/[\s(]/)[0]) ? '' : ` ${haus.city}`}: Spielplan & Programm ${spielzeit(stand)} | OpernLog`,
        beschreibung: (meine.length
            ? `Spielplan und Programm ${spielzeit(stand)}: ${haus.name} in ${haus.city} mit ${meine.length} ${meine.length === 1 ? 'Opernabend' : 'Opernabenden'} und ${zahl} ${zahl === 1 ? 'Werk' : 'Werken'} – alle Termine mit Links zu den Karten.`
            : `${haus.name} in ${haus.city}: Haus, Geschichte und Spielplan – im Operntagebuch OpernLog.`).slice(0, 300),
        url: adresse('haus', haus.id),
        bild: haus.imageUrl,
        app: appAdresse.haus(haus.id),
        krumen: brotkrumen('haus', haus.name, adresse('haus', haus.id)),
        daten: [{
            '@context': 'https://schema.org',
            '@type': 'PerformingArtsTheater',
            name: haus.name,
            url: adresse('haus', haus.id),
            address: { '@type': 'PostalAddress', addressLocality: haus.city, addressCountry: land(haus).code },
            ...(Number.isFinite(haus.lat) && Number.isFinite(haus.lon) ? { geo: { '@type': 'GeoCoordinates', latitude: haus.lat, longitude: haus.lon } } : {}),
            ...(haus.imageUrl ? { image: haus.imageUrl } : {}),
        }, ...meine.slice(0, 50).map(t => ereignis(t, werke.get(t.werk), haus))],
        inhalt: `
    <article>
      <h1>${maske(haus.name)}</h1>
      <p class="unterzeile">${maske(ortText(haus))}</p>${bildTeil(haus.imageUrl, haus.name)}
      ${haus.description ? `<p>${maske(haus.description)}</p>` : ''}
      <dl class="fakten">${zeilen}</dl>${termineTeil}${mitStadt ? `
      <p><a href="${adresse('stadt', stadtId(haus.city))}">Alle Opernabende in ${maske(haus.city)}</a></p>` : ''}
    </article>`,
    });
}

/**
 * Oper in einer Stadt: alle Häuser dort und alle kommenden Abende, nach
 * Monaten (20.11.2026). So wird gesucht – "Oper Leipzig Spielplan", "Oper
 * Wien Dezember" –, und eine Hausseite trifft das nicht, wenn eine Stadt
 * mehrere Häuser hat.
 */
/**
 * Die Seite einer Stadt. Hat die Stadt nur ein Haus, steht dort fast dasselbe
 * wie auf der Seite des Hauses; Google nahm deshalb manche nicht auf
 * ("Gecrawlt – zurzeit nicht indexiert", 27.11.2026). Dann nennt die
 * Stadtseite die Hausseite als Hauptadresse (canonical) und fehlt in der
 * Sitemap – erreichbar bleibt sie, und Rang und Klicks sammeln sich beim Haus.
 */
export const stadtMitEinemHaus = (haeuser) => haeuser.length === 1;

export function stadtSeite(stadt, { haeuser, termine, werke, stand }) {
    const ids = new Set(haeuser.map(h => h.id));
    const hausMap = new Map(haeuser.map(h => [h.id, h]));
    const meine = termine.filter(t => ids.has(t.haus) && werke.has(t.werk));
    const werkZahl = new Set(meine.map(t => t.werk)).size;
    const monate = new Map();
    for (const t of meine) {
        const m = t.datum.slice(0, 7);
        monate.set(m, [...(monate.get(m) || []), t]);
    }
    const monatName = (m) => `${MONAT[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;
    const namen = haeuser.map(h => h.name);
    const hausText = namen.length === 1 ? namen[0] : `${namen.slice(0, -1).join(', ')} und ${namen.at(-1)}`;
    return seite({
        titel: `Oper in ${stadt}: Spielplan und Termine | OpernLog`,
        beschreibung: (meine.length
            ? `Opernspielplan ${stadt}: ${meine.length} ${meine.length === 1 ? 'Abend' : 'Abende'} mit ${werkZahl} ${werkZahl === 1 ? 'Werk' : 'Werken'} – ${hausText}. Alle Termine nach Monaten, mit Links zu den Karten.`
            : `Oper in ${stadt}: ${hausText} – Häuser und Spielplan im Operntagebuch OpernLog.`).slice(0, 300),
        url: adresse('stadt', stadtId(stadt)),
        kanonisch: stadtMitEinemHaus(haeuser) ? adresse('haus', haeuser[0].id) : adresse('stadt', stadtId(stadt)),
        bild: haeuser.find(h => h.imageUrl)?.imageUrl,
        app: appAdresse.stadt(),
        krumen: brotkrumen('stadt', stadt, adresse('stadt', stadtId(stadt))),
        daten: meine.slice(0, 50).map(t => ereignis(t, werke.get(t.werk), hausMap.get(t.haus))),
        inhalt: `
    <article>
      <h1>Oper in ${maske(stadt)}</h1>
      <p class="unterzeile">${maske(ortText(haeuser[0]))}</p>
      <p>${meine.length
        ? `${meine.length} ${meine.length === 1 ? 'Opernabend' : 'Opernabende'} mit ${werkZahl} ${werkZahl === 1 ? 'Werk' : 'Werken'} ${haeuser.length === 1 ? 'am' : 'an'} ${haeuser.length === 1 ? '' : `${haeuser.length} Häusern: `}${haeuser.map(h => `<a href="${adresse('haus', h.id)}">${maske(h.name)}</a>`).join(', ')}.`
        : `Gerade kennt OpernLog keine Opernabende in ${maske(stadt)}.`}</p>
${[...monate].map(([m, liste]) => `      <section data-termine>
        <h2>${monatName(m)}</h2>
        <ul class="termine">
${liste.map(t => terminZeile(t, { werk: werke.get(t.werk), haus: hausMap.get(t.haus) }, haeuser.length > 1 ? 'beides' : 'werk')).join('\n')}
        </ul>
      </section>`).join('\n')}
      ${meine.length ? `<p class="klein">Stand des Spielplans: ${standText(stand)}. Maßgeblich ist die Seite des Hauses.</p>` : ''}
    </article>`,
    });
}

export function komponistSeite(k, { werkeVon, termine }) {
    const werke = werkeVon.get(k.name) || [];
    const anzahl = (id) => termine.filter(t => t.werk === id).length;
    return seite({
        titel: `${k.name} – Opern und Termine | OpernLog`,
        beschreibung: `${k.name}${k.kurz ? `, ${k.kurz}` : ''}: ${werke.length} ${werke.length === 1 ? 'Oper' : 'Opern'} im Katalog von OpernLog, mit aktuellen Terminen.`.slice(0, 300),
        url: adresse('komponist', k.id),
        bild: k.bild,
        app: appAdresse.komponist(k.id),
        krumen: brotkrumen('komponist', k.name, adresse('komponist', k.id)),
        daten: [{ '@context': 'https://schema.org', '@type': 'Person', name: k.name, url: adresse('komponist', k.id), ...(k.bild ? { image: k.bild } : {}) }],
        inhalt: `
    <article>
      <h1>${maske(k.name)}</h1>
      ${k.kurz ? `<p class="unterzeile">${maske(k.kurz)}</p>` : ''}${bildTeil(k.bild, k.name)}
      ${k.bio ? `<p>${maske(k.bio)}</p>` : ''}
      ${werke.length ? `<section>
        <h2>Opern</h2>
        <ul class="liste">
${werke.map(w => `          <li><a href="${adresse('werk', w.id)}">${maske(w.title)}</a>${w.yearComposed ? ` <span class="ort">${maske(w.yearComposed)}</span>` : ''}${anzahl(w.id) ? ` <span class="anzahl">${anzahl(w.id)} ${anzahl(w.id) === 1 ? 'Termin' : 'Termine'}</span>` : ''}</li>`).join('\n')}
        </ul>
      </section>` : ''}
    </article>`,
    });
}

/**
 * Alle Abende aus den Besetzungsdateien, vergangene wie kommende, als Termine
 * wie die aus termineAb(): { werk, haus, datum, zeit, url, besetzung }. Die
 * Dateien heben bis 400 Tage zurück auf (besetzung-lesen.mjs) – so bleibt eine
 * Personenseite stehen, wenn ihr letzter Abend vorbei ist, statt zu
 * verschwinden und Google ein "nicht gefunden" zu hinterlassen (27.11.2026).
 */
export function besetzungsAbende(besetzung, plan = spielplan) {
    const eintrag = new Map(plan.map(e => [`${e.werk}|${e.haus}`, e]));
    const alle = [];
    for (const [haus, abende] of besetzung) {
        for (const [schluessel, abend] of Object.entries(abende || {})) {
            const [werk, datum] = schluessel.split('|');
            if (!werk || !/^\d{4}-\d{2}-\d{2}$/.test(datum || '')) continue;
            const e = eintrag.get(`${werk}|${haus}`);
            alle.push({ werk, haus, datum, zeit: e?.zeiten?.[datum] || abend?.zeit || null, url: e?.url || adresse('haus', haus), besetzung: abend });
        }
    }
    return alle.sort((a, b) => a.datum.localeCompare(b.datum) || a.haus.localeCompare(b.haus));
}

/**
 * Alle Mitwirkenden: Map id → { name, abende: [{ t, als }] }.
 * Derselbe Name ist dieselbe Person; zwei Namen mit derselben Adresse (selten)
 * teilen sich keine Seite – der zweite bekommt "-2".
 */
export function personenAus(termine) {
    const nachName = new Map();
    for (const t of termine) {
        for (const m of mitwirkende(t.besetzung)) {
            const p = nachName.get(m.name) || { name: m.name, abende: [] };
            const schon = p.abende.find(a => a.t === t);
            if (schon) { if (!schon.als.includes(m.als)) schon.als.push(m.als); } else p.abende.push({ t, als: [m.als] });
            nachName.set(m.name, p);
        }
    }
    const personen = new Map();
    for (const p of [...nachName.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'))) {
        let id = personId(p.name);
        if (!id) continue;
        if (personen.has(id)) { let n = 2; while (personen.has(`${id}-${n}`)) n++; id = `${id}-${n}`; }
        personen.set(id, { ...p, id });
    }
    return personen;
}

/** Ein Abend auf der Personenseite; kommende mit data-datum (das Skript blendet sie aus, wenn vorbei) und Kartenlink. */
function personZeile(a, werke, haeuser, kommend) {
    const w = werke.get(a.t.werk), h = haeuser.get(a.t.haus);
    const { beginn } = uhrzeiten(a.t.zeit);
    return `          <li${kommend ? ` data-datum="${a.t.datum}"` : ''}><time datetime="${a.t.datum}${beginn ? `T${beginn.padStart(5, '0')}` : ''}">${datumText(a.t.datum)}${kommend && a.t.zeit ? ` · ${maske(a.t.zeit.replace('-', '–'))}` : ''}</time> <a href="${adresse('werk', w.id)}">${maske(w.title)}</a> <span class="ort">${maske(alsText(a.als))}</span><br><a href="${adresse('haus', h.id)}">${maske(h.name)}</a> <span class="ort">${maske(h.city)}</span>${kommend ? ` <a class="karten" href="${maske(a.t.url)}" rel="nofollow noopener" target="_blank">Karten &amp; Infos</a>` : ''}</li>`;
}

const alsText = (als) => {
    const rollen = als.filter(a => a && a !== 'Dirigat' && a !== 'Regie');
    return [rollen.length ? `als ${rollen.join(' und ')}` : '', als.includes('Dirigat') ? 'Dirigat' : '', als.includes('Regie') ? 'Regie' : '']
        .filter(Boolean).join(' · ');
};

export function personSeite(p, { werke, haeuser, stand, heute = stand }) {
    const abende = p.abende.filter(a => werke.has(a.t.werk) && haeuser.has(a.t.haus));
    // Getrennt am Tag des Laufs, nicht am Stand des Spielplans: was seither
    // gespielt wurde, gehört schon zu den vergangenen Abenden.
    const kommend = abende.filter(a => a.t.datum >= heute);
    const vergangen = abende.filter(a => a.t.datum < heute).reverse();
    // Die häufigsten Werke zuerst: der Titel bleibt so über die Wochen gleich,
    // statt mit jedem vergangenen Abend ein anderes Werk vorn zu tragen.
    const zaehl = new Map();
    for (const a of abende) zaehl.set(a.t.werk, (zaehl.get(a.t.werk) || 0) + 1);
    const werkTitel = [...zaehl].sort((x, y) => y[1] - x[1] || werke.get(x[0]).title.localeCompare(werke.get(y[0]).title, 'de')).map(([id]) => werke.get(id).title);
    const hausNamen = [...new Set(abende.map(a => haeuser.get(a.t.haus).name))];
    const rollen = [...new Set(abende.flatMap(a => a.als).filter(a => a && a !== 'Dirigat' && a !== 'Regie'))];
    const funktion = abende.some(a => a.als.includes('Dirigat')) ? 'am Pult' : abende.some(a => a.als.includes('Regie')) && !rollen.length ? 'Regie' : '';
    const liste = (xs) => xs.join(', ').replace(/, ([^,]*)$/, ' und $1');
    const url = adresse('person', p.id);
    return seite({
        titel: `${p.name}: Termine ${spielzeit(stand)} – ${werkTitel.slice(0, 2).join(', ')} | OpernLog`,
        beschreibung: `${p.name} ${rollen.length ? `als ${liste(rollen.slice(0, 3))}` : funktion}: ${abende.length} ${abende.length === 1 ? 'Abend' : 'Abende'} in ${liste(werkTitel.slice(0, 3))} – ${liste(hausNamen.slice(0, 3))}. Alle Termine laut den Spielplänen der Häuser, mit Links zu den Karten.`.replace(/\s+/g, ' ').slice(0, 300),
        url,
        app: appAdresse.person(p.name),
        krumen: brotkrumen('person', p.name, url),
        daten: [
            { '@context': 'https://schema.org', '@type': 'Person', name: p.name, url },
            ...kommend.map(a => ereignis(a.t, werke.get(a.t.werk), haeuser.get(a.t.haus))),
        ],
        inhalt: `
    <article>
      <h1>${maske(p.name)}</h1>
      <p class="unterzeile">${rollen.length ? `${maske(liste(rollen))}` : maske(funktion === 'am Pult' ? 'Dirigat' : funktion)} – Abende laut den Spielplänen der Häuser</p>
      ${kommend.length ? `<section data-termine>
        <h2>Termine</h2>
        <ul class="termine">
${kommend.map(a => personZeile(a, werke, haeuser, true)).join('\n')}
        </ul>
      </section>` : ''}
      ${vergangen.length ? `<section>
        <h2>Vergangene Abende</h2>
        <ul class="termine">
${vergangen.map(a => personZeile(a, werke, haeuser, false)).join('\n')}
        </ul>
      </section>` : ''}
      <p class="klein">Angaben der Häuser, Umbesetzungen vorbehalten. Wer ${maske(p.name)} schon erlebt hat, kann den Abend in OpernLog festhalten und bewerten.</p>
    </article>`,
    });
}

function uebersicht({ titel, h1, text, art, eintraege, beschreibung }) {
    return seite({
        titel, beschreibung,
        url: `${SEITE}/${ORDNER[art]}/`,
        app: '/',
        krumen: brotkrumen(art),
        inhalt: `
    <article>
      <h1>${maske(h1)}</h1>
      <p>${maske(text)}</p>
      <ul class="liste">
${eintraege.map(e => `        <li><a href="${adresse(art, e.id)}">${maske(e.name)}</a>${e.zusatz ? ` <span class="ort">${maske(e.zusatz)}</span>` : ''}</li>`).join('\n')}
      </ul>
    </article>`,
    });
}

const nachName = (a, b) => a.name.localeCompare(b.name, 'de');

/**
 * Alle Seiten: Map von Pfad (relativ zur Wurzel) auf HTML, dazu die Sitemap.
 */
export function seitenErzeugen({ werke = operas, haeuser = operaHouses, komponisten = composers, plan = spielplan, stand = SPIELPLAN_STAND, texte = werkTexteLesen(), besetzung = besetzungLesen(), heute = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date()) } = {}) {
    const termine = termineAb(stand, plan, besetzung);
    const werkMap = new Map(werke.map(w => [w.id, w]));
    const hausMap = new Map(haeuser.map(h => [h.id, h]));
    const werkeVon = new Map();
    for (const w of werke) if (w.composer) werkeVon.set(w.composer, [...(werkeVon.get(w.composer) || []), w]);
    for (const liste of werkeVon.values()) liste.sort((a, b) => (a.yearComposed || 0) - (b.yearComposed || 0));
    const komponistenMitWerken = komponisten.filter(k => werkeVon.has(k.name));

    const seiten = new Map();
    for (const w of werke) seiten.set(`${ORDNER.werk}/${w.id}/index.html`, werkSeite(w, { termine, haeuser: hausMap, stand, text: eigenerWerkText(w) || texte.get(w.id) || null }));
    const staedte = new Map();
    for (const h of haeuser) if (h.city) staedte.set(h.city, [...(staedte.get(h.city) || []), h]);
    for (const h of haeuser) seiten.set(`${ORDNER.haus}/${h.id}/index.html`, hausSeite(h, { termine, werke: werkMap, stand, mitStadt: (staedte.get(h.city) || []).length > 1 }));
    for (const [stadt, liste] of staedte) {
        seiten.set(`${ORDNER.stadt}/${stadtId(stadt)}/index.html`, stadtSeite(stadt, { haeuser: [...liste].sort(nachName), termine, werke: werkMap, stand }));
    }
    for (const k of komponistenMitWerken) seiten.set(`${ORDNER.komponist}/${k.id}/index.html`, komponistSeite(k, { werkeVon, termine }));
    const personen = [...personenAus(besetzungsAbende(besetzung, plan)).values()]
        .filter(p => p.abende.some(a => werkMap.has(a.t.werk) && hausMap.has(a.t.haus)));
    for (const p of personen) seiten.set(`${ORDNER.person}/${p.id}/index.html`, personSeite(p, { werke: werkMap, haeuser: hausMap, stand, heute: heute > stand ? heute : stand }));

    seiten.set(`${ORDNER.werk}/index.html`, uebersicht({
        titel: 'Opern von A bis Z – Termine und Spielpläne | OpernLog',
        h1: 'Opern von A bis Z',
        text: `${werke.length} Opern mit ihren aktuellen Terminen an Häusern in Deutschland, Österreich und der Schweiz.`,
        beschreibung: `${werke.length} Opern von A bis Z mit aktuellen Terminen an über 90 Opernhäusern in Deutschland, Österreich und der Schweiz.`,
        art: 'werk',
        eintraege: werke.map(w => ({ id: w.id, name: w.title, zusatz: w.composer })).sort(nachName),
    }));
    seiten.set(`${ORDNER.haus}/index.html`, uebersicht({
        titel: 'Opernhäuser in Deutschland, Österreich und der Schweiz | OpernLog',
        h1: 'Opernhäuser',
        text: `${haeuser.length} Häuser, deren Spielpläne OpernLog jeden Monat liest.`,
        beschreibung: `${haeuser.length} Opernhäuser in Deutschland, Österreich und der Schweiz mit ihrem aktuellen Opernspielplan.`,
        art: 'haus',
        eintraege: haeuser.map(h => ({ id: h.id, name: h.name, zusatz: h.city })).sort(nachName),
    }));
    const abendeIn = (liste) => termine.filter(t => liste.some(h => h.id === t.haus) && werkMap.has(t.werk)).length;
    seiten.set(`${ORDNER.stadt}/index.html`, uebersicht({
        titel: 'Oper nach Städten – Spielpläne in Deutschland, Österreich und der Schweiz | OpernLog',
        h1: 'Oper nach Städten',
        text: `${staedte.size} Städte mit ihren Opernhäusern und allen kommenden Opernabenden.`,
        beschreibung: `Opernspielpläne nach Städten: ${staedte.size} Städte in Deutschland, Österreich und der Schweiz mit allen kommenden Opernabenden.`,
        art: 'stadt',
        eintraege: [...staedte].map(([stadt, liste]) => {
            const n = abendeIn(liste);
            return { id: stadtId(stadt), name: stadt, zusatz: n ? `${n} ${n === 1 ? 'Abend' : 'Abende'}` : '' };
        }).sort(nachName),
    }));
    seiten.set(`${ORDNER.komponist}/index.html`, uebersicht({
        titel: 'Komponisten und ihre Opern | OpernLog',
        h1: 'Komponisten',
        text: 'Wer die Opern im Katalog geschrieben hat – mit ihren Werken und aktuellen Terminen.',
        beschreibung: `${komponistenMitWerken.length} Komponisten und ihre Opern, mit aktuellen Terminen in Deutschland, Österreich und der Schweiz.`,
        art: 'komponist',
        eintraege: komponistenMitWerken.map(k => ({ id: k.id, name: k.name })).sort(nachName),
    }));

    seiten.set(`${ORDNER.person}/index.html`, uebersicht({
        titel: 'Sängerinnen, Sänger, Dirigenten – wer wo singt | OpernLog',
        h1: 'Mitwirkende',
        text: `${personen.length} Sängerinnen, Sänger, Dirigentinnen, Dirigenten und Regieteams mit ihren kommenden Abenden – nach den Besetzungen, die die Häuser veröffentlichen.`,
        beschreibung: `Wer singt wo? ${personen.length} Mitwirkende mit ihren kommenden Opernabenden, nach den Besetzungen der Häuser in Deutschland.`,
        art: 'person',
        eintraege: personen.map(p => ({ id: p.id, name: p.name, zusatz: `${p.abende.length} ${p.abende.length === 1 ? 'Abend' : 'Abende'}` })),
    }));

    // In die Sitemap nur Seiten, die ihre eigene Hauptadresse sind.
    const anderswo = new Set([...staedte].filter(([, liste]) => stadtMitEinemHaus(liste)).map(([stadt]) => `${ORDNER.stadt}/${stadtId(stadt)}/index.html`));
    const adressen = [`${SEITE}/`, ...[...seiten.keys()].filter(p => !anderswo.has(p)).map(p => `${SEITE}/${p.replace(/index\.html$/, '')}`)];
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${adressen.map(a => `  <url>\n    <loc>${maske(a)}</loc>\n    <lastmod>${stand}</lastmod>\n  </url>`).join('\n')}
</urlset>
`;
    return { seiten, sitemap };
}

/** Schreibt alles; vorher werden die alten Seiten entfernt (ein Werk kann verschwinden). */
export function seitenSchreiben({ seiten, sitemap }, wurzel = WURZEL) {
    for (const ordner of Object.values(ORDNER)) fs.rmSync(path.join(wurzel, ordner), { recursive: true, force: true });
    for (const [pfad, html] of seiten) {
        const ziel = path.join(wurzel, pfad);
        fs.mkdirSync(path.dirname(ziel), { recursive: true });
        fs.writeFileSync(ziel, html);
    }
    fs.writeFileSync(path.join(wurzel, 'sitemap.xml'), sitemap);
    return seiten.size;
}

/** Die Einträge, die der Admin in der App angelegt hat, mit dazunehmen. */
export async function katalogMitDatenbank() {
    const config = fs.readFileSync(path.join(WURZEL, 'src/config.js'), 'utf8');
    const url = config.match(/SUPABASE_URL = '([^']+)'/)?.[1];
    const schluessel = config.match(/SUPABASE_ANON_KEY = '([^']+)'/)?.[1];
    const holen = async (tabelle) => {
        const r = await fetch(`${url}/rest/v1/${tabelle}?select=*`, { headers: { apikey: schluessel, Authorization: `Bearer ${schluessel}` } });
        if (!r.ok) throw new Error(`${tabelle}: HTTP ${r.status}`);
        return r.json();
    };
    const { uebernehmen } = await import('../../src/data/katalogZusatz.js');
    const [werke, haeuser, komponisten] = await Promise.all(['catalog_operas', 'catalog_houses', 'catalog_composers'].map(holen));
    return uebernehmen({ werke, haeuser, komponisten });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    if (!process.argv.includes('--ohne-db')) {
        try {
            const dazu = await katalogMitDatenbank();
            console.log(`Aus der Datenbank: ${dazu.werke} Werke, ${dazu.haeuser} Häuser, ${dazu.komponisten} Komponisten.`);
        } catch (e) {
            // Lieber ohne die Einträge aus der Datenbank als gar nicht – ihre
            // Seiten fehlen dann bis zum nächsten Lauf.
            console.warn(`Datenbank nicht erreichbar (${e.message}) – nur der Katalog im Repo.`);
        }
    }
    const n = seitenSchreiben(seitenErzeugen());
    console.log(`${n} Seiten unter ${Object.values(ORDNER).join('/, ')}/ und sitemap.xml geschrieben.`);
}
