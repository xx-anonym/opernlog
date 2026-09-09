// Kurzbiografie und Porträt der Komponisten aus der deutschen Wikipedia.
//
// Die Daten landen im Katalog und nicht in einem Aufruf zur Laufzeit. Erstens
// überspringt der Service Worker fremde Hosts – eine Biografie von
// de.wikipedia.org wäre offline weg, und genau dieser Fehler hat die App
// schon einmal lahmgelegt (siehe vendor/supabase-js.js). Zweitens gibt es
// keinen Build-Schritt, in dem sich so etwas einsetzen ließe.
//
// Wie bei den Bildern gilt: das Werkzeug entscheidet nichts. Es stellt
// zusammen, was Wikipedia hergibt, und ein Mensch sieht die 55 Einträge durch,
// bevor sie in den Katalog gehen.
//
//   node tests/werkzeug/komponisten-holen.mjs             Vorschlag ausgeben
//   node tests/werkzeug/komponisten-holen.mjs --schreiben  src/data/composers.js schreiben
//   node tests/werkzeug/komponisten-holen.mjs --nur=verdi  nur einen prüfen

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { operas } from '../../src/data/operas.js';
import { commonsThumb, holen } from './commons.mjs';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ZIEL = 'src/data/composers.js';
const BREITE = 500;          // wie der übrige Katalog – siehe thumbs-umstellen.mjs
const BIO_MAX = 320;

const argumente = process.argv.slice(2);
const schreiben = argumente.includes('--schreiben');
const nur = argumente.find(a => a.startsWith('--nur='))?.split('=')[1];

// Artikeltitel, die vom Namen im Katalog abweichen. Ein falscher Titel liefert
// nichts – das ist ein deutlicheres Zeichen als ein falscher Treffer, deshalb
// wird hier nicht per Volltextsuche geraten.
const TITEL = JSON.parse(fs.readFileSync(path.join(WURZEL, 'tests/werkzeug/komponisten-titel.json'), 'utf8'));

