// Liest Dirigat, Regie und Besetzung je Vorstellung aus den Seiten der Häuser
// (Beta, Jonas 23.11.2026) – damit "Besuch loggen" sie vorschlagen kann.
//
//   node tests/werkzeug/besetzung-lesen.mjs [--trocken]
//
// Bisher nur die Oper Leipzig. Ihre Website holt den Spielplan aus einer
// eigenen Schnittstelle (/de/api/events/?page=N), und dort steht zu jeder
// Vorstellung das Leitungsteam (productionteam_objs: "Musikalische Leitung",
// "Inszenierung" …) und die Besetzung mit Rollen (cast_objs) – genau das,
// was auf der Seite unter "Besetzung" aufklappt, auch dort je Termin
// verschieden. Die Schnittstelle liefert nur kommende Vorstellungen; was
// schon einmal gelesen wurde, bleibt deshalb in der Datei stehen (bis 400
// Tage zurück), denn geloggt wird meist hinterher.
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
        await new Promise(fertig => setTimeout(fertig, 400));
    }
    return { abende, seiten };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    const trocken = process.argv.includes('--trocken');
    const heute = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
    const ziel = path.join(WURZEL, ORDNER, 'oper-leipzig.json');
    const alt = fs.existsSync(ziel) ? JSON.parse(fs.readFileSync(ziel, 'utf8')).abende : {};
    const { abende, seiten } = await leipzigLesen();
    const datei = {
        haus: 'oper-leipzig',
        stand: heute,
        quelle: 'https://www.oper-leipzig.de/de/programm',
        abende: zusammenfuehren(alt, abende, heute),
    };
    console.log(`${seiten} Seiten, ${Object.keys(abende).length} Opernabende mit Mitwirkenden gelesen, ${Object.keys(datei.abende).length} in der Datei.`);
    if (!trocken) {
        fs.mkdirSync(path.dirname(ziel), { recursive: true });
        fs.writeFileSync(ziel, JSON.stringify(datei, null, 1) + '\n');
        console.log(path.relative(WURZEL, ziel));
    }
}
