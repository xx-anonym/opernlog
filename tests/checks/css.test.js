// Ein var(--x) auf eine nirgends definierte Eigenschaft macht nicht nur diese
// eine Angabe ungültig, sondern die ganze Deklaration – der Browser wirft sie
// weg und meldet nichts. So standen die Ziffern auf der Einladungsseite
// monatelang auf durchsichtigem Grund: --primary gab es nicht.
//
// Ein var() mit Rückfallwert – var(--x, 80px) – ist unbedenklich und wird
// deshalb übergangen.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const css = fs.readFileSync(path.join(WURZEL, 'style.css'), 'utf8');

function jsDateien(verzeichnis = 'src') {
    return fs.readdirSync(path.join(WURZEL, verzeichnis), { withFileTypes: true })
        .flatMap(e => e.isDirectory()
            ? jsDateien(path.posix.join(verzeichnis, e.name))
            : (e.name.endsWith('.js') ? [path.posix.join(verzeichnis, e.name)] : []));
}

const jsQuelle = jsDateien().map(f => fs.readFileSync(path.join(WURZEL, f), 'utf8')).join('\n');

// Definiert ist eine Eigenschaft, wenn sie im Stylesheet gesetzt wird oder zur
// Laufzeit über setProperty – RatingsHistogram.js macht Letzteres.
const definiert = new Set([
    ...[...css.matchAll(/(?:^|[;{]|\*\/)\s*(--[\w-]+)\s*:/gm)].map(m => m[1]),
    ...[...jsQuelle.matchAll(/setProperty\(\s*['"`](--[\w-]+)/g)].map(m => m[1]),
]);

/** Alle var(...)-Aufrufe ohne Rückfallwert, samt Fundstelle. */
function verwendungenOhneRueckfall(quelle, name) {
    const treffer = [];
    const zeilen = quelle.split('\n');
    zeilen.forEach((zeile, i) => {
        for (const m of zeile.matchAll(/var\(\s*(--[\w-]+)\s*([,)])/g)) {
            if (m[2] === ',') continue;         // hat einen Rückfallwert
            treffer.push({ eigenschaft: m[1], stelle: `${name}:${i + 1}` });
        }
    });
    return treffer;
}

test('jede benutzte CSS-Eigenschaft ist auch definiert', () => {
    const fehlend = verwendungenOhneRueckfall(css, 'style.css')
        .filter(v => !definiert.has(v.eigenschaft));
    assert.deepEqual(fehlend, [],
        'Diese Eigenschaften werden benutzt, aber nirgends gesetzt – die ganze '
        + 'Deklaration fällt dadurch aus:\n  '
        + fehlend.map(v => `${v.eigenschaft} (${v.stelle})`).join('\n  '));
});

test('auch die im JavaScript gesetzten Stile benutzen nur definierte Eigenschaften', () => {
    const fehlend = jsDateien()
        .flatMap(f => verwendungenOhneRueckfall(fs.readFileSync(path.join(WURZEL, f), 'utf8'), f))
        .filter(v => !definiert.has(v.eigenschaft));
    assert.deepEqual(fehlend, [],
        fehlend.map(v => `${v.eigenschaft} (${v.stelle})`).join('\n  '));
});

test('die Grundfarben sind da', () => {
    // Fällt eine davon weg, ist die App unbenutzbar, nicht nur schief.
    for (const n of ['--bg-primary', '--text-primary', '--accent']) {
        assert.ok(definiert.has(n), `${n} fehlt`);
    }
});

test('das Listenfenster begrenzt seine Höhe', () => {
    // Ohne diese Kette wächst ein Fenster mit vielen Einträgen über den
    // Bildschirm hinaus und schiebt die Überschrift nach oben heraus.
    const block = css.match(/\.modal__content\s*\{[^}]*\}/);
    assert.ok(block, '.modal__content nicht gefunden');
    assert.match(block[0], /max-height:\s*100%/,
        'max-height: 100% bindet das Fenster an den gepolsterten Rahmen');
});

test('auf dem Handy bleibt oben Platz für die Kopfzeile', () => {
    // Das Fenster wird im Sichtfeld zentriert, die Navigation liegt aber fest
    // in dessen oberen 68 px. Ohne diese Polsterung verschwindet die
    // Überschrift dahinter.
    const mobil = css.match(/@media\s*\(max-width:\s*900px\)\s*\{[\s\S]*?\n\}/g) || [];
    const passend = mobil.some(b => /\.modal\s*\{[^}]*padding-top:\s*calc\([^}]*safe-area-inset-top/.test(b));
    assert.ok(passend, '.modal braucht unter 900px ein padding-top mit env(safe-area-inset-top)');
});
