// Karte der Opernhäuser
//
// Zeichnet die übergebenen Häuser an ihrer geografischen Position; die
// besuchten leuchten, die übrigen bleiben blass. Ohne Auswahl bleibt das
// Verhalten wie bisher und der gesamte Katalog wird gezeigt. Die Koordinaten
// liegen seit der Opernhaus-Vorauswahl beim Loggen ohnehin in operaHouses.js.
//
// Die Ländergrenzen darunter stammen aus Natural Earth (gemeinfrei, siehe
// src/data/landkarte.js). Lange stand hier bewusst kein Umriss: ein aus dem
// Gedächtnis gezeichneter sähe falsch aus, schlimmer als gar keiner. Mit
// echten Geodaten gibt es dieses Problem nicht, und die Karte bekommt Halt –
// vor allem im Ausschnitt um den eigenen Standort, wo sonst nur ein paar
// Punkte im Leeren stünden.

import { operaHouses } from '../data/operaHouses.js';
import { LAENDER } from '../data/landkarte.js';
import { escapeHTML } from '../utils.js';

const MIT_KOORDINATEN = operaHouses.filter(
    h => typeof h.lat === 'number' && typeof h.lon === 'number'
);

// ── Projektion ────────────────────────────────────────────────────────
// Einfache Rechteckprojektion. Für den Ausschnitt Deutschland/Schweiz reicht
// sie vollkommen: über acht Breitengrade ist die Verzerrung kleiner als der
// Radius eines Punktes. Die Längengrade werden mit dem Kosinus der mittleren
// Breite gestaucht – ohne das wäre die Karte spürbar zu breit.
const lats = MIT_KOORDINATEN.map(h => h.lat);
const lons = MIT_KOORDINATEN.map(h => h.lon);
const LAT_MIN = Math.min(...lats), LAT_MAX = Math.max(...lats);
const LON_MIN = Math.min(...lons), LON_MAX = Math.max(...lons);
const KOSINUS = Math.cos(((LAT_MIN + LAT_MAX) / 2) * Math.PI / 180);

const RAND = 6;          // Platz, damit Punkte am Rand nicht abgeschnitten werden
const VB_BREITE = 100;
const SKALA = (VB_BREITE - 2 * RAND) / ((LON_MAX - LON_MIN) * KOSINUS);
const VB_HOEHE = (LAT_MAX - LAT_MIN) * SKALA + 2 * RAND;

const x = (lon) => RAND + (lon - LON_MIN) * KOSINUS * SKALA;
const y = (lat) => RAND + (LAT_MAX - lat) * SKALA;

// Die Länder als Pfade, einmal berechnet. Die Linienstärke bleibt beim
// Heranzoomen gleich (vector-effect in style.css).
const LAENDER_SVG = LAENDER.map(land => `<path class="housemap__land${land.kern ? ' housemap__land--kern' : ''}" d="${
    land.ringe.map(ring => {
        const punkte = [];
        for (let i = 0; i < ring.length; i += 2) punkte.push(`${x(ring[i]).toFixed(2)} ${y(ring[i + 1]).toFixed(2)}`);
        return `M${punkte.join('L')}Z`;
    }).join('')}"></path>`).join('');

// Ein Kilometer in Karteneinheiten. Ein Breitengrad sind rund 111 km; die
// Längengrade sind oben schon mit dem Kosinus gestaucht, also gilt dasselbe
// Maß in beide Richtungen, und ein Kreis bleibt ein Kreis.
const PRO_KM = SKALA / 111;

/**
 * @param {Set<string>|Array<string>} besuchteIds  IDs der hervorgehobenen Häuser
 * @param {Array<object>} haeuser  Häuser, die auf der Karte sichtbar sind
 * @param {object} [optionen]  für andere Seiten als "Opernhäuser" (etwa "In der Nähe")
 * @param {[string, string]} [optionen.legende]  Wörter für hervorgehoben / übrige
 * @param {(anzahl: number, gesamt: number) => string} [optionen.zaehler]
 * @param {(anzahl: number, gesamt: number) => string} [optionen.hinweis]  Zeile unter der Karte
 * @param {(haus: object) => string} [optionen.punktText]  Zeile beim Zeigen auf einen Punkt
 * @param {{lat: number, lon: number}|null} [optionen.position]  eigener Standort, als Kreuz
 * @param {number|null} [optionen.radiusKm]  mit Standort: Umkreis als Ring, die Karte zeigt nur ihn
 * @param {(id: string, hervorgehoben: boolean) => void} [optionen.beiKlick]
 */
