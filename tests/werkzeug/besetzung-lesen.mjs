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
// Komische Oper Berlin (seit 23.11.2026): Die Stückseite listet die
// kommenden Termine (nextperformance) mit einer performance-id; "Besetzung"
// lädt je Termin /callbacks/get-cast-and-crew.json?performanceId=…&baselink=…
// nach (JSON mit HTML: castcrew__col--crew und --cast). Steht eine Rolle noch
// nicht fest, nennt das Haus Kandidaten mit Schrägstrich ("Tante: Paula
// Rummel / Sabine Hill"). Hat dieselbe Rolle an einem anderen Termin nur
// einen Namen, ist das so ein offener Fall – die Rolle bleibt dann weg.
// Rollen, die immer mehrere Namen tragen (Darsteller), bleiben.
//
// Staatsoper Unter den Linden (seit 23.11.2026): Die Stückseite hat je
// Termin ein Feld (tabs__panel) mit <time itemprop="startDate">"Freitag,
// 28. Mai 2027 19.00 Uhr" und der Besetzung, gegliedert durch Kommentare:
// "Leitung & Technik", "Künstler" (die Rollen), "Kollektive" (Chor,
// Orchester – bleiben weg).
//
// Deutsche Oper Berlin (seit 23.11.2026): Die Stückseite listet die
// kommenden Termine als furtherevent_<id>_detail mit "Do 4.3.27, 19:30" und
// je Termin Leitung (staff-furtherevent_<id>) und Besetzung
// (ensemble-furtherevent_<id>) aus person-role/person-names. Für schon
// gespielte Termine steht die Besetzung zwar noch da, das Datum aber nicht –
// die bleiben weg.
//
// Oper Frankfurt (seit 23.11.2026): Die Stückseite hat einen Kalender mit
// einem Link je Termin (?id_datum=…); erst die Seite des Termins zeigt unter
// "Ihre Auswahl" Datum und Beginn und unter #castdata zwei Listen: Leitung
// und Rollen. Steht eine Rolle noch nicht fest, stehen Namen mit
// Schrägstrich ("Ramfis: Andreas Bauer Kanabas / Kihwan Sim") – die Rolle
// bleibt dann weg. Chor und Orchester stehen außerhalb der Listen.
//
// Hamburgische Staatsoper (seit 24.11.2026): Der Kalender (/de/kalender/oper)
// enthält alle Monate der Spielzeit auf einer Seite, je Tag (data-day) die
// Vorstellungen mit Titel, Komponist, Beginn und, aufklappbar, Musikalische
// Leitung, Inszenierung und "Mit: …" – die Namen dieses Termins, aber ohne
// Rollen. Die Rollen stehen auf der Stückseite (Besetzung), bei
// wechselnder Besetzung mit den Terminen je Name ("3.1.27 / 5.1.27"). Beides
// zusammen ergibt Name und Rolle je Abend; Chor und Orchester bleiben weg.
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

const ENTITAETEN = { amp: '&', nbsp: ' ', quot: '"', apos: "'", lt: '<', gt: '>', shy: '\u00ad', '#039': "'" };
const entschluesseln = (t) => String(t ?? '')
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (z, n) => n[0] === '#'
        ? (ENTITAETEN[n] ?? String.fromCodePoint(n[1].toLowerCase() === 'x' ? parseInt(n.slice(2), 16) : parseInt(n.slice(1), 10)))
        : (ENTITAETEN[n.toLowerCase()] ?? z));
// Weiche Trennstriche (&shy;) gehören nicht zum Namen.
const reinerText = (html) => entschluesseln(String(html ?? '').replace(/<[^>]+>/g, ' ')).replace(/\u00ad/g, '').replace(/\s+/g, ' ').trim();

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

// ── Komische Oper Berlin ────────────────────────────────────────────────

const MONATE = { jan: '01', feb: '02', 'mär': '03', mar: '03', apr: '04', mai: '05', jun: '06', jul: '07', aug: '08', sep: '09', okt: '10', nov: '11', dez: '12' };
const ohneTrennung = (t) => String(t ?? '').replace(/\u00ad/g, '');

