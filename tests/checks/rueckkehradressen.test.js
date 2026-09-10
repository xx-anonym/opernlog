// Drei Wege führen aus der App hinaus und wieder zurück: die Anmeldung über
// Google, das Zurücksetzen des Passworts und die Bestätigungsmail nach der
// Registrierung. Alle drei müssen sagen, wohin es zurückgehen soll.
//
// Tut es einer nicht, nimmt Supabase die Site URL aus den Projekteinstellungen.
// Das ist eine zweite Stelle, an der die Adresse stimmen muss, sie steht nicht
// im Projekt, und niemand merkt es, bis jemand auf einen Link klickt und
// nirgends landet. Genau das war bei der Registrierung der Fall: sie war die
// einzige der drei ohne eigenes Ziel.
//
// Warum window.location.origin und keine feste Adresse: die App läuft unter
// opernlog.vercel.app, unter Vorschauadressen und beim Entwickeln unter
// 127.0.0.1. Eine eingetragene Adresse wäre in zwei von drei Fällen falsch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const quelle = fs.readFileSync(path.join(WURZEL, 'src/store/supabase.js'), 'utf8');

/** Der Rumpf eines exportierten Aufrufs, von seinem Namen bis zur nächsten Funktion. */
function funktion(name) {
    const anfang = quelle.indexOf(`export async function ${name}(`);
    assert.notEqual(anfang, -1, `${name}() nicht in src/store/supabase.js gefunden`);
    const naechste = quelle.indexOf('\nexport ', anfang + 1);
    return quelle.slice(anfang, naechste === -1 ? undefined : naechste);
}

// Der Feldname unterscheidet sich je nach Aufruf – signUp nennt es
// emailRedirectTo, die anderen beiden redirectTo.
const WEGE = [
    ['signUp', 'emailRedirectTo'],
    ['signInWithGoogle', 'redirectTo'],
    ['resetPassword', 'redirectTo'],
];

for (const [name, feld] of WEGE) {
    test(`${name}() sagt, wohin der Nutzer zurückkommen soll`, () => {
        const rumpf = funktion(name);
        assert.match(rumpf, new RegExp(`${feld}:\\s*window\\.location\\.origin`),
            `${name}() gibt kein ${feld} mit. Der Link nähme dann die Site URL aus `
            + 'den Projekteinstellungen – eine Stelle außerhalb des Projekts, an der '
            + 'es still schiefgehen kann.');
    });
}

test('keine fest eingetragene Rückkehradresse', () => {
    // Eine feste Adresse wäre beim Entwickeln und in Vorschauen falsch, und
    // zwar ohne Fehlermeldung: der Nutzer landet einfach woanders.
    for (const [name] of WEGE) {
        const treffer = [...funktion(name).matchAll(/redirectTo:\s*'([^']*)'/gi)];
        assert.deepEqual(treffer.map(t => t[1]), [],
            `${name}() trägt eine feste Adresse ein statt window.location.origin`);
    }
});
