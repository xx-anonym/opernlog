// Der Katalog steht seit dem Admin-Schreibrecht an zwei Orten: in den Dateien
// unter src/data/ und in drei Tabellen in Supabase. Geprüft wird er dadurch
// von zwei Seiten – katalog.test.js liest die Dateien, das Formular und der
// tägliche Lauf benutzen src/data/katalogRegeln.js.
//
// Diese Datei hält beide Seiten zusammen. Denn zwei Prüfungen desselben
// Gegenstands laufen auseinander, und zwar in beide Richtungen:
//
//   Wird eine Regel strenger als der Bestand, kann der Admin ein Werk nicht
//   mehr anlegen, das genauso aussieht wie die 121 vorhandenen.
//
//   Wird sie lockerer, kommen über das Formular Einträge herein, die
//   katalog.test.js nie durchgelassen hätte.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { operas } from '../../src/data/operas.js';
import { operaHouses } from '../../src/data/operaHouses.js';
import { composers } from '../../src/data/composers.js';
import { pruefeWerk, pruefeHaus, pruefeKomponist, BILD_HOSTS } from '../../src/data/katalogRegeln.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Der Katalog ohne diesen einen Eintrag – sonst stößt er sich an sich selbst. */
const ohne = (liste, eintrag) => liste.filter(e => e !== eintrag);

test('jedes Werk im Repo genügt den Regeln des Formulars', () => {
    const durchgefallen = operas
        .map(w => ({ id: w.id, maengel: pruefeWerk(w, { werke: ohne(operas, w), komponisten: composers }) }))
        .filter(e => e.maengel.length);

    assert.deepEqual(durchgefallen, [],
        'Diese Werke stehen im Katalog, dürften über das Formular aber nicht angelegt werden:\n'
        + durchgefallen.map(e => `  ${e.id}: ${e.maengel.join(' ')}`).join('\n'));
});

test('jedes Haus im Repo genügt den Regeln des Formulars', () => {
    const durchgefallen = operaHouses
        .map(h => ({ id: h.id, maengel: pruefeHaus(h, { haeuser: ohne(operaHouses, h) }) }))
        .filter(e => e.maengel.length);

    assert.deepEqual(durchgefallen, [],
        'Diese Häuser stehen im Katalog, dürften über das Formular aber nicht angelegt werden:\n'
        + durchgefallen.map(e => `  ${e.id}: ${e.maengel.join(' ')}`).join('\n'));
});

test('jeder Komponist im Repo genügt den Regeln des Formulars', () => {
    const durchgefallen = composers
        .map(k => ({ id: k.id, maengel: pruefeKomponist(k, { komponisten: ohne(composers, k) }) }))
        .filter(e => e.maengel.length);

    assert.deepEqual(durchgefallen, [],
        'Diese Komponisten stehen im Katalog, dürften über das Formular aber nicht angelegt werden:\n'
        + durchgefallen.map(e => `  ${e.id}: ${e.maengel.join(' ')}`).join('\n'));
});

test('die Prüfung deckt wirklich den ganzen Katalog ab', () => {
    // Ohne das wäre eine leere Liste oben grün, ohne etwas geprüft zu haben.
    assert.ok(operas.length > 100, `nur ${operas.length} Werke`);
    assert.ok(operaHouses.length > 80, `nur ${operaHouses.length} Häuser`);
    assert.ok(composers.length > 40, `nur ${composers.length} Komponisten`);
});

// Dateien einzelner Wikipedias sind oft "Fair Use" – nur für ihren Artikel
// erlaubt. So kamen der Buchumschlag bei The Greek Passion und das Plakat bei
// Candide in den Katalog (1.10.2026).
test('Bilder nur von Wikimedia Commons, nicht aus einer einzelnen Wikipedia', () => {
    const vorlage = operas.find(o => o.id === 'tosca');
    const commonsMaengel = image => pruefeWerk({ ...vorlage, id: 'probe-werk', title: 'Probewerk', image },
        { werke: operas, komponisten: composers }).filter(m => /Commons/.test(m));
    for (const wiki of ['el', 'en', 'de']) {
        const lokal = `https://upload.wikimedia.org/wikipedia/${wiki}/thumb/6/64/Umschlag.jpg/500px-Umschlag.jpg`;
        assert.equal(commonsMaengel(lokal).length, 1, wiki);
        assert.match(commonsMaengel(lokal)[0], new RegExp(`\\(${wiki}\\)`));
    }
    assert.deepEqual(commonsMaengel(vorlage.image), []);
    // Auch das Porträt eines Komponisten.
    const k = composers[0];
    assert.ok(pruefeKomponist({ ...k, id: 'probe-komponist', name: 'Probe Komponist',
        bild: 'https://upload.wikimedia.org/wikipedia/en/thumb/1/12/Bild.jpg/500px-Bild.jpg' }, { komponisten: composers })
        .some(m => /Commons/.test(m)));
});

test('die erlaubten Bild-Hosts stimmen mit dem Service Worker überein', () => {
    // Die Regeln laufen im Browser und können sw.js nicht lesen; der Service
    // Worker führt seine Liste als klassischer Worker und kann kein Modul
    // importieren. Also steht sie zweimal da – und muss zusammengehalten
    // werden. Ein Host, den nur eine Seite kennt, heißt entweder abgelehnte
    // gute Bilder oder offline leere Kacheln.
    const sw = fs.readFileSync(path.join(WURZEL, 'sw.js'), 'utf8');
    const zeile = sw.match(/const IMAGE_HOSTS = \[([^\]]*)\]/);
    assert.ok(zeile, 'IMAGE_HOSTS nicht in sw.js gefunden');
    const imSw = [...zeile[1].matchAll(/'([^']+)'/g)].map(m => m[1]);

    assert.deepEqual([...BILD_HOSTS].sort(), imSw.sort(),
        'BILD_HOSTS in src/data/katalogRegeln.js und IMAGE_HOSTS in sw.js gehen auseinander');
});
