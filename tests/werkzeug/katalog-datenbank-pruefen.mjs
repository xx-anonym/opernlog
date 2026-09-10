// Prüft die Katalogeinträge, die der Admin aus der App heraus angelegt hat.
//
// Der Katalog im Repo wird von tests/checks/katalog.test.js bewacht, und zwar
// bevor etwas ankommt: ohne grüne CI kein Merge. Für die Einträge aus der
// Datenbank gibt es dieses Vorher nicht – sie stehen in dem Moment im Katalog,
// in dem der Admin auf "Hinzufügen" klickt.
//
// Also prüft dieser Lauf hinterher, täglich, und meldet, was nicht stimmt.
// Geprüft wird gegen dieselben Regeln, die auch das Formular anlegt
// (src/data/katalogRegeln.js), und gegen den zusammengeführten Katalog –
// sonst fiele eine Id nicht auf, die im Repo längst vergeben ist.
//
//   node tests/werkzeug/katalog-datenbank-pruefen.mjs
//
// Rückgabewert 0: alles in Ordnung. 1: es gibt etwas zu tun.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { operas } from '../../src/data/operas.js';
import { operaHouses } from '../../src/data/operaHouses.js';
import { composers } from '../../src/data/composers.js';
import { pruefeWerk, pruefeHaus, pruefeKomponist } from '../../src/data/katalogRegeln.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Adresse und Schlüssel aus src/config.js, damit sie nicht doppelt gepflegt
// werden müssen. Der anon-Schlüssel ist öffentlich, und die Katalogtabellen
// sind für jeden lesbar – zum Prüfen braucht es keine erhöhten Rechte.
const config = fs.readFileSync(path.join(WURZEL, 'src/config.js'), 'utf8');
const URL_ = config.match(/SUPABASE_URL = '([^']+)'/)?.[1];
const KEY = config.match(/SUPABASE_ANON_KEY = '([^']+)'/)?.[1];

if (!URL_ || !KEY) {
    console.error('Adresse oder Schlüssel nicht in src/config.js gefunden');
    process.exit(1);
}

const UMBENANNT = {
    year_composed: 'yearComposed',
    image_url: 'imageUrl',
    bild_lizenz: 'bildLizenz',
    bild_urheber: 'bildUrheber',
};

function alsKatalogEintrag(zeile) {
    const eintrag = {};
    for (const [spalte, wert] of Object.entries(zeile)) {
        if (spalte === 'created_at' || spalte === 'created_by') continue;
        eintrag[UMBENANNT[spalte] ?? spalte] = wert;
    }
    return eintrag;
}

async function tabelle(name) {
    const r = await fetch(`${URL_}/rest/v1/${name}?select=*`, {
        headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    });
    if (!r.ok) {
        console.error(`::error::${name}: Supabase antwortet mit HTTP ${r.status}`);
        console.error((await r.text()).slice(0, 400));
        process.exit(1);
    }
    return (await r.json()).map(alsKatalogEintrag);
}

const [werkeDb, haeuserDb, komponistenDb] = await Promise.all([
    tabelle('catalog_operas'),
    tabelle('catalog_houses'),
    tabelle('catalog_composers'),
]);

console.log(`Aus der Datenbank: ${werkeDb.length} Werke, ${haeuserDb.length} Häuser, `
    + `${komponistenDb.length} Komponisten.`);

if (!werkeDb.length && !haeuserDb.length && !komponistenDb.length) {
    console.log('Nichts selbst angelegt – nichts zu prüfen.');
    process.exit(0);
}

// Gegen den vollen Katalog prüfen, nicht nur gegen die Datenbank: eine Id, die
// im Repo schon vergeben ist, wäre sonst unsichtbar.
const alleWerke = [...operas, ...werkeDb];
const alleHaeuser = [...operaHouses, ...haeuserDb];
const alleKomponisten = [...composers, ...komponistenDb];

const ohne = (liste, eintrag) => liste.filter(e => e !== eintrag);
const funde = [];

for (const k of komponistenDb) {
    const m = pruefeKomponist(k, { komponisten: ohne(alleKomponisten, k) });
    if (m.length) funde.push({ art: 'Komponist', id: k.id, name: k.name, maengel: m });
}
for (const w of werkeDb) {
    const m = pruefeWerk(w, { werke: ohne(alleWerke, w), komponisten: alleKomponisten });
    if (m.length) funde.push({ art: 'Werk', id: w.id, name: w.title, maengel: m });
}
for (const h of haeuserDb) {
    const m = pruefeHaus(h, { haeuser: ohne(alleHaeuser, h) });
    if (m.length) funde.push({ art: 'Haus', id: h.id, name: h.name, maengel: m });
}

// Die Bildadressen wirklich abrufen. Eine Adresse kann allen Formregeln
// genügen und trotzdem ins Leere zeigen – ein Tippfehler im Dateinamen, oder
// das Bild wurde auf Commons gelöscht.
const bilder = [
    ...werkeDb.map(w => ({ art: 'Werk', id: w.id, name: w.title, url: w.image })),
    ...haeuserDb.map(h => ({ art: 'Haus', id: h.id, name: h.name, url: h.imageUrl })),
    ...komponistenDb.filter(k => k.bild).map(k => ({ art: 'Komponist', id: k.id, name: k.name, url: k.bild })),
];

/** Einen Mangel zum vorhandenen Fund legen, statt den Eintrag zweimal zu nennen. */
function vermerken(art, id, name, mangel) {
    const da = funde.find(f => f.art === art && f.id === id);
    if (da) da.maengel.push(mangel);
    else funde.push({ art, id, name, maengel: [mangel] });
}

for (const b of bilder) {
    try {
        const r = await fetch(b.url, { method: 'HEAD' });
        if (!r.ok) vermerken(b.art, b.id, b.name, `Das Bild antwortet mit HTTP ${r.status}.`);
    } catch (e) {
        vermerken(b.art, b.id, b.name, `Das Bild ist nicht abrufbar: ${e.message}`);
    }
}

if (!funde.length) {
    console.log(`Alle ${werkeDb.length + haeuserDb.length + komponistenDb.length} Einträge `
        + `genügen den Katalogregeln, und alle ${bilder.length} Bilder sind abrufbar.`);
    process.exit(0);
}

console.log();
console.log(`${funde.length} von ${werkeDb.length + haeuserDb.length + komponistenDb.length} Einträgen zu beanstanden:`);
console.log();
const zeilen = [];
for (const f of funde) {
    const kopf = `${f.art} „${f.name}" (${f.id})`;
    console.log(kopf);
    zeilen.push(`- **${kopf}**`);
    for (const m of f.maengel) {
        console.log('   ' + m);
        zeilen.push(`  - ${m}`);
    }
}

// Für das Issue im Workflow.
if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT,
        `anzahl=${funde.length}\nbericht<<ENDE\n${zeilen.join('\n')}\nENDE\n`);
}

process.exit(1);
