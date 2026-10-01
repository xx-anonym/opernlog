// Holt Urheber und Lizenz jedes Katalogbildes von Wikimedia Commons und
// schreibt src/data/bildnachweise.js.
//
//   node tests/werkzeug/bildnachweise-holen.mjs
//
// 118 der 213 Bilder von Werken und Häusern stehen unter einer Lizenz, die
// eine Namensnennung verlangt (CC BY, CC BY-SA); genannt wurde bis zum
// 1.10.2026 niemand. Die App zeigt die Zeile jetzt klein im Kopf von Werk-
// und Hausseite und alle zusammen unter #/bildnachweise.
//
// Erfasst werden die Bilder aus operas.js und operaHouses.js und die der
// Einträge, die der Admin in der App angelegt hat (catalog_operas,
// catalog_houses). Kommt ein Bild hinzu, das hier noch fehlt, holt die App
// seinen Nachweis beim Öffnen der Seite selbst von Commons – dieser Lauf
// macht ihn nur dauerhaft. Die Komponisten haben ihre Nachweise schon
// (composers.js, bildLizenz und bildUrheber).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { operas } from '../../src/data/operas.js';
import { operaHouses } from '../../src/data/operaHouses.js';
import { dateinameAus, urheberText } from '../../src/data/bildnachweisRegeln.js';
import { holen } from './commons.mjs';
import { bilderAusDatenbank } from './datenbank-werke.mjs';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ZIEL = path.join(WURZEL, 'src/data/bildnachweise.js');

const adressen = [
    ...operas.map(o => o.image),
    ...operaHouses.map(h => h.imageUrl),
    ...(await bilderAusDatenbank().catch((e) => { console.warn('Datenbank nicht erreichbar:', e.message); return []; })).map(b => b.bild),
];
const dateien = [...new Set(adressen.map(dateinameAus).filter(Boolean))].sort();
console.log(`${dateien.length} Dateien auf Commons`);

const nachweise = {};
for (let i = 0; i < dateien.length; i += 50) {
    const stueck = dateien.slice(i, i + 50);
    const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json&prop=imageinfo&iiprop=extmetadata|url'
        + '&iiextmetadatafilter=Artist|LicenseShortName|LicenseUrl|AttributionRequired'
        + `&titles=${encodeURIComponent(stueck.map(d => `File:${d}`).join('|'))}`;
    const r = await holen(url, { methode: 'GET' });
    if (!r.ok) throw new Error(`Commons: HTTP ${r.status}`);
    const d = await r.antwort.json();
    // Commons normalisiert Titel (Unterstrich → Leerzeichen); zurück zum Dateinamen.
    const zurueck = new Map((d.query.normalized || []).map(n => [n.to, n.from]));
    for (const seite of Object.values(d.query.pages || {})) {
        const titel = zurueck.get(seite.title) || seite.title;
        const datei = titel.replace(/^File:/, '').replace(/ /g, '_');
        const info = seite.imageinfo?.[0];
        if (!info) { console.warn('fehlt auf Commons:', datei); continue; }
        const m = info.extmetadata || {};
        const wert = k => String(m[k]?.value ?? '').trim();
        nachweise[datei] = {
            urheber: urheberText(wert('Artist')),
            lizenz: wert('LicenseShortName').replace(/<[^>]+>/g, '') || 'unbekannt',
            lizenzUrl: wert('LicenseUrl') || null,
            seite: info.descriptionurl,
            pflicht: wert('AttributionRequired') === 'true',
        };
    }
}

const pflicht = Object.values(nachweise).filter(n => n.pflicht).length;
const zeilen = Object.keys(nachweise).sort().map(k => `    ${JSON.stringify(k)}: ${JSON.stringify(nachweise[k])},`);
fs.writeFileSync(ZIEL, `// Erzeugt von tests/werkzeug/bildnachweise-holen.mjs – nicht von Hand ändern.
// Urheber und Lizenz der Katalogbilder laut Wikimedia Commons. pflicht: die
// Lizenz verlangt eine Namensnennung (${pflicht} von ${Object.keys(nachweise).length}).
// Stand: ${new Date().toISOString().slice(0, 10)}

export const BILDNACHWEISE = {
${zeilen.join('\n')}
};
`);
console.log(`${Object.keys(nachweise).length} Nachweise, davon ${pflicht} mit Pflicht zur Namensnennung → ${path.relative(WURZEL, ZIEL)}`);
