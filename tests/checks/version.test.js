// Die Version steht an zwei Stellen: in src/version.js für die Anzeige und in
// sw.js als Name des App-Shell-Caches. Zusammenlegen geht nicht – sw.js läuft
// als klassischer Worker und kann kein ES-Modul importieren.
//
// Auseinanderlaufen dürfen sie aber auch nicht, und zwar in beide Richtungen:
// bleibt der Cache-Name beim Erhöhen stehen, behalten alle Nutzer ihre alte
// App-Shell, obwohl der Ladebildschirm eine neue Nummer zeigt. Genau das war
// hier schon einmal der Fall – 'opernlog-v76' stand seit dem ersten
// PWA-Commit unverändert im Code.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../../src/version.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lies = (datei) => fs.readFileSync(path.join(WURZEL, datei), 'utf8');

test('die Version ist eine Kalenderversion JJJJ.MM.TT', () => {
    // Zweistellig auch bei einstelligem Monat: sonst sortiert sich 2026.9.1
    // vor 2026.10.1, und die Nummer taucht in Cache-Namen und Fehlerberichten
    // auf, wo sie irgendwann jemand sortiert.
    assert.match(VERSION, /^\d{4}\.\d{2}\.\d{2}$/);
});

test('die Version benennt den App-Shell-Cache', () => {
    const treffer = lies('sw.js').match(/const CACHE_NAME = '([^']+)';/);
    assert.ok(treffer, 'CACHE_NAME nicht in sw.js gefunden');
    assert.equal(treffer[1], `opernlog-${VERSION}`,
        'CACHE_NAME in sw.js wurde beim Erhöhen von src/version.js vergessen – '
        + 'die Nutzer behielten dann ihre alte App-Shell.');
});

test('der Bilder-Cache hängt nicht an der Version', () => {
    // Sonst würfe jede Versionserhöhung die mühsam geladenen Bilder mit weg.
    const bilder = lies('sw.js').match(/const IMAGE_CACHE = '([^']+)';/);
    assert.ok(bilder, 'IMAGE_CACHE nicht gefunden');
    assert.ok(!bilder[1].includes(VERSION));
});

test('der Ladebildschirm hat das Feld, das main.js füllt', () => {
    // Beide Seiten prüfen, nicht nur eine: main.js fragt auf null ab und tut
    // dann stillschweigend nichts. Ein umbenanntes Feld im HTML fiele also
    // nirgends auf – die Nummer wäre einfach weg.
    assert.match(lies('index.html'), /id="splashVersion"/);
    assert.match(lies('src/main.js'), /getElementById\('splashVersion'\)/);
});
