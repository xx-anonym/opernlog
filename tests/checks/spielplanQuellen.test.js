// tests/werkzeug/spielplan-quellen.json – die Einstiegsseiten für den
// Spielplanlauf. Ein Tippfehler fällt dort sonst erst im nächsten Lauf auf,
// Monate später: ein Haus ohne Termine oder ein Stück, das keinem Werk
// zugeordnet wird.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { operas } from '../../src/data/operas.js';
import { operaHouses } from '../../src/data/operaHouses.js';
import { SPIELPLAN_ZUSATZWERKE } from '../../src/data/spielplan.js';

const QUELLEN = JSON.parse(fs.readFileSync(new URL('../werkzeug/spielplan-quellen.json', import.meta.url), 'utf8'));
const haeuser = Object.entries(QUELLEN).filter(([k]) => !k.startsWith('_'));
const hausIds = new Set(operaHouses.map(h => h.id));
const werkIds = new Set([...operas.map(o => o.id), ...SPIELPLAN_ZUSATZWERKE]);
const adresse = u => { try { return new URL(u).protocol === 'https:'; } catch { return false; } };

test('jede Quelle gehört zu einem Haus im Katalog', () => {
    assert.deepEqual(haeuser.map(([id]) => id).filter(id => !hausIds.has(id)), []);
});

test('Einstiegsseiten und Stücke sind https-Adressen', () => {
    const falsch = [];
    for (const [id, q] of haeuser) {
        const start = Array.isArray(q) ? q : q.start;
        if (!Array.isArray(start)) { falsch.push(`${id}: keine Einstiegsseiten`); continue; }
        for (const u of start) if (!adresse(u.replace(/\{JJJJ\}|\{MM\}/g, '01'))) falsch.push(`${id}: ${u}`);
        for (const s of (Array.isArray(q) ? [] : q.stuecke || [])) if (!adresse(typeof s === 'string' ? s : s.url)) falsch.push(`${id}: ${JSON.stringify(s)}`);
    }
    assert.deepEqual(falsch, []);
});

test('ein Stück mit eigenem Werk nennt ein Werk aus dem Katalog', () => {
    const falsch = haeuser.flatMap(([id, q]) => (Array.isArray(q) ? [] : q.stuecke || [])
        .filter(s => typeof s !== 'string' && !werkIds.has(s.werk)).map(s => `${id}: ${s.werk}`));
    assert.deepEqual(falsch, []);
});

test('Selektoren sind Text', () => {
    for (const [id, q] of haeuser) {
        if (Array.isArray(q)) continue;
        for (const feld of ['terminSelektor', 'hauptteil', 'ort', 'ortJeTermin']) {
            if (feld in q) assert.equal(typeof q[feld], 'string', `${id}.${feld}`);
        }
    }
});
