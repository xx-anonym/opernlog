// Das runde Bild im Kopf der Personenseite (src/pages/PersonDetail.js).
//
// Nachgeschlagen wird erst bei der deutschen, dann bei der englischen
// Wikipedia (src/data/personBild.js). Das Ergebnis merkt sich das Gerät
// 30 Tage, auch "kein Bild" – sonst fragte jede Personenseite bei jedem
// Besuch erneut. Ohne Netz, bei einem Fehler oder ohne passenden Artikel
// erscheint einfach nichts. Gibt es den Artikel, aber kein freies Bild,
// stehen Kurzbeschreibung und Link trotzdem da, im Kreis die Initialen.

import { wikipediaAbfrage, bildAusAntwort } from '../data/personBild.js';
import { nachweisFuer, commonsSeite } from './Bildnachweis.js';
import { nachweisZeile } from '../data/bildnachweisRegeln.js';
import { personSchluessel } from '../data/besetzung.js';

// :2: seit 24.11.2026 – vorher hieß ein Artikel ohne Bild "nichts" und
// hielte sich so noch bis zu 30 Tage.
const SPEICHER = 'opernlog:personBild:2:';
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
 * Der passende Artikel zu einer Person – mit Bild, wo es eins gibt –, oder null.
 * @param {string} name
 * @param {string[]} als  was die Person an den eigenen Abenden war
 */
export async function personBildSuchen(name, als) {
    const schluessel = `${personSchluessel(name)}|${[...new Set(als.map(a => (a === 'Dirigat' || a === 'Regie' ? a : 'Bühne')))].sort().join(',')}`;
    const schon = gemerkt(schluessel);
    if (schon !== undefined) return schon;
    if (navigator.onLine === false) return null;
    const sprachen = ['de', 'en'];
    let ohneBild = null;
    let gefunden = null;
    let beantwortet = 0;
    for (const sprache of sprachen) {
        try {
            const r = await fetch(wikipediaAbfrage(name, sprache));
            if (!r.ok) continue;
            const treffer = bildAusAntwort(await r.json(), als, sprache);
            beantwortet++;
            if (treffer?.bild) {
                // Das Bild aus der englischen, Beschreibung und Link lieber aus der deutschen.
                gefunden = ohneBild ? { ...treffer, beschreibung: ohneBild.beschreibung, seite: ohneBild.seite } : treffer;
                break;
            }
            ohneBild ||= treffer;
        } catch {
            // Kein Netz oder gesperrt: diesmal nichts, beim nächsten Besuch wieder.
        }
    }
    gefunden ||= ohneBild;
    // Gemerkt wird ein Bild, und alles andere nur, wenn jede Wikipedia
    // geantwortet hat. Antwortete die deutsche ohne Bild und die englische
    // gerade nicht (gedrosselt, 429), hielt sich sonst 30 Tage lang "kein
    // Bild" – bei Bartlett Sher steht das Bild nur in der englischen.
    if (gefunden?.bild || beantwortet === sprachen.length) merken(schluessel, gefunden);
    return gefunden;
}

/**
 * Setzt Kurzbeschreibung, Link und – wo es eins gibt – Bild mit Nachweis in
 * den Kopf der Personenseite (.person-hero), sobald sie da sind. Ohne Bild
 * bleiben die Initialen.
 * @param {HTMLElement} kopf
 * @param {string} name  Anzeigename der Person
 * @param {string[]} als
 */
export function personBildImKopf(kopf, name, als) {
    personBildSuchen(name, als).then((treffer) => {
        if (!treffer || !kopf.isConnected) return;
        const beschreibung = kopf.querySelector('.person-hero__beschreibung');
        if (treffer.beschreibung) {
            beschreibung.textContent = treffer.beschreibung;
            beschreibung.hidden = false;
        }
        const quelle = kopf.querySelector('.person-hero__quelle');
        const artikel = Object.assign(document.createElement('a'), {
            href: treffer.seite, target: '_blank', rel: 'noopener noreferrer', textContent: 'Wikipedia',
        });
        quelle.replaceChildren(artikel);
        quelle.hidden = false;
        // Ohne freies Bild bleiben die Initialen.
        if (!treffer.bild) return;

        const platz = kopf.querySelector('.person-hero__bild');
        const initialen = [...platz.childNodes];

        const link = Object.assign(document.createElement('a'), {
            href: treffer.seite, target: '_blank', rel: 'noopener noreferrer', className: 'person-bild__link',
        });
        const img = Object.assign(document.createElement('img'), {
            src: treffer.bild, alt: name, width: 132, height: 132, decoding: 'async',
            className: 'person-bild__bild fade-in',
        });
        // Ein Bild, das nicht lädt: zurück zu den Initialen, ohne Bildnachweis.
        img.addEventListener('error', () => {
            platz.replaceChildren(...initialen);
            quelle.replaceChildren(artikel);
        });
        link.append(img);
        platz.replaceChildren(link);

        // Der Bildnachweis, wo die Lizenz ihn verlangt – wie im Kopf der Werkseiten.
        nachweisFuer(treffer.bild).then((n) => {
            if (!n?.pflicht || !quelle.isConnected || !img.isConnected) return;
            const nachweis = Object.assign(document.createElement('a'), {
                href: n.seite || commonsSeite(treffer.bild), target: '_blank', rel: 'noopener noreferrer',
                className: 'person-bild__nachweis', textContent: nachweisZeile(n),
            });
            quelle.prepend(nachweis, document.createTextNode(' · '));
        });
    });
}
