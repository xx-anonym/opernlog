// Der Katalog ist von Hand gepflegt: über 90 Häuser, gut 100 Werke, jedes mit Bild
// und Koordinaten. Ein Tippfehler in einer Id fällt beim Lesen nicht auf, in
// der App aber sehr wohl – ein Besuch zeigt dann ein leeres Haus.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { operaHouses } from '../../src/data/operaHouses.js';
import { operas } from '../../src/data/operas.js';
import { composers, composerByName } from '../../src/data/composers.js';

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

test('jedes Haus liegt in dem Land, das an ihm steht', () => {
    // Grobe Umrisse der drei Länder. Sie fangen, was eine allgemeine
    // Bereichsprüfung durchlässt: vertauschte lat/lon, ein verrutschtes
    // Komma, eine aus der falschen Zeile kopierte Koordinate. Ein Haus in
    // Bregenz mit Wiener Koordinaten sähe sonst niemand – außer dem Nutzer,
    // dem beim Loggen das falsche Haus vorgeschlagen wird.
    const KASTEN = {
        'Österreich': { lat: [46.3, 49.1], lon: [9.4, 17.2] },
        'Schweiz': { lat: [45.8, 47.9], lon: [5.9, 10.6] },
    };
    // Alles Übrige ist Deutschland – dort steht im Feld das Bundesland.
    const DEUTSCHLAND = { lat: [47.2, 55.1], lon: [5.8, 15.1] };

    for (const h of operaHouses) {
        const k = KASTEN[h.state] || DEUTSCHLAND;
        const land = KASTEN[h.state] ? h.state : 'Deutschland';
        assert.ok(h.lat >= k.lat[0] && h.lat <= k.lat[1],
            `${h.id}: Breite ${h.lat} liegt nicht in ${land}`);
        assert.ok(h.lon >= k.lon[0] && h.lon <= k.lon[1],
            `${h.id}: Länge ${h.lon} liegt nicht in ${land}`);
    }
});

test('alle drei Länder sind vertreten', () => {
    const laender = new Set(operaHouses.map(h => h.state));
    assert.ok(laender.has('Österreich'), 'Österreich fehlt');
    assert.ok(laender.has('Schweiz'), 'Schweiz fehlt');
    assert.ok(laender.size > 10, 'die deutschen Bundesländer fehlen');
});

