// Der Service Worker führt die App-Dateien in einer Liste von Hand. Diese
// Liste schreibt auf, was ohnehin im Verzeichnis steht – und ist damit genau
// die Art Doppelung, die auseinandergeht: Icon.js und Toast.js fehlten
// monatelang. Wer die App installierte und beim ersten Start offline war,
// bekam einen fehlgeschlagenen Modul-Import und eine leere Seite.
//
// Ohne Build-Schritt lässt sich die Liste nicht erzeugen. Also wird sie
// geprüft.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sw = fs.readFileSync(path.join(WURZEL, 'sw.js'), 'utf8');

/** Der Inhalt des APP_SHELL-Arrays, ohne die Kommentare drumherum. */
function appShell() {
    const anfang = sw.indexOf('const APP_SHELL = [');
    assert.notEqual(anfang, -1, 'APP_SHELL nicht in sw.js gefunden');
    const ende = sw.indexOf('];', anfang);
    assert.notEqual(ende, -1, 'Ende von APP_SHELL nicht gefunden');
    return [...sw.slice(anfang, ende).matchAll(/'([^']+)'/g)]
        .map(m => m[1])
        .filter(p => p !== './');
}

/** Alle .js-Dateien unter src/, relativ zur Wurzel. */
function quellDateien(verzeichnis = 'src') {
    return fs.readdirSync(path.join(WURZEL, verzeichnis), { withFileTypes: true })
        .flatMap(e => e.isDirectory()
            ? quellDateien(path.posix.join(verzeichnis, e.name))
            : (e.name.endsWith('.js') ? [path.posix.join(verzeichnis, e.name)] : []));
}

test('jede Datei unter src/ steht im APP_SHELL', () => {
    const gelistet = new Set(appShell().map(p => p.replace(/^\.\//, '')));
    const fehlend = quellDateien().filter(f => !gelistet.has(f));
    assert.deepEqual(fehlend, [],
        `Diese Dateien fehlen in APP_SHELL in sw.js und wären beim ersten `
        + `Offline-Start nicht da:\n  ${fehlend.join('\n  ')}`);
});

test('jeder Eintrag im APP_SHELL existiert auch', () => {
    const tot = appShell().filter(p => !fs.existsSync(path.join(WURZEL, p)));
    assert.deepEqual(tot, [],
        `Diese Pfade stehen in APP_SHELL, aber nicht im Verzeichnis – `
        + `cache.addAll() bricht daran ab und der Service Worker installiert `
        + `sich gar nicht:\n  ${tot.join('\n  ')}`);
});

test('index.html lädt nichts, was nicht zwischengespeichert wird', () => {
    const html = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');
    const gelistet = new Set(appShell().map(p => p.replace(/^\.\//, '')));
    const eigene = [...html.matchAll(/(?:src|href)="(?!https?:|\/\/|#|data:)([^"]+)"/g)]
        .map(m => m[1].replace(/^\.?\//, '').split(/[?#]/)[0])
        .filter(p => p.endsWith('.js') || p.endsWith('.css'));
    const fehlend = [...new Set(eigene)].filter(p => !gelistet.has(p));
    assert.deepEqual(fehlend, [], `von index.html geladen, aber nicht im APP_SHELL: ${fehlend}`);
});

test('index.html lädt kein Skript von einem fremden Host', () => {
    // Der Service Worker überspringt fremde Hosts. Ein Skript von dort liegt
    // also in keinem Cache – und wenn die App ohne es nicht startet, ist der
    // "Offline-Modus" keiner. Genau so war es: die Supabase-Bibliothek kam von
    // cdn.jsdelivr.net, ohne Netz blieb nach dem Vorhang ein grauer
    // Bildschirm. Sie liegt jetzt unter vendor/.
    const html = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');
    const fremd = [...html.matchAll(/<script[^>]*\ssrc="(https?:)?\/\/[^"]+"/g)].map(m => m[0]);
    assert.deepEqual(fremd, [],
        `Skripte von fremden Hosts:\n  ${fremd.join('\n  ')}`);
});

test('die Supabase-Bibliothek liegt im Projekt und im Cache', () => {
    const html = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');
    assert.match(html, /<script src="vendor\/supabase-js\.js"><\/script>/);
    assert.ok(fs.existsSync(path.join(WURZEL, 'vendor/supabase-js.js')));
    assert.ok(appShell().some(p => p.endsWith('vendor/supabase-js.js')));
});

test('CACHE_NAME ist durchnummeriert', () => {
    // Der Name ist der einzige Hebel, mit dem ein Update bei den Nutzern
    // ankommt: activate löscht jeden Cache, der anders heißt.
    const m = sw.match(/const CACHE_NAME = 'opernlog-v(\d+)';/);
    assert.ok(m, "CACHE_NAME muss 'opernlog-v<Zahl>' heißen");
    assert.ok(Number(m[1]) > 0);
});

test('der Bilder-Cache hat einen eigenen Namen', () => {
    // Sonst würfe jede Versionserhöhung die geladenen Bilder mit weg.
    const app = sw.match(/const CACHE_NAME = '([^']+)'/)[1];
    const bilder = sw.match(/const IMAGE_CACHE = '([^']+)'/);
    assert.ok(bilder, 'IMAGE_CACHE nicht gefunden');
    assert.notEqual(bilder[1], app);
});

test('activate löscht fremde Caches, aber nicht den Bilder-Cache', () => {
    const behalten = sw.match(/\.filter\(\(key\) => ([^)]+)\)/);
    assert.ok(behalten, 'Aufräum-Filter in activate nicht gefunden');
    assert.match(behalten[1], /CACHE_NAME/);
    assert.match(behalten[1], /IMAGE_CACHE/);
});