/** Die kommenden Termine einer Stückseite: [{ datum, zeit, id, baselink }]. */
export function komischeTermine(html) {
    return String(html ?? '').split(/<div class="nextperformance /).slice(1).map((teil) => {
        const datum = reinerText(teil.match(/class="nextperformance__date">([\s\S]*?)<\/div>/)?.[1]);
        const m = datum.match(/^(\d{1,2})\.\s*([a-zä]{3})\w*\.?\s+(\d{4})$/i);
        const zeit = reinerText(teil.match(/class="nextperformance__time">([\s\S]*?)<\/div>/)?.[1]).match(/\d{1,2}:\d{2}/)?.[0];
        const id = teil.match(/data-performance-id="(\d+)"/)?.[1];
        const baselink = entschluesseln(teil.match(/data-baselink="([^"]+)"/)?.[1] || '');
        const monat = m && MONATE[m[2].toLowerCase()];
        if (!m || !monat || !id) return null;
        return { datum: `${m[3]}-${monat}-${m[1].padStart(2, '0')}`, zeit: zeit ? zeit.padStart(5, '0') : null, id, baselink };
    }).filter(Boolean);
}

/** Leitung und Rollen aus dem HTML von get-cast-and-crew: { team, rollen } als [{ rolle, namen }]. */
export function komischeBesetzung(html) {
    const spalte = (art) => {
        const teil = String(html ?? '').split(`castcrew__col--${art}`)[1]?.split(/castcrew__col castcrew__col--/)[0] || '';
        return teil.split(/<div class="castcrew__item">/).slice(1).map((item) => ({
            rolle: ohneTrennung(reinerText(item.match(/class="castcrew__role">([\s\S]*?)<\/div>/)?.[1])),
            namen: [...item.matchAll(/class="ci-\d+-\d+">([\s\S]*?)<\/(?:a|span)>/g)].map(n => ohneTrennung(reinerText(n[1]))).filter(Boolean),
        })).filter(z => z.rolle && z.namen.length);
    };
    return { team: spalte('crew'), rollen: spalte('cast') };
}

const GRUPPE = /^(chor|chöre|kinderchor|orchester|statisterie|komparserie)/i;

/**
 * Die Abende einer Produktion zusammensetzen. besetzungen: [{ datum, zeit, team, rollen }].
 * Eine Rolle mit mehreren Namen, die an einem anderen Termin nur einen hat,
 * steht noch nicht fest und bleibt weg.
 */
export function komischeAbende(besetzungen) {
    const einzeln = new Set(besetzungen.flatMap(b => b.rollen.filter(r => r.namen.length === 1).map(r => r.rolle)));
    return besetzungen.map(({ datum, zeit, team, rollen }) => {
        const wer = (muster) => team.filter(z => muster.test(z.rolle)).flatMap(z => z.namen);
        const abend = {};
        if (zeit) abend.zeit = zeit;
        const dirigent = wer(/^musikalische leitung$|^dirigent/i);
        const regie = wer(/^inszenierung$|^regie$/i);
        const besetzung = rollen
            .filter(r => !GRUPPE.test(r.rolle) && !(r.namen.length > 1 && einzeln.has(r.rolle)))
            .flatMap(r => r.namen.map(name => ({ rolle: r.rolle, name })));
        if (dirigent.length) abend.dirigent = dirigent.join(', ');
        if (regie.length) abend.regie = regie.join(', ');
        if (besetzung.length) abend.besetzung = besetzung;
        return abend.dirigent || abend.regie || abend.besetzung ? { datum, abend } : null;
    }).filter(Boolean);
}

async function komischeLesen() {
    const basis = 'https://www.komische-oper-berlin.de';
    const seiten = [...new Map(spielplan.filter(e => e.haus === 'komische-oper-berlin' && e.url).map(e => [e.url, e.werk])).entries()];
    const abende = {};
    let abrufe = 0;
    for (const [url, werk] of seiten) {
        const r = await fetch(url, { headers: { 'User-Agent': KENNUNG, Accept: 'text/html' } });
        abrufe++;
        if (!r.ok) { console.warn(`${url}: HTTP ${r.status}`); continue; }
        const besetzungen = [];
        for (const t of komischeTermine(await r.text())) {
            await pause(1000);
            const adresse = `${basis}/callbacks/get-cast-and-crew.json?performanceId=${encodeURIComponent(t.id)}&baselink=${encodeURIComponent(t.baselink)}`;
            const c = await fetch(adresse, { headers: { 'User-Agent': KENNUNG, Accept: 'application/json' } });
            abrufe++;
            if (!c.ok) continue;
            const d = await c.json();
            if (d.ResultCode !== 'Ok') continue;
            besetzungen.push({ datum: t.datum, zeit: t.zeit, ...komischeBesetzung(d.Html) });
        }
        for (const { datum, abend } of komischeAbende(besetzungen)) abende[`${werk}|${datum}`] = abend;
        await pause(1500);
    }
    return { abende, seiten: abrufe };
}

