// Der Katalog ist von Hand gepflegt: 69 Häuser, gut 90 Werke, jedes mit Bild
// und Koordinaten. Ein Tippfehler in einer Id fällt beim Lesen nicht auf, in
// der App aber sehr wohl – ein Besuch zeigt dann ein leeres Haus.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { operaHouses } from '../../src/data/operaHouses.js';
import { operas } from '../../src/data/operas.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const doppelte = (werte) => werte.filter((w, i) => werte.indexOf(w) !== i);

test('Ids kommen nur einmal vor', () => {
    assert.deepEqual(doppelte(operaHouses.map(h => h.id)), []);
    assert.deepEqual(doppelte(operas.map(o => o.id)), []);
});

test('Ids sind url-tauglich', () => {
    // Sie landen im Adress-Fragment (#/house/<id>); alles, was dort kodiert
    // werden müsste, macht die Adresse unlesbar.
    for (const e of [...operaHouses, ...operas]) {
        assert.match(e.id, /^[a-z0-9-]+$/, `unbrauchbare Id: ${e.id}`);
    }
});

test('jedes Haus hat Name, Stadt und Koordinaten', () => {
    for (const h of operaHouses) {
        assert.ok(h.name?.trim(), `${h.id}: kein Name`);
        assert.ok(h.city?.trim(), `${h.id}: keine Stadt`);
        assert.equal(typeof h.lat, 'number', `${h.id}: keine Breite`);
        assert.equal(typeof h.lon, 'number', `${h.id}: keine Länge`);
    }
});

test('die Koordinaten liegen im deutschsprachigen Raum', () => {
    // Ein vertauschtes Vorzeichen oder verdrehte lat/lon fällt sonst erst auf,
    // wenn jemandem beim Loggen ein Haus in der Nordsee vorgeschlagen wird.
    for (const h of operaHouses) {
        assert.ok(h.lat > 45 && h.lat < 56, `${h.id}: Breite ${h.lat} liegt außerhalb`);
        assert.ok(h.lon > 5 && h.lon < 18, `${h.id}: Länge ${h.lon} liegt außerhalb`);
    }
});

test('keine zwei Häuser stehen auf demselben Punkt', () => {
    // Städte mit mehreren Häusern gibt es reichlich; identische Koordinaten
    // wären ein kopierter Eintrag, und die Vorauswahl beim Loggen träfe dann
    // zufällig.
    const punkte = operaHouses.map(h => `${h.lat},${h.lon}`);
    assert.deepEqual(doppelte(punkte), []);
});

test('jedes Werk hat Titel und Komponist', () => {
    for (const o of operas) {
        assert.ok(o.title?.trim(), `${o.id}: kein Titel`);
        assert.ok(o.composer?.trim(), `${o.id}: kein Komponist`);
    }
});

test('Komponistennamen sind einheitlich geschrieben', () => {
    // Blinde Flecken und die Statistik gruppieren über die Zeichenkette. Ein
    // "Giuseppe  Verdi" mit zwei Leerzeichen wäre ein zweiter Komponist.
    for (const name of new Set(operas.map(o => o.composer))) {
        assert.equal(name, name.trim().replace(/\s+/g, ' '), `krumm geschrieben: "${name}"`);
    }
});

test('Bilder kommen über https und von einem Host, den der Service Worker kennt', () => {
    // Fremde Hosts überspringt der fetch-Handler; ein Bild von woanders wäre
    // offline eine leere Kachel.
    const sw = fs.readFileSync(path.join(WURZEL, 'sw.js'), 'utf8');
    const zeile = sw.match(/const IMAGE_HOSTS = \[([^\]]*)\]/);
    assert.ok(zeile, 'IMAGE_HOSTS nicht in sw.js gefunden');
    const erlaubt = new Set([...zeile[1].matchAll(/'([^']+)'/g)].map(m => m[1]));

    for (const e of [...operaHouses, ...operas]) {
        if (!e.imageUrl) continue;
        const url = new URL(e.imageUrl);
        assert.equal(url.protocol, 'https:', `${e.id}: kein https`);
        assert.ok(erlaubt.has(url.hostname),
            `${e.id}: ${url.hostname} steht nicht in IMAGE_HOSTS – offline bliebe die Kachel leer`);
    }
});

test('jedes Haus hat eine Farbe als Rückfallebene für fehlende Bilder', () => {
    for (const h of operaHouses) {
        assert.match(h.color || '', /^#[0-9a-fA-F]{6}$/, `${h.id}: keine Farbe`);
    }
});
