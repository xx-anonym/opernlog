// Karte der Opernhäuser
//
// Zeichnet alle Häuser des Katalogs an ihrer geografischen Position; die
// besuchten leuchten, die übrigen bleiben blass. Die Koordinaten liegen seit
// der Opernhaus-Vorauswahl beim Loggen ohnehin in operaHouses.js.
//
// Bewusst ohne Landesumriss: einen halbwegs richtigen Umriss von Deutschland
// und der Schweiz gäbe es nur mit Geodaten von außen, und ein aus dem
// Gedächtnis gezeichneter sähe falsch aus – schlimmer als gar keiner. Die 69
// Häuser zeichnen die Form ohnehin selbst: Ruhrgebiet, Berlin, München,
// Hamburg und die Schweizer Reihe am unteren Rand sind sofort erkennbar.

import { operaHouses } from '../data/operaHouses.js';
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

/**
 * @param {Set<string>|Array<string>} besuchteIds  IDs der besuchten Häuser
 */
export function HouseMap(besuchteIds = []) {
    const besucht = besuchteIds instanceof Set ? besuchteIds : new Set(besuchteIds);
    const anzahl = MIT_KOORDINATEN.filter(h => besucht.has(h.id)).length;

    const box = document.createElement('div');
    box.className = 'housemap';

    // Erst die blassen, dann die leuchtenden: so liegen die besuchten Punkte
    // oben und werden von Nachbarn nicht überdeckt.
    const sortiert = [...MIT_KOORDINATEN].sort(
        (a, b) => Number(besucht.has(a.id)) - Number(besucht.has(b.id))
    );

    const punkte = sortiert.map(h => {
        const ist = besucht.has(h.id);
        return `<circle class="housemap__dot${ist ? ' housemap__dot--besucht' : ''}"
      cx="${x(h.lon).toFixed(2)}" cy="${y(h.lat).toFixed(2)}" r="${ist ? 1.9 : 1}"
      data-house-id="${escapeHTML(h.id)}"
      data-name="${escapeHTML(h.name)}" data-city="${escapeHTML(h.city)}"
    ><title>${escapeHTML(h.name)} – ${escapeHTML(h.city)}</title></circle>`;
    }).join('');

    box.innerHTML = `
    <div class="housemap__head">
      <span class="housemap__count">${anzahl} von ${MIT_KOORDINATEN.length}</span>
      <span class="housemap__legend">
        <span class="housemap__key housemap__key--besucht"></span>besucht
        <span class="housemap__key"></span>noch nicht
      </span>
    </div>
    <svg class="housemap__svg" viewBox="0 0 ${VB_BREITE} ${VB_HOEHE.toFixed(2)}"
         role="img" aria-label="Karte mit ${anzahl} von ${MIT_KOORDINATEN.length} besuchten Opernhäusern">
      ${punkte}
    </svg>
    <p class="housemap__caption" id="housemapCaption">
      ${anzahl ? 'Punkt antippen, um zum Haus zu springen' : 'Noch kein Haus besucht'}
    </p>
  `;

    const caption = box.querySelector('#housemapCaption');
    const standard = caption.textContent.trim();

    // Beschriftungen direkt an den Punkten wären bei 69 Häusern ein Knäuel –
    // allein in Berlin liegen drei fast übereinander. Deshalb eine Zeile
    // darunter, die zeigt, worüber man gerade ist.
    box.addEventListener('pointerover', (e) => {
        const punkt = e.target.closest('.housemap__dot');
        if (!punkt) return;
        caption.textContent = `${punkt.dataset.name} – ${punkt.dataset.city}`;
    });

    box.addEventListener('pointerleave', () => {
        caption.textContent = standard;
    });

    box.addEventListener('click', (e) => {
        const punkt = e.target.closest('.housemap__dot');
        if (!punkt) return;
        window.location.hash = `#/house/${punkt.dataset.houseId}`;
    });

    return box;
}