// ── Staatsoper Unter den Linden ─────────────────────────────────────────

const MONATE_LANG = { januar: '01', februar: '02', 'märz': '03', april: '04', mai: '05', juni: '06', juli: '07', august: '08', september: '09', oktober: '10', november: '11', dezember: '12' };

/** Die Einträge einer Besetzungsliste der Staatsoper: [{ rolle, namen }]. */
function staatsoperListe(html) {
    return String(html ?? '').split(/<li class="besetzung__item/).slice(1).map((item) => ({
        rolle: reinerText(item.match(/class="besetzung__rolle">([\s\S]*?)<\/span>/)?.[1]).replace(/:\s*$/, ''),
        namen: [...item.matchAll(/class="besetzung__beteiligte-liste-item">([\s\S]*?)<\/(?:div|li)>/g)].map(m => reinerText(m[1]).replace(/,\s*$/, '')).filter(Boolean),
    })).filter(z => z.rolle && z.namen.length);
}

/** Alle Termine einer Stückseite der Staatsoper Berlin mit ihren Mitwirkenden. */
export function staatsoperAbende(html) {
    const abende = [];
    for (const teil of String(html ?? '').split(/class="tabs__panel js-tabs-panel/).slice(1)) {
        const zeit = reinerText(teil.match(/<time[^>]*itemprop="startDate"[^>]*>([\s\S]*?)<\/time>/)?.[1]);
        const m = zeit.match(/(\d{1,2})\.\s*([a-zäöü]+)\s+(\d{4})(?:\s+(\d{1,2})[.:](\d{2}))?/i);
        const monat = m && MONATE_LANG[m[2].toLowerCase()];
        if (!m || !monat) continue;
        const besetzung = teil.split(/id="besetzung-/)[1] || '';
        const leitung = besetzung.split('<!-- Künstler -->')[0].split('<!-- Leitung &amp; Technik -->')[1] || '';
        const kuenstler = (besetzung.split('<!-- Künstler -->')[1] || '').split('<!-- Kollektive -->')[0];
        const team = staatsoperListe(leitung);
        const wer = (muster) => team.filter(z => muster.test(z.rolle)).flatMap(z => z.namen);
        const abend = {};
        if (m[4]) abend.zeit = `${m[4].padStart(2, '0')}:${m[5]}`;
        const dirigent = wer(/^musikalische leitung$|^dirigent/i);
        const regie = wer(/^inszenierung$|^regie$/i);
        const rollen = staatsoperListe(kuenstler).filter(z => !GRUPPE.test(z.rolle))
            .flatMap(z => z.namen.map(name => ({ rolle: z.rolle, name })));
        if (dirigent.length) abend.dirigent = dirigent.join(', ');
        if (regie.length) abend.regie = regie.join(', ');
        if (rollen.length) abend.besetzung = rollen;
        if (abend.dirigent || abend.regie || abend.besetzung) {
            abende.push({ datum: `${m[3]}-${monat}-${m[1].padStart(2, '0')}`, abend });
        }
    }
    return abende;
}

async function staatsoperLesen() {
    const seiten = [...new Map(spielplan.filter(e => e.haus === 'staatsoper-berlin' && e.url).map(e => [e.url, e.werk])).entries()];
    const abende = {};
    for (const [url, werk] of seiten) {
        const r = await fetch(url, { headers: { 'User-Agent': KENNUNG, Accept: 'text/html' } });
        if (!r.ok) { console.warn(`${url}: HTTP ${r.status}`); continue; }
        for (const { datum, abend } of staatsoperAbende(await r.text())) abende[`${werk}|${datum}`] = abend;
        await pause(1500);
    }
    return { abende, seiten: seiten.length };
}

// ── Deutsche Oper Berlin ────────────────────────────────────────────────

/** Die Einträge eines Leitungs- oder Besetzungsblocks: [{ rolle, namen }]. */
function deutscheListe(html) {
    return [...String(html ?? '').matchAll(/<span class="person-role">([\s\S]*?)<\/span>\s*<span class="person-names">([\s\S]*?)<\/span>/g)].map(([, rolle, namen]) => ({
        rolle: reinerText(rolle),
        namen: [...namen.matchAll(/<div class="person_wrapper">([\s\S]*?)<\/div>/g)].map(m => reinerText(m[1])).filter(Boolean),
    })).filter(z => z.rolle && z.namen.length);
}

/** Alle kommenden Termine einer Stückseite der Deutschen Oper Berlin mit ihren Mitwirkenden. */
export function deutscheAbende(html) {
    const seite = String(html ?? '');
    const block = (art, id) => {
        const anfang = seite.indexOf(`id="${art}-furtherevent_${id}"`);
        if (anfang === -1) return '';
        // Bis zum nächsten Block eines Termins (Leitung oder Besetzung).
        const rest = seite.slice(anfang + 20).search(/id="(?:staff|ensemble)-furtherevent_/);
        const ende = rest === -1 ? -1 : anfang + 20 + rest;
        return seite.slice(anfang, ende === -1 ? undefined : ende);
    };
    const abende = [];
    for (const [, id, datum] of seite.matchAll(/id="furtherevent_(\d+)_detail"[\s\S]*?<span class="date">([^<]*)<\/span>/g)) {
        const m = reinerText(datum).match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})(?:,\s*(\d{1,2}):(\d{2}))?/);
        if (!m) continue;
        const jahr = m[3].length === 2 ? `20${m[3]}` : m[3];
        const team = deutscheListe(block('staff', id));
        const wer = (muster) => team.filter(z => muster.test(z.rolle)).flatMap(z => z.namen);
        const abend = {};
        if (m[4]) abend.zeit = `${m[4].padStart(2, '0')}:${m[5]}`;
        const dirigent = wer(/^musikalische leitung$|^dirigent/i);
        const regie = wer(/^inszenierung$|^regie$/i);
        const besetzung = deutscheListe(block('ensemble', id))
            .filter(z => !GRUPPE.test(z.rolle))
            // "Solisten des Tölzer Knabenchores" ist keine einzelne Person.
            .flatMap(z => z.namen.filter(n => !/chor|orchester|kapelle/i.test(n)).map(name => ({ rolle: z.rolle, name })));
        if (dirigent.length) abend.dirigent = dirigent.join(', ');
        if (regie.length) abend.regie = regie.join(', ');
        if (besetzung.length) abend.besetzung = besetzung;
        if (abend.dirigent || abend.regie || abend.besetzung) {
            abende.push({ datum: `${jahr}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`, abend });
        }
    }
    return abende;
}

