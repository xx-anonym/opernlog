// Legt zu jedem Termin im Spielplan eine Kalenderdatei unter kalender/ ab.
//
//   node tests/werkzeug/kalender-dateien.mjs
//
// Auf iPhone und iPad lässt sich eine im Browser erzeugte Kalenderdatei aus
// der installierten App heraus nicht öffnen: Das Fenster, in dem iOS sie
// zeigen will, sieht die Datei nicht und bleibt leer. Eine Datei, die
// wirklich auf dem Server liegt, öffnet es dagegen wie Safari. Deshalb liegt
// jeder Abend, den "In den Kalender" anbietet, als eigene Datei im Repo
// (src/kalender.js, kalenderHerunterladen).
//
// spielplan-uebernehmen.mjs ruft das selbst auf. Von Hand nötig ist es nur,
// wenn sich src/kalender.js ändert; tests/checks/kalenderDateien.test.js
// merkt, wenn die Dateien nicht mehr zum Spielplan passen.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { operas } from '../../src/data/operas.js';
import { operaHouses } from '../../src/data/operaHouses.js';
import { kalenderEintrag, kalenderDateiname } from '../../src/kalender.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const KALENDER_ORDNER = path.join(WURZEL, 'kalender');

/**
 * Dateiname → Inhalt, für jeden Termin, den "In den Kalender" anbieten kann.
 * Werke, die nur in der Datenbank stehen, kennt KalenderWahl.js nicht; für
 * sie entsteht auch keine Datei. Der Zeitstempel ist der Stand des
 * Spielplans, damit dieselben Daten dieselben Dateien ergeben.
 */
export function kalenderDateien(zeilen, stand) {
    const jetzt = new Date(`${stand}T00:00:00Z`);
    const dateien = new Map();
    for (const e of zeilen) {
        const werk = operas.find(o => o.id === e.werk);
        const haus = operaHouses.find(h => h.id === e.haus);
        if (!werk || !haus) continue;
        for (const datum of e.termine) {
            dateien.set(kalenderDateiname(werk, haus, datum),
                kalenderEintrag({ werk, haus, datum, zeit: e.zeiten?.[datum], url: e.url, jetzt }));
        }
    }
    return dateien;
}

/** Schreibt den Ordner neu; was nicht mehr im Spielplan steht, fällt weg. */
export function kalenderOrdnerSchreiben(zeilen, stand) {
    const dateien = kalenderDateien(zeilen, stand);
    fs.mkdirSync(KALENDER_ORDNER, { recursive: true });
    for (const alt of fs.readdirSync(KALENDER_ORDNER)) {
        if (alt.endsWith('.ics') && !dateien.has(alt)) fs.rmSync(path.join(KALENDER_ORDNER, alt));
    }
    for (const [name, text] of dateien) {
        const ziel = path.join(KALENDER_ORDNER, name);
        if (!fs.existsSync(ziel) || fs.readFileSync(ziel, 'utf8') !== text) fs.writeFileSync(ziel, text);
    }
    return dateien.size;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const { spielplan, SPIELPLAN_STAND } = await import(pathToFileURL(path.join(WURZEL, 'src/data/spielplan.js')).href);
    console.log(`${kalenderOrdnerSchreiben(spielplan, SPIELPLAN_STAND)} Kalenderdateien in kalender/.`);
}
