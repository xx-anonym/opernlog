// Das runde Bild unter den Abenden einer Person (src/pages/PersonDetail.js).
//
// Nachgeschlagen wird erst bei der deutschen, dann bei der englischen
// Wikipedia (src/data/personBild.js). Das Ergebnis merkt sich das Gerät
// 30 Tage, auch "kein Bild" – sonst fragte jede Personenseite bei jedem
// Besuch erneut. Ohne Netz, bei einem Fehler oder ohne passendes Bild
// erscheint einfach nichts.

import { wikipediaAbfrage, bildAusAntwort } from '../data/personBild.js';
import { nachweisFuer, commonsSeite } from './Bildnachweis.js';
import { nachweisZeile } from '../data/bildnachweisRegeln.js';
import { personSchluessel } from '../data/besetzung.js';

const SPEICHER = 'opernlog:personBild:';
const GUELTIG_MS = 30 * 24 * 3600e3;

function gemerkt(schluessel) {
    try {
        const roh = localStorage.getItem(SPEICHER + schluessel);
        if (!roh) return undefined;
        const { zeit, bild } = JSON.parse(roh);
        return Date.now() - zeit < GUELTIG_MS ? bild : undefined;
    } catch {
        return undefined;
    }
}

function merken(schluessel, bild) {
    try { localStorage.setItem(SPEICHER + schluessel, JSON.stringify({ zeit: Date.now(), bild })); } catch { /* egal */ }
}

/**
 * Das Bild zu einer Person, oder null.
 * @param {string} name
 * @param {string[]} als  was die Person an den eigenen Abenden war
 */
export async function personBildSuchen(name, als) {
    const schluessel = `${personSchluessel(name)}|${[...new Set(als.map(a => (a === 'Dirigat' || a === 'Regie' ? a : 'Bühne')))].sort().join(',')}`;
    const schon = gemerkt(schluessel);
    if (schon !== undefined) return schon;
    if (navigator.onLine === false) return null;
    const sprachen = ['de', 'en'];
    let gefunden = null;
    let beantwortet = 0;
    for (const sprache of sprachen) {
        try {
            const r = await fetch(wikipediaAbfrage(name, sprache));
            if (!r.ok) continue;
            gefunden = bildAusAntwort(await r.json(), als, sprache);
            beantwortet++;
            if (gefunden) break;
        } catch {
            // Kein Netz oder gesperrt: diesmal nichts, beim nächsten Besuch wieder.
        }
    }
    // Gemerkt wird ein Bild, und "kein Bild" nur, wenn jede Wikipedia
    // geantwortet hat. Antwortete die deutsche ohne Treffer und die englische
    // gerade nicht (gedrosselt, 429), hielt sich sonst 30 Tage lang "kein
    // Bild" – bei Bartlett Sher steht das Bild nur in der englischen.
    if (gefunden || beantwortet === sprachen.length) merken(schluessel, gefunden);
    return gefunden;
}

/**
 * Hängt das Bild an `ziel`, sobald es da ist.
 * @param {HTMLElement} ziel
 * @param {string} name  Anzeigename der Person
 * @param {string[]} als
 */
export function personBildEinsetzen(ziel, name, als) {
    personBildSuchen(name, als).then((treffer) => {
        if (!treffer || !ziel.isConnected) return;
        const figur = document.createElement('figure');
        figur.className = 'person-bild fade-in';

        const link = Object.assign(document.createElement('a'), {
            href: treffer.seite, target: '_blank', rel: 'noopener noreferrer', className: 'person-bild__link',
        });
        const img = Object.assign(document.createElement('img'), {
            src: treffer.bild, alt: name, width: 140, height: 140, loading: 'lazy', decoding: 'async',
            className: 'person-bild__bild',
        });
        // Ein Bild, das nicht lädt, nimmt die ganze Figur mit.
        img.addEventListener('error', () => figur.remove());
        link.append(img);

        const unterschrift = document.createElement('figcaption');
        unterschrift.className = 'person-bild__unterschrift';
        const artikel = Object.assign(document.createElement('a'), {
            href: treffer.seite, target: '_blank', rel: 'noopener noreferrer', textContent: 'Wikipedia',
        });
        unterschrift.append(artikel);
        figur.append(link, unterschrift);
        ziel.append(figur);

        // Der Bildnachweis, wo die Lizenz ihn verlangt – wie im Kopf der Werkseiten.
        nachweisFuer(treffer.bild).then((n) => {
            if (!n?.pflicht || !figur.isConnected) return;
            const nachweis = Object.assign(document.createElement('a'), {
                href: n.seite || commonsSeite(treffer.bild), target: '_blank', rel: 'noopener noreferrer',
                className: 'person-bild__nachweis', textContent: nachweisZeile(n),
            });
            unterschrift.append(document.createTextNode(' · '), nachweis);
        });
    });
}