async function deutscheLesen() {
    const seiten = [...new Map(spielplan.filter(e => e.haus === 'deutsche-oper-berlin' && e.url).map(e => [e.url, e.werk])).entries()];
    const abende = {};
    for (const [url, werk] of seiten) {
        const r = await fetch(url, { headers: { 'User-Agent': KENNUNG, Accept: 'text/html' } });
        if (!r.ok) { console.warn(`${url}: HTTP ${r.status}`); continue; }
        for (const { datum, abend } of deutscheAbende(await r.text())) abende[`${werk}|${datum}`] = abend;
        await pause(1500);
    }
    return { abende, seiten: seiten.length };
}

// ── Oper Frankfurt ──────────────────────────────────────────────────────

/** Die Termin-Links im Kalender einer Stückseite: [id_datum, …]. */
export function frankfurtTermine(html) {
    return [...new Set([...String(html ?? '').matchAll(/href="[^"]*[?&]id_datum=(\d+)/g)].map(m => m[1]))];
}

/** dt/dd-Paare einer Liste: [{ rolle, text }]. */
const dtDd = (html) => [...String(html ?? '').matchAll(/<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)]
    .map(([, dt, dd]) => ({ rolle: reinerText(dt), text: reinerText(dd.replace(/<span class="deg">[\s\S]*?<\/span>/g, '')) }));

