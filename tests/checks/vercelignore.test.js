// .vercelignore sagt, was NICHT ausgeliefert wird. APP_SHELL in sw.js sagt,
// was die App braucht. Widersprechen die beiden sich, ist die App kaputt –
// und zwar nicht beim Testlauf, sondern erst nach dem Deploy.
//
// Der Anlass: ohne .vercelignore lag das ganze Repo im Netz, das
// Datenbankschema samt RLS-Regeln eingeschlossen. Die Datei behebt das, und
// genau deshalb ist sie gefährlich: ein Eintrag zu viel, und eine Datei, die
// die App lädt, ist weg.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lies = (datei) => fs.readFileSync(path.join(WURZEL, datei), 'utf8');

/** Die Muster aus .vercelignore, ohne Kommentare und Leerzeilen. */
function ausgeschlossen() {
    return lies('.vercelignore')
        .split('\n')
        .map(z => z.trim())
        .filter(z => z && !z.startsWith('#'));
}

/** Alles, was die App laut sw.js zum Laufen braucht. */
function appShell() {
    const sw = lies('sw.js');
    const anfang = sw.indexOf('const APP_SHELL = [');
    const ende = sw.indexOf('];', anfang);
    return [...sw.slice(anfang, ende).matchAll(/'([^']+)'/g)]
        .map(m => m[1].replace(/^\.\//, ''))
        .filter(p => p && p !== '/');
}

test('nichts aus dem APP_SHELL wird von der Auslieferung ausgeschlossen', () => {
    const muster = ausgeschlossen();
    const getroffen = appShell().filter(datei =>
        muster.some(m => datei === m.replace(/\/$/, '') || datei.startsWith(m.replace(/\/$/, '') + '/')));

    assert.deepEqual(getroffen, [],
        'Diese Dateien braucht die App, .vercelignore schließt sie aber aus – '
        + `nach dem nächsten Deploy wären sie 404:\n  ${getroffen.join('\n  ')}`);
});

test('die Symbole werden ausgeliefert', () => {
    // icons/ steht nicht im APP_SHELL, wird aber von index.html und
    // manifest.json referenziert. Ohne sie kein Symbol auf dem Startbildschirm.
    const muster = ausgeschlossen();
    assert.ok(!muster.some(m => m.replace(/\/$/, '') === 'icons'),
        'icons/ ist ausgeschlossen, wird aber gebraucht');
});

test('was nicht zur App gehört, ist auch wirklich ausgeschlossen', () => {
    // Andersherum: wer ein Verzeichnis anlegt und es hier vergisst, legt es
    // ins Netz. supabase/ enthält das Schema samt aller RLS-Regeln.
    const muster = ausgeschlossen().map(m => m.replace(/\/$/, ''));
    for (const verzeichnis of ['tests', 'supabase', '.github', 'scripts']) {
        assert.ok(muster.includes(verzeichnis),
            `${verzeichnis}/ fehlt in .vercelignore und läge damit öffentlich im Netz`);
    }
});

test('vercel.json setzt die Sicherheits-Header und sonst nichts', () => {
    // Sonst nichts, und das ist der Punkt: sobald dort ein buildCommand oder
    // ein framework stünde, behandelte Vercel das Projekt nicht mehr als die
    // statische Seite, die es ist.
    const config = JSON.parse(lies('vercel.json'));
    assert.deepEqual(Object.keys(config).filter(k => k !== '$schema'), ['headers']);

    const gesetzt = config.headers[0].headers.map(h => h.key);
    for (const kopf of ['X-Content-Type-Options', 'Referrer-Policy', 'X-Frame-Options']) {
        assert.ok(gesetzt.includes(kopf), `${kopf} fehlt`);
    }
    assert.equal(config.headers[0].source, '/(.*)', 'die Header gelten nicht für alle Pfade');
});
