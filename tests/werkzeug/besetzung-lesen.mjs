// Liest Dirigat, Regie und Besetzung je Vorstellung aus den Seiten der Häuser
// (Beta, Jonas 23.11.2026) – damit "Besuch loggen" sie vorschlagen kann.
//
//   node tests/werkzeug/besetzung-lesen.mjs [haus-id …] [--trocken]
//
// Zwei Häuser, zwei Wege:
//
// Oper Leipzig: Ihre Website holt den Spielplan aus einer
// eigenen Schnittstelle (/de/api/events/?page=N), und dort steht zu jeder
// Vorstellung das Leitungsteam (productionteam_objs: "Musikalische Leitung",
// "Inszenierung" …) und die Besetzung mit Rollen (cast_objs) – genau das,
// was auf der Seite unter "Besetzung" aufklappt, auch dort je Termin
// verschieden. Die Schnittstelle liefert nur kommende Vorstellungen; was
// schon einmal gelesen wurde, bleibt deshalb in der Datei stehen (bis 400
// Tage zurück), denn geloggt wird meist hinterher.
//
// Semperoper Dresden (seit 23.11.2026): keine Schnittstelle, aber jede
// Stückseite listet jeden Termin als eigenen Block (accordion-item
// ni-event-item) mit maschinenlesbarem Datum (<time datetime="…">), darin
// das Leitungsteam (ni-cast-it) und die Rollen (ni-cast-stars) – auch für
// vergangene Termine. Gelesen werden die Stückseiten, auf die der Spielplan
// der App schon verlinkt (src/data/spielplan.js); welches Werk es ist, steht
// damit fest.
//
// Ausgabe: daten/besetzung/<haus>.json
//   { "haus": "oper-leipzig", "stand": "2026-11-23", "quelle": "…",
//     "abende": { "eugen-onegin|2026-11-28": { "zeit": "19:00",
//        "dirigent": "Ivan Repušić", "regie": "Vasily Barkhatov",
//        "besetzung": [{ "rolle": "Tatjana", "name": "Olesya Golovneva" }, …] } } }
// Die App lädt die Datei erst beim Loggen an diesem Haus (src/data/hausBesetzung.js).
//
// Höflich: eine Seite nach der anderen, mit kurzer Pause.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { operas } from '../../src/data/operas.js';
import { ANDERE_TITEL } from './spielplaene-lesen.mjs';
import { spielplan } from '../../src/data/spielplan.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const ORDNER = 'daten/besetzung';
const KENNUNG = 'Mozilla/5.0 (compatible; OpernLog-Spielplan; +https://opernlog.de)';
const AUFHEBEN_TAGE = 400;

/** "Eugen Onegin" und "eugen onegin" sind gleich; Satzzeichen und Akzente zählen nicht. */
export const titelSchluessel = (t) => String(t ?? '').toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();

/** Titel → Werk-Id, aus dem Katalog und den anderen Titeln des Spielplan-Laufs. */
export function werkVerzeichnis(werke = operas, andere = ANDERE_TITEL) {
    const v = new Map();
    for (const w of werke) {
        for (const t of [w.title, ...(w.andereTitel || []), ...(andere[w.id] || [])]) {
            const s = titelSchluessel(t);
            if (s && !v.has(s)) v.set(s, w);
        }
    }
    return v;
}

const personName = (p) => [p.first_name, p.last_name].map(x => String(x ?? '').trim()).filter(Boolean).join(' ');
/** Einzelne Menschen; Chor, Orchester und Komparserie stehen ohne Vornamen da. */
const einzelne = (personen) => (personen || []).filter(p => String(p.first_name ?? '').trim()).map(personName).filter(Boolean);

