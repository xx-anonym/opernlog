// Die Werke und Häuser, die der Admin in der App angelegt hat (catalog_operas,
// catalog_houses).
//
// Die App mischt sie beim Start unter operas.js (src/data/katalogZusatz.js);
// die Werkzeuge holen sie hier. Adresse und Schlüssel stehen in
// src/config.js. Der anon-Schlüssel ist öffentlich, und die Katalogtabellen
// sind für jeden lesbar.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { operas } from '../../src/data/operas.js';
import { operaHouses } from '../../src/data/operaHouses.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function tabelle(name, spalten) {
    const config = fs.readFileSync(path.join(WURZEL, 'src/config.js'), 'utf8');
    const adresse = config.match(/SUPABASE_URL = '([^']+)'/)?.[1];
    const schluessel = config.match(/SUPABASE_ANON_KEY = '([^']+)'/)?.[1];
    const r = await fetch(`${adresse}/rest/v1/${name}?select=${spalten}`, {
        headers: { apikey: schluessel, Authorization: `Bearer ${schluessel}` },
    });
    if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
    return r.json();
}

/** [{id, title, composer}] */
export const werkeAusDatenbank = () => tabelle('catalog_operas', 'id,title,composer');

/** Die Häuser, die der Admin in der App angelegt hat (catalog_houses): [{id, name, city, state, lat, lon}] */
export const haeuserAusDatenbank = () => tabelle('catalog_houses', 'id,name,city,state,lat,lon');

/**
 * Die Werke aus der Datenbank, die in diesen Spielplanzeilen vorkommen, aber
 * nicht in operas.js stehen. Fragt nur, wenn es solche gibt.
 */
export async function zusatzWerkeFuer(zeilen) {
    const imRepo = new Set(operas.map(o => o.id));
    const fehlen = new Set(zeilen.map(z => z.werk).filter(w => !imRepo.has(w)));
    return fehlen.size ? (await werkeAusDatenbank()).filter(w => fehlen.has(w.id)) : [];
}

/** Wie zusatzWerkeFuer(), für Häuser. */
export async function zusatzHaeuserFuer(zeilen) {
    const imRepo = new Set(operaHouses.map(h => h.id));
    const fehlen = new Set(zeilen.map(z => z.haus).filter(h => !imRepo.has(h)));
    return fehlen.size ? (await haeuserAusDatenbank()).filter(h => fehlen.has(h.id)) : [];
}
