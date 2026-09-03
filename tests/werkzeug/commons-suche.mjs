// Sucht Bilder für neue Katalogeinträge in Wikimedia Commons.
//
// Warum ein Werkzeug und nicht geraten: die Adresse eines Commons-Bildes
// lässt sich aus dem Dateinamen berechnen (siehe commons.mjs), der Dateiname
// selbst aber nicht erraten. Wer ihn rät, bekommt eine tote Adresse, und in
// der App bleibt die Kachel beim farbigen Verlauf – ohne Fehlermeldung.
//
// Das Werkzeug läuft dort, wo Wikimedia erreichbar ist (etwa in der CI). Es
// liest Suchbegriffe aus einer JSON-Datei und gibt zu jedem Eintrag die
// Kandidaten samt Maßen aus; ausgewählt wird danach von Hand.
//
// Aufruf:  node tests/werkzeug/commons-suche.mjs tests/werkzeug/suche.json

import fs from 'node:fs';
import { holen } from './commons.mjs';

const datei = process.argv[2];
if (!datei) {
    console.error('Aufruf: node tests/werkzeug/commons-suche.mjs <suche.json>');
    process.exit(2);
}

const eintraege = JSON.parse(fs.readFileSync(datei, 'utf8'));

/** Volltextsuche im Dateinamensraum von Commons. */
async function suche(begriff, anzahl = 6) {
    const url = 'https://commons.wikimedia.org/w/api.php?action=query&format=json'
        + '&generator=search&gsrnamespace=6&gsrlimit=' + anzahl
        + '&gsrsearch=' + encodeURIComponent(begriff)
        + '&prop=imageinfo&iiprop=url|size|mime';
    const { ok, status, antwort } = await holen(url, { methode: 'GET' });
    if (!ok) return { fehler: `HTTP ${status}` };

    const daten = await antwort.json();
    const seiten = Object.values(daten?.query?.pages || {});
    return {
        treffer: seiten
            .map(s => ({
                name: s.title.replace(/^(File|Datei):/, ''),
                breite: s.imageinfo?.[0]?.width,
                hoehe: s.imageinfo?.[0]?.height,
                typ: s.imageinfo?.[0]?.mime,
                index: s.index,
            }))
            // Querformat und ausreichend groß: die Kacheln zeigen einen
            // breiten Streifen, ein Hochkantbild wird darin unbrauchbar.
            .filter(t => t.breite && t.breite >= 800 && t.breite > t.hoehe)
            .sort((a, b) => a.index - b.index),
    };
}

for (const eintrag of eintraege) {
    console.log(`\n### ${eintrag.id}`);
    for (const begriff of eintrag.begriffe) {
        const { treffer, fehler } = await suche(begriff);
        if (fehler) { console.log(`  "${begriff}" -> ${fehler}`); continue; }
        console.log(`  "${begriff}"`);
        if (!treffer.length) { console.log('    (nichts Passendes)'); continue; }
        for (const t of treffer) {
            console.log(`    ${t.breite}x${t.hoehe}  ${t.name}`);
        }
    }
}
