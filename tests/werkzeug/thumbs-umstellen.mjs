// Stellt die Bildadressen des Katalogs auf eine schmale Thumbnail-Breite um.
//
// Anlass: die Opernliste lud beim Öffnen 135 MB nach – 120 Bilder, von denen
// zwei zu sehen waren, 80 davon in Originalgröße (das größte 39,6 MB). Die
// Karte ist 341 x 80 px, der Hero der Detailseite 343 x 305 px.
//
// Wikimedia nimmt seit einiger Zeit nicht mehr jede Breite entgegen, sondern
// nur noch eine feste Liste; alles andere beantwortet es mit HTTP 400 und
// "Use thumbnail sizes listed on https://w.wiki/GHai". Ermittelt: 120, 250,
// 330, 500, 960, 1280. 640 – die naheliegende Breite – gibt es nicht.
//
//   node tests/werkzeug/thumbs-umstellen.mjs            Trockenlauf
//   node tests/werkzeug/thumbs-umstellen.mjs --schreiben Katalog ändern
//   node tests/werkzeug/thumbs-umstellen.mjs --breite=960

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { commonsThumb, holen } from './commons.mjs';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DATEIEN = ['src/data/operas.js', 'src/data/operaHouses.js'];

const argumente = process.argv.slice(2);
const schreiben = argumente.includes('--schreiben');
const BREITE = Number(argumente.find(a => a.startsWith('--breite='))?.split('=')[1] || 500);

/**
 * Der Dateiname aus einer Commons-Adresse, in beiden Formen:
 *   .../commons/8/83/Papageno.jpg
 *   .../commons/thumb/5/58/Max_Slevogt….jpg/1280px-Max_Slevogt….jpg
 * Zurück kommt der Name mit Unterstrichen, so wie ihn commonsThumb erwartet.
 */
function dateiname(url) {
    const thumb = url.match(/\/commons\/thumb\/[0-9a-f]\/[0-9a-f]{2}\/([^/]+)\//);
    if (thumb) return decodeURIComponent(thumb[1]);
    const direkt = url.match(/\/commons\/[0-9a-f]\/[0-9a-f]{2}\/([^/?#]+)$/);
    if (direkt) return decodeURIComponent(direkt[1]);
    return null;
}

/**
 * Gegenprobe zur Namenserkennung: der Ablageort ergibt sich aus dem MD5 des
 * Namens. Stimmt er nicht mit dem der alten Adresse überein, wurde der Name
 * falsch herausgelöst – dann darf nichts geschrieben werden, auch wenn die
 * neue Adresse zufällig antwortet.
 */
function ortStimmt(url, name) {
    const alt = url.match(/\/commons\/(?:thumb\/)?([0-9a-f]\/[0-9a-f]{2})\//);
    if (!alt) return false;
    const h = crypto.createHash('md5').update(name).digest('hex');
    return alt[1] === `${h[0]}/${h.slice(0, 2)}`;
}

const alle = [];
for (const datei of DATEIEN) {
    const inhalt = fs.readFileSync(path.join(WURZEL, datei), 'utf8');
    for (const [url] of inhalt.matchAll(/https:\/\/upload\.wikimedia\.org\/[^'"\s]+/g)) {
        alle.push({ datei, url, name: dateiname(url) });
    }
}

console.log(`${alle.length} Bildadressen, Zielbreite ${BREITE}px\n`);

const ohneNamen = alle.filter(e => !e.name);
const falscherOrt = alle.filter(e => e.name && !ortStimmt(e.url, e.name));
if (ohneNamen.length || falscherOrt.length) {
    for (const e of [...ohneNamen, ...falscherOrt]) {
        console.log(`  NAME UNKLAR  ${e.url.slice(0, 100)}`);
    }
    console.log('\nAbbruch: Namenserkennung unsicher, es wird nichts geändert.');
    process.exit(1);
}
console.log('Namenserkennung: alle Ablageorte über MD5 bestätigt.\n');

// Jede neue Adresse einmal anfragen. Sie zu berechnen heißt nicht, dass es sie
// gibt: nicht jede Datei lässt sich in jeder Breite verkleinern.
let bytesNeu = 0, fehler = 0, i = 0;
for (const e of alle) {
    e.neu = commonsThumb(e.name, BREITE);
    if (e.neu === e.url) { e.unveraendert = true; continue; }
    const r = await holen(e.neu, { methode: 'HEAD' });
    e.status = r.status;
    if (r.status === 200) {
        bytesNeu += Number(r.antwort?.headers.get('content-length') || 0);
    } else {
        fehler++;
        console.log(`  HTTP ${r.status}  ${e.name.slice(0, 70)}`);
    }
    if (++i % 25 === 0) process.stdout.write(`  ${i}/${alle.length} geprüft\n`);
}

const gut = alle.filter(e => e.status === 200);
console.log(`\n${gut.length} Adressen antworten, ${fehler} nicht.`);
console.log(`Zusammen ${(bytesNeu / 1024 / 1024).toFixed(1)} MB statt bisher rund 200 MB Katalog.`);

if (fehler) {
    console.log('\nAbbruch: solange eine Adresse nicht antwortet, wird nichts geschrieben.');
    console.log('Eine tote Adresse sieht in der App nicht kaputt aus – die Kachel');
    console.log('bleibt einfach beim farbigen Verlauf, und niemandem fällt es auf.');
    process.exit(1);
}

if (!schreiben) {
    console.log('\nTrockenlauf. Mit --schreiben werden die Adressen ersetzt.');
    process.exit(0);
}

for (const datei of DATEIEN) {
    const pfad = path.join(WURZEL, datei);
    let inhalt = fs.readFileSync(pfad, 'utf8');

    // Nach Adresse eindeutig machen, bevor ersetzt wird: zwei Einträge dürfen
    // sich ein Bild teilen (die Zauberflöte tut es nicht, Lady Macbeth schon).
    // split/join ersetzt beim ersten Mal alle Vorkommen – der zweite Durchlauf
    // fände die Adresse dann nicht mehr und bräche ab.
    const eindeutig = new Map();
    for (const e of alle) {
        if (e.datei === datei && !e.unveraendert) eindeutig.set(e.url, e.neu);
    }

    let ersetzt = 0;
    for (const [alt, neu] of eindeutig) {
        if (!inhalt.includes(alt)) throw new Error(`nicht gefunden: ${alt}`);
        inhalt = inhalt.split(alt).join(neu);
        ersetzt++;
    }
    fs.writeFileSync(pfad, inhalt);
    console.log(`  ${datei}: ${ersetzt} verschiedene Adressen ersetzt`);
}