/** Eine Vorstellung aus der Schnittstelle der Oper Leipzig, in unserer Form – oder null. */
export function leipzigAbend(e, verzeichnis) {
    const werk = verzeichnis.get(titelSchluessel(e.title));
    if (!werk) return null;
    // Derselbe Titel kann ein Ballett oder ein Schauspiel sein: der Komponist
    // muss stimmen, wenn das Haus einen nennt.
    // Nur der Anfang des Nachnamens: "Tschaikowski" und "Tschaikowsky".
    const nachname = titelSchluessel(String(werk.composer || '').split(/\s+/).pop()).slice(0, 5);
    if (e.writer && nachname && !titelSchluessel(e.writer).includes(nachname)) return null;
    const m = String(e.start || '').match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
    if (!m) return null;
    const team = (rolle) => (e.productionteam_objs || [])
        .filter(t => new RegExp(rolle, 'i').test(t.role_obj?.name || ''))
        .flatMap(t => einzelne(t.persons_objs));
    const besetzung = (e.cast_objs || []).flatMap(c => einzelne(c.persons_objs)
        .map(name => ({ rolle: String(c.role_obj?.name || '').trim(), name })));
    const abend = { zeit: m[2] };
    const dirigent = team('^musikalische leitung$|^dirigent');
    const regie = team('^inszenierung$|^regie$');
    if (dirigent.length) abend.dirigent = dirigent.join(', ');
    if (regie.length) abend.regie = regie.join(', ');
    if (besetzung.length) abend.besetzung = besetzung;
    if (!abend.dirigent && !abend.regie && !abend.besetzung) return null;
    return { schluessel: `${werk.id}|${m[1]}`, abend };
}

/** Neu Gelesenes über das Alte legen; Altes bleibt, bis es zu alt ist. */
export function zusammenfuehren(alt = {}, neu = {}, heute) {
    const grenze = new Date(Date.parse(`${heute}T00:00:00Z`) - AUFHEBEN_TAGE * 864e5).toISOString().slice(0, 10);
    const alle = { ...alt, ...neu };
    return Object.fromEntries(Object.entries(alle)
        .filter(([s]) => s.split('|')[1] >= grenze)
        .sort(([a], [b]) => a.split('|')[1].localeCompare(b.split('|')[1]) || a.localeCompare(b)));
}

const pause = (ms) => new Promise(fertig => setTimeout(fertig, ms));

async function leipzigLesen() {
    const verzeichnis = werkVerzeichnis();
    const abende = {};
    let url = 'https://www.oper-leipzig.de/de/api/events/?page=1';
    let seiten = 0;
    while (url && seiten < 80) {
        const r = await fetch(url, { headers: { 'User-Agent': KENNUNG, Accept: 'application/json' } });
        if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
        const d = await r.json();
        for (const e of d.results || []) {
            const a = leipzigAbend(e, verzeichnis);
            if (a) abende[a.schluessel] = a.abend;
        }
        url = d.next;
        seiten++;
        await pause(400);
    }
    return { abende, seiten };
}

// ── Semperoper ──────────────────────────────────────────────────────────

const ENTITAETEN = { amp: '&', nbsp: ' ', quot: '"', apos: "'", lt: '<', gt: '>', '#039': "'" };
const entschluesseln = (t) => String(t ?? '')
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (z, n) => n[0] === '#'
        ? (ENTITAETEN[n] ?? String.fromCodePoint(n[1].toLowerCase() === 'x' ? parseInt(n.slice(2), 16) : parseInt(n.slice(1), 10)))
        : (ENTITAETEN[n.toLowerCase()] ?? z));
