// Die Werke, die der Admin in der App angelegt hat (catalog_operas).
//
// Die App mischt sie beim Start unter operas.js (src/data/katalogZusatz.js);
// die Werkzeuge holen sie hier. Adresse und Schlüssel stehen in
// src/config.js. Der anon-Schlüssel ist öffentlich, und die Katalogtabellen
// sind für jeden lesbar.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { operas } from '../../src/data/operas.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** [{id, title, composer}] */
export async function werkeAusDatenbank() {
    const config = fs.readFileSync(path.join(WURZEL, 'src/config.js'), 'utf8');
    const adresse = config.match(/SUPABASE_URL = '([^']+)'/)?.[1];
    const schluessel = config.match(/SUPABASE_ANON_KEY = '([^']+)'/)?.[1];
    const r = await fetch(`${adresse}/rest/v1/catalog_operas?select=id,title,composer`, {
        headers: { apikey: schluessel, Authorization: `Bearer ${schluessel}` },
    });
    if (!r.ok) throw new Error(`catalog_operas: HTTP ${r.status}`);
    return r.json();
}

/**
 * Die Werke aus der Datenbank, die in diesen Spielplanzeilen vorkommen, aber
 * nicht in operas.js stehen. Fragt nur, wenn es solche gibt.
 */
export async function zusatzWerkeFuer(zeilen) {
    const imRepo = new Set(operas.map(o => o.id));
    const fehlen = new Set(zeilen.map(z => z.werk).filter(w => !imRepo.has(w)));
    return fehlen.size ? (await werkeAusDatenbank()).filter(w => fehlen.has(w.id)) : [];
}
