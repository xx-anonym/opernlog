// Das Logo für BIMI: icons/bimi.svg.
//
// Mailprogramme, die BIMI kennen (Yahoo, AOL, Fastmail …), zeigen neben Mails
// von opernlog.de dieses Bild. Gefunden wird es über den DNS-Eintrag
// default._bimi.opernlog.de bei STRATO, der auf
// https://opernlog.vercel.app/icons/bimi.svg zeigt. Gmail und Apple Mail
// verlangen zusätzlich ein bezahltes Markenzertifikat (VMC/CMC); das gibt es
// nicht.
//
// BIMI nimmt nur SVG im Profil "SVG Tiny Portable/Secure". Verstößt die Datei
// dagegen, zeigt das Mailprogramm einfach nichts – ohne Fehlermeldung
// irgendwo. Deshalb prüft dieser Test die Regeln, auf die es ankommt:
// Profilangabe, Titel, quadratisch, keine Position oder Größe am
// Wurzelelement, nichts Aktives oder Nachgeladenes, deckender Hintergrund
// (die Programme schneiden das Bild rund oder mit runden Ecken zu) und
// höchstens 32 KB.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DATEI = path.join(WURZEL, 'icons/bimi.svg');
const svg = () => fs.readFileSync(DATEI, 'utf8');
const wurzel = () => svg().match(/<svg\b[^>]*>/)?.[0] ?? '';

test('das BIMI-Logo gibt es und es ist klein genug', () => {
    assert.ok(fs.existsSync(DATEI), 'icons/bimi.svg fehlt');
    assert.ok(fs.statSync(DATEI).size <= 32 * 1024, 'BIMI erlaubt höchstens 32 KB');
});

test('das Wurzelelement erfüllt SVG Tiny PS', () => {
    const w = wurzel();
    assert.match(w, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(w, /\bversion="1\.2"/);
    assert.match(w, /\bbaseProfile="tiny-ps"/);
    const vb = w.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
    assert.ok(vb, 'viewBox fehlt oder beginnt nicht bei 0 0');
    assert.equal(vb[1], vb[2], 'das Logo muss quadratisch sein');
    for (const attribut of ['x', 'y', 'width', 'height']) {
        assert.doesNotMatch(w, new RegExp(`\\s${attribut}=`), `${attribut}= ist am Wurzelelement nicht erlaubt`);
    }
});

test('das BIMI-Logo hat einen Titel', () => {
    const titel = svg().match(/<title>([^<]*)<\/title>/)?.[1]?.trim() ?? '';
    assert.ok(titel, '<title> fehlt');
    assert.ok(titel.length <= 65, 'Titel zu lang');
});

test('nichts Aktives oder Nachgeladenes im BIMI-Logo', () => {
    const text = svg();
    for (const element of ['script', 'image', 'foreignObject', 'style', 'a', 'animate', 'set', 'use']) {
        assert.doesNotMatch(text, new RegExp(`<${element}\\b`), `<${element}> ist in SVG Tiny PS nicht erlaubt`);
    }
    assert.doesNotMatch(text, /\bhref=/, 'keine Verweise');
    assert.doesNotMatch(text, /\son[a-z]+=/i, 'keine Ereignisse');
});

test('das BIMI-Logo hat einen deckenden Hintergrund über die ganze Fläche', () => {
    const groesse = wurzel().match(/viewBox="0 0 (\d+)/)[1];
    const hintergrund = svg().match(/<rect\b[^>]*>/)?.[0] ?? '';
    assert.match(hintergrund, new RegExp(`width="${groesse}"`));
    assert.match(hintergrund, new RegExp(`height="${groesse}"`));
    assert.doesNotMatch(hintergrund, /\b(x|y|rx|ry)="(?!0")/, 'Hintergrund verschoben oder mit runden Ecken');
    assert.match(hintergrund, /fill="#[0-9a-f]{6}"/i, 'Hintergrund braucht eine feste Farbe');
});