const reinerText = (html) => entschluesseln(String(html ?? '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Die Zeilen einer Besetzungsliste: [{ rolle, namen: [...] }]. */
function castListe(html) {
    return [...String(html ?? '').matchAll(/<li>([\s\S]*?)<\/li>/g)].map(([, li]) => {
        const rolle = reinerText(li.match(/class="ni-cast-item-label[^"]*">([\s\S]*?)<\/span>/)?.[1]);
        const namen = [...li.matchAll(/class="[^"]*ni-cast-item-link[^"]*">([\s\S]*?)<\/span>/g)].map(m => reinerText(m[1])).filter(Boolean);
        return { rolle, namen };
    }).filter(z => z.rolle && z.namen.length);
}

/** Alle Termine einer Stückseite der Semperoper mit ihren Mitwirkenden. */
export function semperAbende(html) {
    const teile = String(html ?? '').split(/class="accordion-item ni-event-item/).slice(1);
    const abende = [];
    for (const teil of teile) {
        const zeit = teil.match(/<time[^>]*datetime="(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
        if (!zeit) continue;
        const team = castListe(teil.match(/ni-cast-section ni-cast-it">([\s\S]*?)(?:<div class="ni-cast-additional"|<\/ul>)/)?.[1]);
        const rollen = castListe(teil.match(/ni-cast-section ni-cast-stars">([\s\S]*?)<\/ul>/)?.[1]);
        const wer = (muster) => team.filter(z => muster.test(z.rolle)).flatMap(z => z.namen);
        const abend = { zeit: zeit[2] };
        const dirigent = wer(/^musikalische leitung$|^dirigent/i);
        const regie = wer(/^inszenierung$|^regie$/i);
        const besetzung = rollen.flatMap(z => z.namen.map(name => ({ rolle: z.rolle, name })));
        if (dirigent.length) abend.dirigent = dirigent.join(', ');
        if (regie.length) abend.regie = regie.join(', ');
        if (besetzung.length) abend.besetzung = besetzung;
        if (abend.dirigent || abend.regie || abend.besetzung) abende.push({ datum: zeit[1], abend });
    }
    return abende;
}

async function semperLesen() {
    const seiten = [...new Map(spielplan.filter(e => e.haus === 'semperoper' && e.url).map(e => [e.url, e.werk])).entries()];
    const abende = {};
    for (const [url, werk] of seiten) {
        const r = await fetch(url, { headers: { 'User-Agent': KENNUNG, Accept: 'text/html' } });
        if (!r.ok) { console.warn(`${url}: HTTP ${r.status}`); continue; }
        for (const { datum, abend } of semperAbende(await r.text())) abende[`${werk}|${datum}`] = abend;
        await pause(1500);
    }
    return { abende, seiten: seiten.length };
}

export const LESER = {
    'oper-leipzig': { lesen: leipzigLesen, quelle: 'https://www.oper-leipzig.de/de/programm' },
    'semperoper': { lesen: semperLesen, quelle: 'https://www.semperoper.de/spielplan.html' },
};

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const trocken = process.argv.includes('--trocken');
    const gewaehlt = process.argv.slice(2).filter(a => !a.startsWith('--'));
    const heute = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
    let fehler = 0;
    for (const [haus, { lesen, quelle }] of Object.entries(LESER)) {
        if (gewaehlt.length && !gewaehlt.includes(haus)) continue;
        const ziel = path.join(WURZEL, ORDNER, `${haus}.json`);
        const alt = fs.existsSync(ziel) ? JSON.parse(fs.readFileSync(ziel, 'utf8')).abende : {};
        try {
            const { abende, seiten } = await lesen();
            const datei = { haus, stand: heute, quelle, abende: zusammenfuehren(alt, abende, heute) };
            console.log(`${haus}: ${seiten} Seiten, ${Object.keys(abende).length} Opernabende mit Mitwirkenden gelesen, ${Object.keys(datei.abende).length} in der Datei.`);
            if (!trocken && Object.keys(datei.abende).length) {
                fs.mkdirSync(path.dirname(ziel), { recursive: true });
                fs.writeFileSync(ziel, JSON.stringify(datei, null, 1) + '\n');
            }
        } catch (e) {
            // Ein Haus, das gerade nicht antwortet, behält seine alte Datei.
            console.error(`${haus}: ${e.message}`);
            fehler++;
        }
    }
    if (fehler) process.exitCode = 1;
}
