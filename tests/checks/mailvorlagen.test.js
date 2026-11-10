// Die Mailvorlagen unter supabase/templates/.
//
// Supabase liest sie nicht von hier – sie werden von Hand ins Dashboard
// kopiert (Authentication → Emails → Templates). Fehler darin fallen deshalb
// erst auf, wenn eine echte Mail kaputt ankommt: ein Knopf ohne Link, ein Bild
// von einer Adresse, die es nicht mehr gibt, eine Mail, die Gmail abschneidet.
// Diese Prüfungen fangen das vorher.
//
// Die Dateien erzeugt tests/werkzeug/mailvorlagen.mjs aus einem gemeinsamen
// Gerüst; von Hand geändert, liefen sie auseinander.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MAILS, mailHtml } from '../werkzeug/mailvorlagen.mjs';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ORDNER = path.join(WURZEL, 'supabase/templates');
const SEITE = 'https://opernlog.vercel.app/';

const vorlagen = fs.readdirSync(ORDNER).filter(d => d.endsWith('.html'));
const lies = (datei) => fs.readFileSync(path.join(ORDNER, datei), 'utf8');

test('je Mail genau eine Datei, so wie das Werkzeug sie erzeugt', () => {
    assert.deepEqual([...vorlagen].sort(), MAILS.map(m => m.datei).sort());
    for (const m of MAILS) {
        assert.equal(lies(m.datei), mailHtml(m),
            `${m.datei} weicht ab – node tests/werkzeug/mailvorlagen.mjs laufen lassen`);
    }
    assert.deepEqual(MAILS.map(m => m.dashboard).sort(), ['Change Email Address', 'Confirm signup', 'Magic Link']);
});

// Anmelden und Registrieren gehen über einen Einmalcode (seit 10.11.2026).
// Diese Mails dürfen keinen Link zum Anmelden tragen: am iPhone öffnete er
// Safari statt der installierten App, und Postfächer, die Links zur Prüfung
// selbst aufrufen, verbrauchten ihn.
const MIT_CODE = new Set(MAILS.filter(m => m.code).map(m => m.datei));

test('Registrierung und Anmeldung tragen einen Code, die Adressänderung einen Link', () => {
    assert.deepEqual([...MIT_CODE].sort(), ['anmeldecode.html', 'registrierung.html']);
});

