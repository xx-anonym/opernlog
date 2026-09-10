// Holt DM Sans und Playfair Display von Google und legt sie ins Projekt.
//
// Zwei Gründe, sie nicht mehr von fonts.googleapis.com zu laden:
//
//   1. Jeder Aufruf überträgt die IP des Besuchers an Google. Ohne
//      Einwilligung ist das in Deutschland angreifbar (LG München I, 3 O
//      17493/20). Eine App, die sonst nichts an Dritte gibt, sollte das nicht
//      ausgerechnet für zwei Schriften tun.
//   2. Der Service Worker überspringt fremde Hosts – die Schriften lagen
//      deshalb in keinem Cache. Ohne Netz fiel die App auf die Systemschrift
//      zurück; das stand seit dem Offline-Umbau als bekannte Lücke im Code.
//
// Geholt werden nur latin und latin-ext. Kyrillisch und Vietnamesisch bietet
// Google zwar an, aber kein Text der App braucht sie: die einzige kyrillische
// Stelle ist der Bildnachweis für Britten ("Михаил Озерский"), und der steht
// in DM Sans, das gar kein Kyrillisch führt – er fällt heute schon auf die
// Systemschrift zurück.
//
//   node tests/werkzeug/schriften-holen.mjs             Trockenlauf
//   node tests/werkzeug/schriften-holen.mjs --schreiben

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ZIEL = 'fonts';
const SUBSETS = ['latin', 'latin-ext'];

// Ein Browser-Kennzeichen ist Pflicht: Google liefert je nach Kennung woff2,
// woff oder ttf aus. Ohne das hier kämen 200 KB große ttf-Dateien.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const QUELLE = 'https://fonts.googleapis.com/css2'
    + '?family=DM+Sans:ital,opsz,wght@0,9..40,300..800;1,9..40,300..800'
    + '&family=Playfair+Display:ital,wght@0,400..900;1,400..900'
    + '&display=swap';

const schreiben = process.argv.includes('--schreiben');

/** "DM Sans" + italic + latin-ext -> "dm-sans-italic-latin-ext.woff2" */
function dateiname(familie, stil, subset) {
    return `${familie.toLowerCase().replace(/\s+/g, '-')}-${stil}-${subset}.woff2`;
}

const antwort = await fetch(QUELLE, { headers: { 'User-Agent': UA } });
if (!antwort.ok) {
    console.error(`Google antwortet mit HTTP ${antwort.status}`);
    process.exit(1);
}
const css = await antwort.text();

// Jeder Block trägt seinen Subset-Namen als Kommentar davor.
const bloecke = [...css.matchAll(/\/\*\s*([\w[\]-]+)\s*\*\/\s*@font-face\s*\{(.*?)\}/gs)];
const gewollt = [];

for (const [, subset, block] of bloecke) {
    if (!SUBSETS.includes(subset)) continue;
    const feld = (name) => block.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();
    const familie = feld('font-family').replace(/['"]/g, '');
    const stil = feld('font-style');
    gewollt.push({
        familie, stil, subset,
        gewicht: feld('font-weight'),
        bereich: feld('unicode-range'),
        url: block.match(/url\((https:[^)]+)\)/)[1],
        datei: dateiname(familie, stil, subset),
    });
}

console.log(`${bloecke.length} Blöcke bei Google, ${gewollt.length} davon gebraucht:\n`);

let bytes = 0;
for (const e of gewollt) {
    const r = await fetch(e.url, { headers: { 'User-Agent': UA } });
    if (!r.ok) { console.error(`  HTTP ${r.status} für ${e.datei}`); process.exit(1); }
    e.inhalt = Buffer.from(await r.arrayBuffer());
    bytes += e.inhalt.length;
    console.log(`  ${String(Math.round(e.inhalt.length / 1024)).padStart(3)} KB  ${e.datei}`);
}
console.log(`\nZusammen ${(bytes / 1024).toFixed(0)} KB.`);

if (!schreiben) {
    console.log('\nTrockenlauf. Mit --schreiben landen sie in ' + ZIEL + '/.');
    process.exit(0);
}

fs.mkdirSync(path.join(WURZEL, ZIEL), { recursive: true });
for (const e of gewollt) fs.writeFileSync(path.join(WURZEL, ZIEL, e.datei), e.inhalt);

const stand = new Date().toISOString().slice(0, 10);
const regeln = gewollt.map(e => `/* ${e.subset} */
@font-face {
    font-family: '${e.familie}';
    font-style: ${e.stil};
    font-weight: ${e.gewicht};
    font-display: swap;
    src: url('${e.datei}') format('woff2');
    unicode-range: ${e.bereich};
}`).join('\n\n');

fs.writeFileSync(path.join(WURZEL, ZIEL, 'schriften.css'), `/* DM Sans und Playfair Display – im Projekt statt von Google.
 *
 * Erzeugt von tests/werkzeug/schriften-holen.mjs, Stand ${stand}.
 * Von Hand ändern lohnt nicht; der nächste Lauf überschreibt die Datei.
 *
 * Warum nicht von fonts.googleapis.com: jeder Aufruf überträgt die IP des
 * Besuchers an Google, und der Service Worker überspringt fremde Hosts – ohne
 * Netz fiel die App deshalb auf die Systemschrift zurück.
 *
 * Nur latin und latin-ext: mehr braucht kein Text der App. latin-ext ist nicht
 * verzichtbar, dort stehen die tschechischen Namen (Janáček, Dvořák, Smetana).
 *
 * Es sind variable Schriften – ein einziger Schnitt deckt den ganzen
 * Gewichtsbereich ab, deshalb die Spanne in font-weight.
 */

${regeln}
`);

console.log(`\n${ZIEL}/ geschrieben: ${gewollt.length} Schriften und schriften.css.`);