/** Der Termin einer Terminseite der Oper Frankfurt mit seinen Mitwirkenden – oder null. */
export function frankfurtAbend(html) {
    const seite = String(html ?? '');
    const auswahl = seite.split('Ihre Auswahl')[1]?.split('id="castdata"')[0] || '';
    const angaben = dtDd(auswahl);
    const m = angaben.map(a => a.text).join(' ').match(/(\d{1,2})\.\s*([a-zäöü]+)\s+(\d{4})/i);
    const monat = m && MONATE_LANG[m[2].toLowerCase()];
    if (!m || !monat) return null;
    const beginn = angaben.find(a => /^beginn$/i.test(a.rolle))?.text.match(/(\d{1,2})[.:](\d{2})/);
    const listen = (seite.split('id="castdata"')[1]?.split('</section>')[0] || '').split(/<dl class="dl-list[^"]*">/).slice(1);
    const team = dtDd(listen[0]);
    const rollen = dtDd(listen.slice(1).join(''));
    const wer = (muster) => team.filter(z => muster.test(z.rolle)).map(z => z.text).filter(Boolean);
    const abend = {};
    if (beginn) abend.zeit = `${beginn[1].padStart(2, '0')}:${beginn[2]}`;
    const dirigent = wer(/^musikalische leitung$|^dirigent/i);
    const regie = wer(/^inszenierung$|^regie$/i);
    // Mit Schrägstrich: noch nicht entschieden, wer singt.
    const besetzung = rollen.filter(z => z.text && !z.text.includes('/') && !GRUPPE.test(z.rolle))
        .map(z => ({ rolle: z.rolle, name: z.text }));
    if (dirigent.length && !dirigent.some(d => d.includes('/'))) abend.dirigent = dirigent.join(', ');
    if (regie.length) abend.regie = regie.join(', ');
    if (besetzung.length) abend.besetzung = besetzung;
    if (!abend.dirigent && !abend.regie && !abend.besetzung) return null;
    return { datum: `${m[3]}-${monat}-${m[1].padStart(2, '0')}`, abend };
}

async function frankfurtLesen() {
    const seiten = [...new Map(spielplan.filter(e => e.haus === 'oper-frankfurt' && e.url).map(e => [e.url, e.werk])).entries()];
    const abende = {};
    let abrufe = 0;
    const holen = async (url) => {
        abrufe++;
        const r = await fetch(url, { headers: { 'User-Agent': KENNUNG, Accept: 'text/html' } });
        if (!r.ok) { console.warn(`${url}: HTTP ${r.status}`); return null; }
        return r.text();
    };
    for (const [url, werk] of seiten) {
        const stueck = await holen(url);
        if (!stueck) continue;
        for (const id of frankfurtTermine(stueck)) {
            await pause(1000);
            const termin = await holen(`${url.split('?')[0]}?id_datum=${id}`);
            const a = termin && frankfurtAbend(termin);
            if (a) abende[`${werk}|${a.datum}`] = a.abend;
        }
        await pause(1500);
    }
    return { abende, seiten: abrufe };
}

// ── Hamburgische Staatsoper ─────────────────────────────────────────────

const HH = 'https://www.die-hamburgische-staatsoper.de';
const HH_GRUPPE = /chor(e|es)?\b|orchester|statisterie|komparserie|musiker/i;
const hhPerson = (href) => String(href ?? '').match(/\/personen\/(\d+)-/)?.[1] || '';

/**
 * Die Opernabende des Kalenders: [{ datum, zeit, titel, komponist, stueck,
 * dirigent, regie, mit: [{ id, name }] }]. stueck ist der Pfad der Stückseite.
 */
