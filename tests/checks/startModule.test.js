// Was die App beim Start lädt (seit 20.11.2026).
//
// Mit allen Seiten statisch zog main.js 112 Module mit 1,4 MB nach sich, und
// Googles Abruf brach dabei ab: im Fehlerprotokoll stand "Skript ließ sich
// nicht laden", nur von Googlebot und Googles Vorschau. Seitdem lädt main.js
// die meisten Seiten erst beim Aufruf (SEITEN_MODULE). Diese Prüfung merkt,
// wenn ein statischer Import das wieder aufbläht.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const IMPORT = /(?:^|[\s;])(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm;

function startModule() {
    const start = path.join(WURZEL, 'src/main.js');
    const gesehen = new Map();
    const offen = [start];
    while (offen.length) {
        const datei = offen.shift();
        if (gesehen.has(datei)) continue;
        const text = fs.readFileSync(datei, 'utf8');
        gesehen.set(datei, text.length);
        for (const m of text.matchAll(IMPORT)) offen.push(path.resolve(path.dirname(datei), m[1] || m[2]));
    }
    return gesehen;
}

test('der Start bleibt schlank: höchstens 65 Module und 1 MB', () => {
    const module = startModule();
    const groesse = [...module.values()].reduce((a, b) => a + b, 0);
    assert.ok(module.size <= 65, `${module.size} Module beim Start`);
    assert.ok(groesse <= 1024 * 1024, `${Math.round(groesse / 1024)} KB beim Start`);
});

test('nur Startseite, Anmeldung und Profil-Einrichten sind statische Seiten', () => {
    const seiten = [...startModule().keys()]
        .filter(f => f.includes(`${path.sep}src${path.sep}pages${path.sep}`))
        .map(f => path.basename(f)).sort();
    assert.deepEqual(seiten, ['Auth.js', 'Home.js', 'ProfileSetup.js']);
});

test('jede Seite, die main.js beim Aufruf lädt, gibt es und steht im Service Worker', () => {
    const main = fs.readFileSync(path.join(WURZEL, 'src/main.js'), 'utf8');
    const sw = fs.readFileSync(path.join(WURZEL, 'sw.js'), 'utf8');
    const block = main.match(/const SEITEN_MODULE = \{([\s\S]*?)\};/)?.[1];
    assert.ok(block, 'SEITEN_MODULE fehlt');
    const namen = [...new Set([...block.matchAll(/'([A-Za-z]+)'/g)].map(m => m[1]))];
    assert.ok(namen.length >= 15);
    for (const n of namen) {
        const datei = path.join(WURZEL, 'src/pages', `${n}.js`);
        assert.ok(fs.existsSync(datei), `src/pages/${n}.js fehlt`);
        assert.match(fs.readFileSync(datei, 'utf8'), new RegExp(`export (async )?function ${n}Page\\b`), `${n}Page fehlt`);
        assert.ok(sw.includes(`'./src/pages/${n}.js'`), `${n}.js fehlt im APP_SHELL – ohne Netz ginge die Seite nicht auf`);
    }
});

test('unter dem Vorhang steht, was OpernLog ist, mit Links für Suchmaschinen', () => {
    const html = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');
    const app = html.match(/<div id="app">([\s\S]*?)<\/div>\s*<\/div>/)?.[1] || '';
    for (const ziel of ['/oper/', '/haus/', '/komponist/']) assert.ok(app.includes(`href="${ziel}"`), ziel);
});
