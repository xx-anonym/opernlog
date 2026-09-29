// Die Startbilder für das iPhone (tests/werkzeug/startbilder-erzeugen.mjs).
//
// iOS nimmt ein Startbild nur, wenn es auf den Pixel zum Gerät passt; sonst
// zeigt es ohne jede Meldung wieder Schwarz. Deshalb hier: jedes Bild, das
// index.html nennt, gibt es, und seine Größe ist Breite und Höhe aus media
// mal Pixeldichte.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GERAETE, dateiname } from '../werkzeug/startbilder-erzeugen.mjs';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const html = fs.readFileSync(path.join(WURZEL, 'index.html'), 'utf8');

const eintraege = [...html.matchAll(/<link rel="apple-touch-startup-image" href="([^"]+)"\s+media="([^"]+)"/g)]
    .map(([, href, media]) => {
        const zahl = name => Number(new RegExp(`${name}:\\s*([\\d.]+)`).exec(media)?.[1]);
        return { href, w: zahl('device-width'), h: zahl('device-height'), dpr: zahl('-webkit-device-pixel-ratio'), media };
    });

/** Breite und Höhe eines JPEG aus dem SOF-Abschnitt. */
function jpegGroesse(datei) {
    const b = fs.readFileSync(datei);
    let i = 2;
    while (i < b.length) {
        const marke = b[i + 1];
        const laenge = b.readUInt16BE(i + 2);
        if (marke >= 0xc0 && marke <= 0xc3) return { breite: b.readUInt16BE(i + 7), hoehe: b.readUInt16BE(i + 5) };
        i += 2 + laenge;
    }
    throw new Error(`keine Größe in ${datei}`);
}

test('index.html nennt für jedes Gerät aus dem Werkzeug ein Startbild, hochkant', () => {
    assert.equal(eintraege.length, GERAETE.length);
    for (const g of GERAETE) {
        const e = eintraege.find(x => x.href === `icons/start/${dateiname(g)}`);
        assert.ok(e, `fehlt: ${dateiname(g)}`);
        assert.deepEqual([e.w, e.h, e.dpr], [g.w, g.h, g.dpr], e.href);
        assert.match(e.media, /orientation: portrait/);
    }
});

test('jedes Startbild gibt es, und es passt auf den Pixel zu seinem Gerät', () => {
    for (const e of eintraege) {
        const datei = path.join(WURZEL, e.href);
        assert.ok(fs.existsSync(datei), `fehlt: ${e.href}`);
        assert.deepEqual(jpegGroesse(datei), { breite: e.w * e.dpr, hoehe: e.h * e.dpr }, e.href);
    }
});
