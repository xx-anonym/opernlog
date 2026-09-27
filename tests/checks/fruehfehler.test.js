// Das Stück in index.html, das Fehler vor dem Start der App meldet: es muss
// vor allen anderen Skripten stehen, und Adresse und Schlüssel müssen die aus
// src/config.js sein – sonst meldet es nach einem Wechsel ins Leere.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../src/config.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');
const skripte = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
const frueh = skripte.find(m => m[1].includes('__fruehFehler'));

test('das Stück für Fehler vor dem Start steht vor allen anderen Skripten', () => {
    assert.ok(frueh, 'nicht gefunden');
    assert.equal(skripte.indexOf(frueh), 0);
});

test('es meldet an dieselbe Adresse mit demselben Schlüssel wie die App', () => {
    assert.ok(frueh[1].includes(`'${SUPABASE_URL}/rest/v1/fehlerprotokoll'`), 'Adresse');
    assert.ok(frueh[1].includes(`'${SUPABASE_ANON_KEY}'`), 'Schlüssel');
});