/** Aus "Leoš Janáček" wird "leos-janacek" – nur [a-z0-9-], wie jede Id im Katalog. */
export function slug(name) {
    return String(name)
        .replace(/ß/g, 'ss')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')   // Diakritika ab
        .replace(/[^A-Za-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
}

/**
 * Die ersten Sätze des Artikelanfangs, höchstens BIO_MAX Zeichen.
 *
 * Geschnitten wird am Satzende und nicht mitten im Wort. Deutsche Abkürzungen
 * ("z. B.") und Jahreszahlen machen eine saubere Satztrennung schwer – deshalb
 * die grobe Regel: der letzte Punkt vor der Grenze, dem ein Leerzeichen und
 * ein Großbuchstabe folgen.
 */
function kurzfassen(text) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (t.length <= BIO_MAX) return t;
    const schnitt = t.slice(0, BIO_MAX);
    const m = [...schnitt.matchAll(/\.\s+(?=[A-ZÄÖÜ])/g)].pop();
    return (m ? schnitt.slice(0, m.index + 1) : schnitt.replace(/\s+\S*$/, '') + ' …').trim();
}

/**
 * Die Thumbnail-Adresse, auch für Dateien, die kein JPEG sind.
 *
 * Commons rechnet TIFF, SVG und PDF beim Verkleinern in ein Rasterformat um
 * und hängt dessen Endung an – aus "Foo.tif" wird
 * ".../Foo.tif/lossy-page1-500px-Foo.tif.jpg". Ohne diesen Zusatz antwortet
 * der Server mit HTTP 400, und genau daran scheiterte Umberto Giordano.
 *
 * Bewusst hier und nicht in commonsThumb(): dort hängen die 213 geprüften
 * Adressen des Werk- und Hauskatalogs dran, die alle JPEG sind.
 */
function thumbAdresse(datei, breite) {
    const einfach = commonsThumb(datei, breite);
    const endung = datei.toLowerCase().match(/\.(tiff?|svg|pdf|webp)$/)?.[1];
    if (!endung) return einfach;

    const teil = { tif: 'lossy-page1-', tiff: 'lossy-page1-', pdf: 'page1-', svg: '', webp: '' }[endung];
    const ziel = endung === 'svg' ? '.png' : '.jpg';
    return einfach.replace(new RegExp(`/${breite}px-([^/]+)$`), `/${teil}${breite}px-$1${ziel}`);
}

/** Der Commons-Dateiname aus einer upload.wikimedia.org-Adresse. */
function dateiname(url) {
    const ohneQuery = String(url).split('?')[0];
    const m = ohneQuery.match(/\/commons\/(?:thumb\/)?[0-9a-f]\/[0-9a-f]{2}\/([^/]+)/);
    return m ? decodeURIComponent(m[1]) : null;
}

async function json(url) {
    const r = await holen(url, { methode: 'GET', versuche: 3 });
    if (r.status !== 200 || !r.antwort) return null;
    try { return await r.antwort.json(); } catch { return null; }
}

/** Lizenz und Urheber eines Commons-Bildes – für die Bildnachweise in der App. */
async function bildRechte(datei) {
    const d = await json('https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo'
        + `&iiprop=extmetadata&titles=${encodeURIComponent('File:' + datei)}`);
    const seite = Object.values(d?.query?.pages || {})[0];
    const meta = seite?.imageinfo?.[0]?.extmetadata || {};
    const text = (k) => String(meta[k]?.value ?? '').replace(/<[^>]+>/g, '').trim();
    return { lizenz: text('LicenseShortName'), urheber: text('Artist') };
}

const namen = [...new Set(operas.map(o => o.composer))].sort((a, b) => a.localeCompare(b, 'de'));
const gesucht = nur ? namen.filter(n => slug(n).includes(nur)) : namen;

console.log(`${gesucht.length} Komponisten\n`);

const eintraege = [];
const fehlt = [];

for (const name of gesucht) {
    const id = slug(name);
    const titel = TITEL[id] || name;
    const d = await json(`https://de.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(titel.replace(/ /g, '_'))}`);

    if (!d || d.type === 'https://mediawiki.org/wiki/HyperSwitch/errors/not_found') {
        fehlt.push(`${name}  (Titel "${titel}" gibt es nicht – in komponisten-titel.json eintragen)`);
        continue;
    }
    // Eine Begriffsklärung ist kein Personenartikel.
    if (/Begriffsklärung/i.test(d.description || '')) {
        fehlt.push(`${name}  (Titel "${titel}" führt auf eine Begriffsklärung)`);
        continue;
    }

    const bildUrl = d.originalimage?.source || d.thumbnail?.source || null;
    const datei = bildUrl ? dateiname(bildUrl) : null;
    const rechte = datei ? await bildRechte(datei) : { lizenz: '', urheber: '' };

    const eintrag = {
        id,
        name,
        kurz: (d.description || '').trim(),
        bio: kurzfassen(d.extract),
        bild: datei ? thumbAdresse(datei, BREITE) : '',
        bildLizenz: rechte.lizenz,
        bildUrheber: rechte.urheber,
        wikipedia: d.content_urls?.desktop?.page || `https://de.wikipedia.org/wiki/${encodeURIComponent(titel.replace(/ /g, '_'))}`,
    };

    // Eine berechnete Bildadresse heißt nicht, dass es sie gibt.
    if (eintrag.bild) {
        const r = await holen(eintrag.bild, { methode: 'HEAD' });
        if (r.status !== 200) {
            fehlt.push(`${name}  (Bild antwortet mit HTTP ${r.status}: ${datei})`);
            eintrag.bild = '';
        }
    }

    eintraege.push(eintrag);
    const hinweis = [!eintrag.bild && 'ohne Bild', !eintrag.bio && 'ohne Text'].filter(Boolean).join(', ');
    console.log(`  ${eintrag.id.padEnd(28)} ${eintrag.bildLizenz.padEnd(22).slice(0, 22)} ${hinweis}`);
}

console.log(`\n${eintraege.length} Einträge, ${eintraege.filter(e => e.bild).length} mit Bild.`);
if (fehlt.length) console.log('\nOffen:\n  ' + fehlt.join('\n  '));

const lizenzen = new Map();
for (const e of eintraege) lizenzen.set(e.bildLizenz || '(ohne Bild)', (lizenzen.get(e.bildLizenz || '(ohne Bild)') || 0) + 1);
console.log('\nBildlizenzen:');
for (const [l, n] of [...lizenzen].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${l}`);

if (!schreiben) {
    console.log('\nVorschlag, nichts geschrieben. Mit --schreiben landet er in ' + ZIEL + '.');
    process.exit(0);
}
if (nur) {
    console.log('\n--nur schreibt nicht: das Ergebnis wäre ein Katalog mit einem Eintrag.');
    process.exit(1);
}

const zeile = (e) => '    ' + JSON.stringify({
    id: e.id, name: e.name, kurz: e.kurz, bio: e.bio,
    bild: e.bild, bildLizenz: e.bildLizenz, bildUrheber: e.bildUrheber,
    wikipedia: e.wikipedia,
}).replace(/^{|}$/g, m => m === '{' ? '{ ' : ' }');

fs.writeFileSync(path.join(WURZEL, ZIEL), `// Komponisten des Katalogs – Kurzbiografie und Porträt
//
// Zusammengetragen von tests/werkzeug/komponisten-holen.mjs aus der deutschen
// Wikipedia und von Hand durchgesehen. Im Katalog und nicht zur Laufzeit
// geholt: der Service Worker überspringt fremde Hosts, eine Biografie von
// de.wikipedia.org wäre offline weg.
//
// Die Texte stammen aus der Wikipedia und stehen unter CC BY-SA 4.0. Deshalb
// führt jeder Eintrag seinen Artikel mit, und die Komponistenseite nennt
// Herkunft und Lizenz – ohne das dürften die Texte hier nicht stehen.
// Dasselbe gilt für die Porträts: bildLizenz und bildUrheber kommen aus den
// Dateiangaben auf Commons.
//
// Die Namen sind der Schlüssel zum Werkkatalog: composers[].name muss
// zeichengleich zu operas[].composer sein. Dass keiner fehlt, prüft
// tests/checks/katalog.test.js.

export const composers = [
${eintraege.map(zeile).join(',\n')},
];

/** Der Komponist zu einem Namen aus dem Werkkatalog, oder null. */
export function composerByName(name) {
    return composers.find(c => c.name === name) || null;
}
`);
console.log(`\n${ZIEL} geschrieben: ${eintraege.length} Einträge.`);