export function HouseMap(besuchteIds = [], haeuser = MIT_KOORDINATEN, optionen = {}) {
    const besucht = besuchteIds instanceof Set ? besuchteIds : new Set(besuchteIds);
    const sichtbareHaeuser = (Array.isArray(haeuser) ? haeuser : MIT_KOORDINATEN)
        .filter(h => typeof h.lat === 'number' && typeof h.lon === 'number');
    const anzahl = sichtbareHaeuser.filter(h => besucht.has(h.id)).length;
    const {
        legende = ['besucht', 'noch nicht'],
        zaehler = (n, gesamt) => `${n} von ${gesamt}`,
        hinweis = (n, gesamt) => gesamt === 0
            ? 'Keine Opernhäuser für diese Auswahl'
            : n ? 'Punkt antippen, um zum Haus zu springen' : 'Noch kein Haus besucht',
        punktText = h => `${h.name} – ${h.city}`,
        position = null,
        radiusKm = null,
        gewicht = null,
        beiKlick = (id) => { window.location.hash = `#/house/${id}`; },
    } = optionen;

    // Ausschnitt: ohne Umkreis alle Häuser; mit Umkreis das Quadrat um ihn,
    // mit etwas Rand. Die Punkte wachsen nicht mit – sie werden im
    // Verhältnis zum Ausschnitt gezeichnet.
    let ausschnitt = { x: 0, y: 0, breite: VB_BREITE, hoehe: VB_HOEHE };
    if (position && radiusKm) {
        const r = radiusKm * PRO_KM * 1.12;
        ausschnitt = { x: x(position.lon) - r, y: y(position.lat) - r, breite: 2 * r, hoehe: 2 * r };
    }
    const mass = ausschnitt.breite / VB_BREITE;

    const box = document.createElement('div');
    box.className = 'housemap';

    // Erst die blassen, dann die leuchtenden: so liegen die besuchten Punkte
    // oben und werden von Nachbarn nicht überdeckt.
    const sortiert = [...sichtbareHaeuser].sort(
        (a, b) => Number(besucht.has(a.id)) - Number(besucht.has(b.id))
    );

    // Mit Gewicht (etwa die Zahl der Abende) wächst ein Punkt mit der
    // Wurzel daraus – vier Abende doppelt so wichtig, nicht viermal so groß.
    const radius = (h, ist) => {
        if (!ist) return 1;
        const n = gewicht?.get(h.id) || 1;
        // Auf der ganzen Karte weniger Spielraum: dort liegen die Häuser dicht.
        const spielraum = mass < 1 ? 3 : 1.5;
        return 1.9 * (1 + 0.3 * Math.min(Math.sqrt(n) - 1, spielraum));
    };

    const punkte = sortiert.map(h => {
        const ist = besucht.has(h.id);
        return `<circle class="housemap__dot${ist ? ' housemap__dot--besucht' : ''}"
      cx="${x(h.lon).toFixed(2)}" cy="${y(h.lat).toFixed(2)}" r="${(radius(h, ist) * mass).toFixed(3)}"
      data-house-id="${escapeHTML(h.id)}"
      data-name="${escapeHTML(h.name)}" data-city="${escapeHTML(h.city)}"
    ><title>${escapeHTML(punktText(h))}</title></circle>`;
    }).join('');

    const umkreis = position && radiusKm ? `
      <circle class="housemap__umkreis" cx="${x(position.lon).toFixed(2)}" cy="${y(position.lat).toFixed(2)}"
        r="${(radiusKm * PRO_KM).toFixed(2)}"></circle>
      <text class="housemap__umkreis-text" x="${x(position.lon).toFixed(2)}"
        y="${(y(position.lat) - radiusKm * PRO_KM - 1.2 * mass).toFixed(2)}" font-size="${(3 * mass).toFixed(3)}">${radiusKm} km</text>` : '';
    const standort = position ? `
      <g class="housemap__standort" transform="translate(${x(position.lon).toFixed(2)} ${y(position.lat).toFixed(2)}) scale(${mass.toFixed(3)})">
        <circle class="housemap__standort-puls" r="2.6"></circle>
        <circle r="2.6"></circle><circle class="housemap__standort-kern" r="1.1"></circle>
        <title>Dein Standort</title>
      </g>` : '';

    // Im Ausschnitt ist Platz für Namen: die Städte der hervorgehobenen
    // Häuser, jede einmal, und keine über einer anderen.
    const namen = [];
    if (ausschnitt.breite < VB_BREITE) {
        const belegt = [];
        const groesse = 3 * mass;
        const staedte = new Map();
        for (const h of sichtbareHaeuser.filter(h => besucht.has(h.id))) {
            if (!staedte.has(h.city)) staedte.set(h.city, h);
        }
        for (const [stadt, h] of staedte) {
            const r = radius(h, true) * mass;
            const kasten = { x: x(h.lon) + r + 0.6 * mass, y: y(h.lat) - groesse * 0.7, b: stadt.length * groesse * 0.55, h: groesse * 1.1 };
            if (belegt.some(k => kasten.x < k.x + k.b && k.x < kasten.x + kasten.b && kasten.y < k.y + k.h && k.y < kasten.y + kasten.h)) continue;
            belegt.push(kasten);
            namen.push(`<text class="housemap__name" x="${kasten.x.toFixed(2)}" y="${(y(h.lat) + groesse * 0.35).toFixed(2)}"
              font-size="${groesse.toFixed(3)}" stroke-width="${(0.9 * mass).toFixed(3)}">${escapeHTML(stadt)}</text>`);
        }
    }

    box.innerHTML = `
    <div class="housemap__head">
      <span class="housemap__count">${escapeHTML(zaehler(anzahl, sichtbareHaeuser.length))}</span>
      <span class="housemap__legend">
        <span class="housemap__key housemap__key--besucht"></span>${escapeHTML(legende[0])}
        <span class="housemap__key"></span>${escapeHTML(legende[1])}
      </span>
    </div>
    <svg class="housemap__svg${ausschnitt.breite < VB_BREITE ? ' housemap__svg--ausschnitt' : ''}" viewBox="${[ausschnitt.x, ausschnitt.y, ausschnitt.breite, ausschnitt.hoehe].map(v => v.toFixed(2)).join(' ')}"
         role="img" aria-label="${escapeHTML(`Karte: ${zaehler(anzahl, sichtbareHaeuser.length)} ${legende[0]}`)}">
      <g class="housemap__laender">${LAENDER_SVG}</g>
      ${umkreis}
      ${punkte}
      ${namen.join('')}
      ${standort}
    </svg>
    <p class="housemap__caption" id="housemapCaption">
      ${escapeHTML(hinweis(anzahl, sichtbareHaeuser.length))}
    </p>
  `;

    const caption = box.querySelector('#housemapCaption');
    const standard = caption.textContent.trim();
    const hausZu = id => sichtbareHaeuser.find(h => h.id === id);

    // Beschriftungen direkt an den Punkten wären bei über 90 Häusern ein Knäuel –
    // allein in Berlin liegen drei fast übereinander. Deshalb eine Zeile
    // darunter, die zeigt, worüber man gerade ist.
    box.addEventListener('pointerover', (e) => {
        const punkt = e.target.closest('.housemap__dot');
        if (!punkt) return;
        const h = hausZu(punkt.dataset.houseId);
        caption.textContent = h ? punktText(h) : `${punkt.dataset.name} – ${punkt.dataset.city}`;
    });

    box.addEventListener('pointerleave', () => {
        caption.textContent = standard;
    });

    box.addEventListener('click', (e) => {
        const punkt = e.target.closest('.housemap__dot');
        if (!punkt) return;
        beiKlick(punkt.dataset.houseId, besucht.has(punkt.dataset.houseId));
    });

    return box;
}
