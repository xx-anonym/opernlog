// Die Mailvorlagen unter supabase/templates/.
//
// Supabase liest sie nicht von hier – sie werden von Hand ins Dashboard
// kopiert (Authentication → Emails → Templates). Fehler darin fallen deshalb
// erst auf, wenn eine echte Mail kaputt ankommt: ein Knopf ohne Link, ein Bild
// von einer Adresse, die es nicht mehr gibt, eine Mail, die Gmail abschneidet.
// Diese Prüfungen fangen das vorher.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ORDNER = path.join(WURZEL, 'supabase/templates');
const SEITE = 'https://opernlog.vercel.app/';

const vorlagen = fs.readdirSync(ORDNER).filter(d => d.endsWith('.html'));
const lies = (datei) => fs.readFileSync(path.join(ORDNER, datei), 'utf8');

test('es gibt die Registrierungsmail', () => {
    assert.ok(vorlagen.includes('registrierung.html'), vorlagen.join(', '));
});

for (const datei of vorlagen) {
    const html = lies(datei);

    test(`${datei}: der Knopf führt zum Bestätigungslink`, () => {
        assert.match(html, /<a [^>]*class="knopf"[^>]*href="\{\{ \.ConfirmationURL \}\}"/);
    });

    test(`${datei}: nur Variablen, die Supabase kennt, und jedes if hat sein end`, () => {
        const aktionen = [...html.matchAll(/\{\{\s*(.*?)\s*\}\}/g)].map(m => m[1]);
        const bekannt = /^(\.ConfirmationURL|\.SiteURL|\.RedirectTo|\.Email|\.Token|\.TokenHash|\.Data\.\w+|if \.Data\.\w+|else|end)$/;
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