test('die österreichischen Häuser sind vollständig eingetragen', () => {
    const at = operaHouses.filter(h => h.state === 'Österreich');
    assert.ok(at.length >= 20, `nur ${at.length} österreichische Häuser`);
    // Die Salzburger Festspielhäuser liegen keine hundert Meter auseinander;
    // wenn die Vorauswahl beim Loggen sie unterscheiden soll, müssen es
    // wirklich drei verschiedene Punkte sein.
    const salzburg = at.filter(h => h.city === 'Salzburg');
    assert.equal(salzburg.length, 4);
    assert.equal(new Set(salzburg.map(h => `${h.lat},${h.lon}`)).size, 4);
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

/**
 * Alle Bildadressen des Katalogs, mit der Id dazu.
 *
 * Beide Feldnamen, und das ist kein Schönheitsfehler: die Häuser führen das
 * Bild als imageUrl, die Werke als image. Die Prüfung darunter fragte nur nach
 * imageUrl und übersprang damit stillschweigend alle 121 Werke – sie war grün,
 * weil sie 92 statt 213 Adressen ansah.
 */
function bildAdressen() {
    return [...operaHouses, ...operas]
        .map(e => ({ id: e.id, url: e.imageUrl || e.image }))
        .filter(e => e.url);
}

test('der Katalog führt zu jedem Eintrag ein Bild', () => {
    // Sonst deckt die Prüfung darunter wieder weniger ab, als sie vorgibt.
    assert.equal(bildAdressen().length, operaHouses.length + operas.length);
});

test('Bilder kommen über https und von einem Host, den der Service Worker kennt', () => {
    // Fremde Hosts überspringt der fetch-Handler; ein Bild von woanders wäre
    // offline eine leere Kachel.
    const sw = fs.readFileSync(path.join(WURZEL, 'sw.js'), 'utf8');
    const zeile = sw.match(/const IMAGE_HOSTS = \[([^\]]*)\]/);
    assert.ok(zeile, 'IMAGE_HOSTS nicht in sw.js gefunden');
    const erlaubt = new Set([...zeile[1].matchAll(/'([^']+)'/g)].map(m => m[1]));

    for (const e of bildAdressen()) {
        const url = new URL(e.url);
        assert.equal(url.protocol, 'https:', `${e.id}: kein https`);
        assert.ok(erlaubt.has(url.hostname),
            `${e.id}: ${url.hostname} steht nicht in IMAGE_HOSTS – offline bliebe die Kachel leer`);
    }
});

test('Bilder sind verkleinerte Fassungen, keine Originale', () => {
    // Die Opernliste lud einmal 135 MB nach: 120 Bilder für zwei sichtbare
    // Karten, 80 davon in Originalgröße, das größte 39,6 MB. Die Karte ist
    // 341 x 80 px, der Hero der Detailseite 343 x 305 px – 500px reicht für
    // beides und bringt den ganzen Katalog auf rund 17 MB.
    //
    // Wikimedia nimmt nur eine feste Liste von Breiten an und antwortet auf
    // alles andere mit HTTP 400: 120, 250, 330, 500, 960, 1280. Wer hier
    // erhöhen will, muss eine davon nehmen – 640 gibt es nicht.
    const zuGross = [];
    for (const e of bildAdressen()) {
        const m = e.url.match(/\/thumb\/.*\/(\d+)px-/);
        if (!m) { zuGross.push(`${e.id}: Original statt /thumb/`); continue; }
        if (Number(m[1]) > 500) zuGross.push(`${e.id}: ${m[1]}px`);
    }
    assert.deepEqual(zuGross, [],
        `zu große Bilder – jedes wird beim Öffnen der Liste geladen:\n  ${zuGross.join('\n  ')}`);
});

test('zu jedem Komponisten im Werkkatalog gibt es einen Eintrag', () => {
    // Der Name ist der Schlüssel – er steht als Freitext im Werk und muss
    // zeichengleich im Komponistenkatalog stehen. Ein zusätzliches Leerzeichen
    // oder ein anderer Vorname, und die Werkseite verlinkt ins Leere.
    const fehlend = [...new Set(operas.map(o => o.composer))]
        .filter(n => !composerByName(n))
        .sort();
    assert.deepEqual(fehlend, [],
        `ohne Eintrag in composers.js – tests/werkzeug/komponisten-holen.mjs holt sie:\n  ${fehlend.join('\n  ')}`);
});

test('der Komponistenkatalog führt niemanden ohne Werk', () => {
    // Sonst stünde eine Seite herum, auf die nichts zeigt.
    const namen = new Set(operas.map(o => o.composer));
    const ohneWerk = composers.filter(c => !namen.has(c.name)).map(c => c.id);
    assert.deepEqual(ohneWerk, []);
});

test('Komponisten-Ids sind eindeutig und url-tauglich', () => {
    assert.deepEqual(doppelte(composers.map(c => c.id)), []);
    for (const c of composers) {
        assert.match(c.id, /^[a-z0-9-]+$/, `unbrauchbare Id: ${c.id}`);
    }
});

test('jeder Komponist hat Kurzfassung, Biografie und Artikel', () => {
    // Ohne Artikel dürfte der Text nicht hier stehen: er stammt aus der
    // Wikipedia und steht unter CC BY-SA, das verlangt die Herkunftsangabe.
    for (const c of composers) {
        assert.ok(c.kurz?.trim(), `${c.id}: keine Kurzfassung`);
        assert.ok(c.bio?.trim(), `${c.id}: keine Biografie`);
        assert.match(c.wikipedia || '', /^https:\/\/de\.wikipedia\.org\/wiki\//, `${c.id}: kein Artikel`);
    }
});

test('Biografien enden auf einem Satzende', () => {
    // Der Text wird bei 320 Zeichen geschnitten. Mitten im Satz abzubrechen
    // sähe nach einem Fehler aus, nicht nach einer Kurzfassung.
    for (const c of composers) {
        assert.match(c.bio, /[.!?]$/, `${c.id}: bricht ab – "…${c.bio.slice(-40)}"`);
    }
});

test('Komponistenporträts sind verkleinert und nennen ihre Lizenz', () => {
    // Dieselbe Breite wie der übrige Katalog, und ohne Lizenzangabe dürfte
    // ein Bild hier nicht stehen. Ein Komponist ohne freies Porträt hat kein
    // Bild – das ist erlaubt, die Seite zeigt dann den Verlauf.
    for (const c of composers.filter(c => c.bild)) {
        assert.match(c.bild, /^https:\/\/upload\.wikimedia\.org\/wikipedia\/commons\/thumb\//, `${c.id}: kein Commons-Thumbnail`);
        assert.match(c.bild, /\/500px-|\/lossy-page1-500px-/, `${c.id}: nicht 500px breit`);
        assert.ok(c.bildLizenz?.trim(), `${c.id}: Bild ohne Lizenzangabe`);
    }
});

test('jedes Haus hat eine Farbe als Rückfallebene für fehlende Bilder', () => {
    for (const h of operaHouses) {
        assert.match(h.color || '', /^#[0-9a-fA-F]{6}$/, `${h.id}: keine Farbe`);
    }
});
