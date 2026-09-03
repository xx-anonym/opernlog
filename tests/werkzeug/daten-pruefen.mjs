// Gleicht Sitzplatzzahl und Gründungsjahr des Katalogs gegen Wikidata ab.
//
// Beides steht im Katalog von Hand und ließ sich beim Eintragen nicht prüfen:
// aus der Entwicklungsumgebung heraus ist weder Wikipedia noch Wikidata
// erreichbar. Aus der CI schon – dasselbe Vorgehen wie bei den Bildern.
//
// Wikidata führt die Angaben strukturiert:
//   P1083  Fassungsvermögen
//   P571   Gründung / Entstehung
//   P1619  Datum der offiziellen Eröffnung
//
// Das Werkzeug entscheidet nichts. Es stellt gegenüber und nennt die
// gefundene Beschreibung dazu, damit sich beurteilen lässt, ob überhaupt vom
// selben Bau die Rede ist: bei einem Mehrspartenhaus meint eine Zahl mal das
// Große Haus, mal das ganze Theater.
//
// Aufruf:  node tests/werkzeug/daten-pruefen.mjs [Land]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { holen } from './commons.mjs';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const nurLand = process.argv[2] || null;

const { operaHouses } = await import(path.join(WURZEL, 'src/data/operaHouses.js'));
const haeuser = operaHouses.filter(h => !nurLand || h.state === nurLand);

// Artikeltitel, wo er vom Hausnamen abweicht. Ein falscher Titel liefert
// nichts – das ist ein deutliches Zeichen und besser als ein falscher Treffer.
const TITEL = JSON.parse(
    fs.readFileSync(path.join(WURZEL, 'tests/werkzeug/wikidata-titel.json'), 'utf8')
);

async function json(url) {
    const { ok, status, antwort } = await holen(url, { methode: 'GET' });
    if (!ok) return { fehler: `HTTP ${status}` };
    return await antwort.json();
}

/** Wikidata-Objekt über den Titel des deutschen Wikipedia-Artikels. */
async function ueberArtikel(titel) {
    const url = 'https://www.wikidata.org/w/api.php?action=wbgetentities&format=json'
        + '&sites=dewiki&titles=' + encodeURIComponent(titel)
        + '&props=claims|labels|descriptions&languages=de';
    const daten = await json(url);
    if (daten.fehler) return daten;
    const treffer = Object.values(daten?.entities || {}).filter(e => e.id && !e.missing);
    return treffer[0] || null;
}

const jahr = (anspruch) => {
    const zeit = anspruch?.mainsnak?.datavalue?.value?.time;
    return zeit ? Number(String(zeit).replace(/^[+-]/, '').slice(0, 4)) : null;
};
const zahl = (anspruch) => {
    const betrag = anspruch?.mainsnak?.datavalue?.value?.amount;
    return betrag ? Number(betrag) : null;
};

console.log(`${haeuser.length} Häuser gegen Wikidata\n`);
console.log('Haus'.padEnd(34) + 'Plätze Katalog/Wikidata'.padEnd(26) + 'Gründung Katalog/Wikidata');
console.log('-'.repeat(96));

const abweichungen = [];

for (const h of haeuser) {
    const titel = TITEL[h.id] || h.name;
    const eintrag = await ueberArtikel(titel);

    if (!eintrag || eintrag.fehler) {
        console.log(`${h.name.padEnd(34)}kein Wikidata-Objekt zu "${titel}"`);
        abweichungen.push({ id: h.id, art: 'nicht gefunden', titel });
        continue;
    }

    const c = eintrag.claims || {};
    const plaetze = (c.P1083 || []).map(zahl).filter(Number.isFinite);
    const gruendung = [...(c.P571 || []), ...(c.P1619 || [])].map(jahr).filter(Number.isFinite);
    const beschreibung = eintrag.descriptions?.de?.value || '';

    const pTxt = plaetze.length ? plaetze.join(', ') : '–';
    const gTxt = gruendung.length ? [...new Set(gruendung)].sort().join(', ') : '–';

    console.log(`${h.name.padEnd(34)}${String(h.capacity).padStart(6)} / ${pTxt.padEnd(15)}`
        + `${String(h.founded).padStart(8)} / ${gTxt}`);
    if (beschreibung) console.log(`${''.padEnd(34)}(${beschreibung})`);

    // Abweichung nur melden, wenn Wikidata überhaupt etwas dazu sagt.
    const plaetzeWeicht = plaetze.length && !plaetze.some(p => Math.abs(p - h.capacity) <= Math.max(20, h.capacity * 0.03));
    const gruendungWeicht = gruendung.length && !gruendung.includes(h.founded);
    if (plaetzeWeicht || gruendungWeicht) {
        abweichungen.push({
            id: h.id, name: h.name,
            plaetze: plaetzeWeicht ? { katalog: h.capacity, wikidata: plaetze } : null,
            gruendung: gruendungWeicht ? { katalog: h.founded, wikidata: [...new Set(gruendung)] } : null,
        });
    }
}

console.log('\n\n### Abweichungen\n');
if (!abweichungen.length) console.log('keine');
for (const a of abweichungen) console.log(JSON.stringify(a));
