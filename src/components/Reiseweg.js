// Der Weg zwischen den Häusern einer Spielzeit als schlichte Linie über den
// Ländergrenzen – für die Story des Saisonrückblicks, Folie "Zwischen den
// Häusern" (Jonas, 3.10.2026). Die Halte kommen aus reiseweg() in
// src/data/season.js.
//
// Projektion wie bei der Häuserkarte (HouseMap.js): Länge mit dem Kosinus der
// mittleren Breite gestaucht, Norden oben. Der Ausschnitt umfasst die Halte,
// aber mindestens gut zwei Breitengrade, damit zwei Nachbarstädte nicht das
// ganze Bild füllen. Je Strecke ein flacher Bogen statt einer Geraden: Hin-
// und Rückweg zwischen zwei Häusern liegen dann nebeneinander statt
// übereinander.

import { LAENDER } from '../data/landkarte.js';
import { escapeHTML } from '../utils.js';

const BREITE = 300;
const HOEHE = 220;
const RAND = 22;
const MIN_SPANNE = 2.2;   // Grad Breite
const BOGEN = 0.18;       // Ausbuchtung je Strecke, Anteil ihrer Länge

const zahl = n => n.toFixed(1);

/**
 * @param {Array<{id: string, lat: number, lon: number}>} halte  in Reihenfolge
 * @returns {string} SVG, leer bei weniger als zwei Halten
 */
export function reisewegSVG(halte) {
    if (!halte || halte.length < 2) return '';

    const lats = halte.map(h => h.lat);
    const kosinus = Math.cos(((Math.min(...lats) + Math.max(...lats)) / 2) * Math.PI / 180);
    const xs = halte.map(h => h.lon * kosinus);
    const mitteX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const mitteY = (Math.min(...lats) + Math.max(...lats)) / 2;
    const spanneX = Math.max(Math.max(...xs) - Math.min(...xs), MIN_SPANNE * BREITE / HOEHE);
    const spanneY = Math.max(Math.max(...lats) - Math.min(...lats), MIN_SPANNE);
    const mass = Math.min((BREITE - 2 * RAND) / spanneX, (HOEHE - 2 * RAND) / spanneY);
    const punkt = (lon, lat) => [BREITE / 2 + (lon * kosinus - mitteX) * mass, HOEHE / 2 - (lat - mitteY) * mass];

    const laender = LAENDER.map(land => `<path class="reiseweg__land" d="${land.ringe.map((ring) => {
        let d = '';
        for (let i = 0; i < ring.length; i += 2) {
            const [x, y] = punkt(ring[i], ring[i + 1]);
            d += `${i ? 'L' : 'M'}${zahl(x)} ${zahl(y)}`;
        }
        return `${d}Z`;
    }).join('')}"/>`).join('');

    const p = halte.map(h => punkt(h.lon, h.lat));
    let linie = `M${zahl(p[0][0])} ${zahl(p[0][1])}`;
    for (let i = 1; i < p.length; i++) {
        const [x0, y0] = p[i - 1];
        const [x1, y1] = p[i];
        // Kontrollpunkt: Mitte der Strecke, quer zur Richtung verschoben.
        const kx = (x0 + x1) / 2 - (y1 - y0) * BOGEN;
        const ky = (y0 + y1) / 2 + (x1 - x0) * BOGEN;
        linie += `Q${zahl(kx)} ${zahl(ky)} ${zahl(x1)} ${zahl(y1)}`;
    }

    // Je Haus ein Punkt, auch wenn man mehrmals dort war.
    const punkte = [...new Map(halte.map(h => [h.id, h])).values()].map((h) => {
        const [x, y] = punkt(h.lon, h.lat);
        return `<circle class="reiseweg__halt" data-haus="${escapeHTML(h.id)}" cx="${zahl(x)}" cy="${zahl(y)}" r="4.5"/>`;
    }).join('');

    // Die Grenzen laufen zum Rand hin aus – sonst enden sie hart an der
    // Kante der Grafik, und man sieht einen Kasten. Nur die Grenzen: die
    // Häuser am Rand sollen nicht verblassen.
    return `<svg class="reiseweg" viewBox="0 0 ${BREITE} ${HOEHE}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <radialGradient id="reiseweg-blende" cx="50%" cy="50%" r="50%">
          <stop offset="0.55" stop-color="#fff"/>
          <stop offset="1" stop-color="#fff" stop-opacity="0"/>
        </radialGradient>
        <mask id="reiseweg-maske"><rect width="${BREITE}" height="${HOEHE}" fill="url(#reiseweg-blende)"/></mask>
      </defs>
      <g class="reiseweg__laender" mask="url(#reiseweg-maske)">${laender}</g>
      <path class="reiseweg__linie" pathLength="1" d="${linie}"/>
      <g class="reiseweg__halte">${punkte}</g>
    </svg>`;
}