export function hamburgKalender(html) {
    const tage = String(html ?? '').split(/<div class="cal__day" data-day="/).slice(1);
    return tage.flatMap(tag => {
        const datum = tag.slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return [];
        return tag.split(/<li class="event-entry">/).slice(1).map(e => {
            const stueck = e.match(/class="event__title">\s*<a href="([^"]+)"/)?.[1] || '';
            const titel = reinerText(e.match(/class="event__title">([\s\S]*?)<\/div>/)?.[1]);
            const komponist = reinerText(e.match(/class="event__subtitle">([\s\S]*?)<\/div>/)?.[1]);
            const zeit = e.match(/<span class="event__datetime">\s*(\d{1,2}):(\d{2})/);
            const team = (muster) => [...e.matchAll(/<li class="production-infos__item">\s*<span class="label">([\s\S]*?)<\/span>\s*<span class="content">([\s\S]*?)<\/span>\s*<\/li>/g)]
                .filter(([, label]) => muster.test(reinerText(label)))
                .map(([, , inhalt]) => reinerText(inhalt)).filter(Boolean);
            const mitText = e.match(/<p>\s*Mit:([\s\S]*?)<\/p>/)?.[1] || '';
            const mit = [...mitText.matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
                .map(([, href, name]) => ({ id: hhPerson(href), name: reinerText(name) }))
                .filter(p => p.name && !HH_GRUPPE.test(p.name));
            return {
                datum, titel, komponist, stueck,
                zeit: zeit ? `${zeit[1].padStart(2, '0')}:${zeit[2]}` : '',
                dirigent: team(/^musikalische leitung$|^dirigent/i).join(', '),
                regie: team(/^inszenierung$|^regie$/i).join(', '),
                mit,
            };
        });
    });
}

/** "3.1.27" → "2027-01-03". */
const hhDatum = (t) => {
    const m = String(t).match(/(\d{1,2})\.(\d{1,2})\.(\d{2})/);
    return m ? `20${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : '';
};

/** Die Rollen einer Stückseite: [{ rolle, id, daten: [iso…] | null }] – null heißt an allen Terminen. */
export function hamburgRollen(html) {
    const block = String(html ?? '').split('data-section="besetzung"')[1]?.split('data-section="')[0] || '';
    return [...block.matchAll(/<li class="production-infos__item"[^>]*>\s*<div class="label">([\s\S]*?)<\/div>([\s\S]*?)(?=<li class="production-infos__item"|<\/ul>\s*<\/div>\s*<\/div>|$)/g)]
        .flatMap(([, label, rest]) => {
            const rolle = reinerText(label);
            return rest.split(/<div class="content content--person">/).slice(1).map(p => {
                const daten = [...p.matchAll(/<li class="toggable__element[^"]*">\s*<span>([^<]*)<\/span>/g)].map(m => hhDatum(m[1])).filter(Boolean);
                return { rolle, id: hhPerson(p.match(/href="([^"]+)"/)?.[1]), daten: daten.length ? daten : null };
            });
        })
        .filter(r => r.id);
}

/** Ein Kalenderabend mit den Rollen seiner Stückseite in unserer Form – oder null. */
export function hamburgAbend(k, rollen = []) {
    const besetzung = k.mit.map(p => {
        const passend = rollen.filter(r => r.id === p.id && !GRUPPE.test(r.rolle) && (!r.daten || r.daten.includes(k.datum)));
        const rolle = [...new Set(passend.map(r => r.rolle))].join(', ');
        return { rolle, name: p.name };
    });
    const abend = {};
    if (k.zeit) abend.zeit = k.zeit;
    if (k.dirigent) abend.dirigent = k.dirigent;
    if (k.regie) abend.regie = k.regie;
    if (besetzung.length) abend.besetzung = besetzung;
    return abend.dirigent || abend.regie || abend.besetzung ? abend : null;
}

async function hamburgLesen() {
    const holen = async (url) => {
        const r = await fetch(url, { headers: { 'User-Agent': KENNUNG, Accept: 'text/html' } });
        if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
        return r.text();
    };
    const verzeichnis = werkVerzeichnis();
    const kalender = hamburgKalender(await holen(`${HH}/de/kalender/oper`)).filter(k => {
        const werk = verzeichnis.get(titelSchluessel(k.titel));
        if (!werk) return false;
        // Nur der Anfang des Nachnamens, wie bei Leipzig.
        const nachname = titelSchluessel(String(werk.composer || '').split(/\s+/).pop()).slice(0, 5);
        if (k.komponist && nachname && !titelSchluessel(k.komponist).includes(nachname)) return false;
        k.werk = werk.id;
        return true;
    });
    const rollen = new Map();
    let seiten = 1;
    for (const stueck of new Set(kalender.map(k => k.stueck).filter(s => s.startsWith('/de/programm/')))) {
        await pause(1500);
        try { rollen.set(stueck, hamburgRollen(await holen(HH + stueck))); seiten++; }
        catch (e) { console.warn(e.message); }
    }
    const abende = {};
    for (const k of kalender) {
        const abend = hamburgAbend(k, rollen.get(k.stueck));
        if (abend) abende[`${k.werk}|${k.datum}`] = abend;
    }
    return { abende, seiten };
}

export const LESER = {
    'oper-leipzig': { lesen: leipzigLesen, quelle: 'https://www.oper-leipzig.de/de/programm' },
    'semperoper': { lesen: semperLesen, quelle: 'https://www.semperoper.de/spielplan.html' },
    'komische-oper-berlin': { lesen: komischeLesen, quelle: 'https://www.komische-oper-berlin.de/spielplan/' },
    'staatsoper-berlin': { lesen: staatsoperLesen, quelle: 'https://www.staatsoper-berlin.de/de/spielplan/' },
    'deutsche-oper-berlin': { lesen: deutscheLesen, quelle: 'https://deutscheoperberlin.de/de_DE/calendar' },
    'oper-frankfurt': { lesen: frankfurtLesen, quelle: 'https://oper-frankfurt.de/de/spielplan/' },
    'hamburgische-staatsoper': { lesen: hamburgLesen, quelle: 'https://www.die-hamburgische-staatsoper.de/de/kalender/oper' },
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
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