for (const datei of vorlagen) {
    const html = lies(datei);

    if (MIT_CODE.has(datei)) {
        test(`${datei}: der Code steht groß da, und es gibt keinen Link zum Anmelden`, () => {
            // Einmal sichtbar im Text, einmal in der Vorschauzeile des Postfachs.
            const sichtbar = html.replace(/<div style="display:none;[\s\S]*?<\/div>/, '');
            assert.equal((sichtbar.match(/\{\{ \.Token \}\}/g) || []).length, 1);
            assert.match(sichtbar, /<td [^>]*font-size:34px[^>]*>\{\{ \.Token \}\}<\/td>/);
            assert.ok(!html.includes('.ConfirmationURL'), 'die Mail trägt noch einen Anmeldelink');
            assert.ok(!html.includes('.TokenHash'));
            assert.ok(!/class="knopf"/.test(html.replace(/<style>[\s\S]*?<\/style>/g, '')), 'ein Knopf ohne Ziel');
        });
    } else {
        test(`${datei}: der Knopf führt zum Bestätigungslink`, () => {
            assert.match(html, /<a [^>]*class="knopf"[^>]*href="\{\{ \.ConfirmationURL \}\}"/);
            assert.ok(!html.includes('.Token }}'));
        });
    }

    test(`${datei}: nur Variablen, die Supabase kennt, und jedes if hat sein end`, () => {
        const aktionen = [...html.matchAll(/\{\{\s*(.*?)\s*\}\}/g)].map(m => m[1]);
        const bekannt = /^(\.ConfirmationURL|\.SiteURL|\.RedirectTo|\.Email|\.NewEmail|\.Token|\.TokenHash|\.Data\.\w+|if \.Data\.\w+|else|end)$/;
        for (const a of aktionen) assert.match(a, bekannt, `unbekannt: {{ ${a} }}`);
        const ifs = aktionen.filter(a => a.startsWith('if ')).length;
        assert.equal(aktionen.filter(a => a === 'end').length, ifs);
    });

    test(`${datei}: keine Template-Klammern in HTML-Kommentaren`, () => {
        // Supabase wertet die Vorlage als Go-Template aus – auch dort.
        for (const [kommentar] of html.matchAll(/<!--[\s\S]*?-->/g)) {
            assert.ok(!kommentar.includes('{{'), kommentar.slice(0, 80));
        }
    });

    test(`${datei}: Bilder und Schriften nur von der eigenen Seite, und dort gibt es sie`, () => {
        const adressen = [...html.matchAll(/(?:src="|url\(')(https?:\/\/[^"')]+)/g)].map(m => m[1]);
        assert.ok(adressen.length > 0);
        for (const a of adressen) {
            assert.ok(a.startsWith(SEITE), `fremde Adresse: ${a}`);
            const lokal = path.join(WURZEL, a.slice(SEITE.length));
            assert.ok(fs.existsSync(lokal), `${a} liegt nicht im Repo – nach dem nächsten Deploy fehlt es`);
        }
    });

    test(`${datei}: klein genug, dass Gmail nichts abschneidet`, () => {
        // Gmail kürzt Mails über 102 KB und versteckt den Rest hinter einem Link.
        assert.ok(Buffer.byteLength(html) < 60 * 1024, `${Buffer.byteLength(html)} Bytes`);
    });

    test(`${datei}: fest auf Dunkel, damit kein Programm die Farben umkehrt`, () => {
        assert.match(html, /<meta name="color-scheme" content="dark">/);
        assert.match(html, /<html lang="de"/);
    });
}

// ── Die Animation für Apple Mail ───────────────────────────────────────
//
// Sie darf nichts kosten, wo sie nicht läuft: Gmail und Outlook kennen
// @keyframes nicht und müssen die Mail trotzdem vollständig zeigen.

const styleBloecke = (html) => [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]);
const ohneKeyframes = (css) => css.replace(/@keyframes\s+\w+\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '');

for (const datei of vorlagen) {
    const html = lies(datei);
    const bloecke = styleBloecke(html);
    const auftritt = bloecke.find(b => b.includes('@keyframes'));

    test(`${datei}: die Animation steht in einem eigenen <style>-Block`, () => {
        assert.ok(auftritt, 'keine Animation gefunden');
        assert.equal(bloecke.filter(b => b.includes('@keyframes')).length, 1);
        assert.ok(!auftritt.includes('@font-face') && !auftritt.includes('.innen'),
            'Schriften oder Grundgerüst im selben Block – verwirft ein Programm ihn, wären sie mit weg');
    });

    test(`${datei}: animiert wird nur, wo niemand "Bewegung reduzieren" eingeschaltet hat`, () => {
        const rest = ohneKeyframes(auftritt);
        const media = rest.match(/@media \(prefers-reduced-motion: no-preference\) \{([\s\S]*)\}\s*$/);
        assert.ok(media, 'kein Block für prefers-reduced-motion');
        const draussen = rest.replace(media[0], '');
        assert.ok(!/animation\s*:/.test(draussen), `animation außerhalb des Blocks:\n${draussen}`);
    });

    test(`${datei}: nach dem Auftritt gilt wieder der eigene Stil (Füllmodus backwards)`, () => {
        // An Kommas trennen, aber nicht an denen in cubic-bezier(…).
        const angaben = [...auftritt.matchAll(/animation\s*:([^;]+);/g)].flatMap(m => m[1].split(/,(?![^(]*\))/));
        assert.ok(angaben.length >= 8);
        for (const a of angaben) assert.match(a, /\bbackwards\b/, a.trim());
    });

    test(`${datei}: unsichtbar ist etwas nur innerhalb der @keyframes`, () => {
        // Sonst bliebe es in einem Programm ohne Animation für immer unsichtbar.
        const ohne = ohneKeyframes(html)
            .replace(/<div style="display:none;[^"]*"/, '');   // die Vorschauzeile – sie soll unsichtbar sein
        assert.ok(!/opacity\s*:\s*0(?![.\d])/.test(ohne), 'opacity:0 außerhalb der Keyframes');
        assert.ok(!/visibility\s*:\s*hidden/.test(ohne));
    });
}
