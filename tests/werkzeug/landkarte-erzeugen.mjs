// Erzeugt src/data/landkarte.js: die Ländergrenzen unter der Häuserkarte.
//
//   node tests/werkzeug/landkarte-erzeugen.mjs ne_50m_admin_0_countries.geojson
//
// Quelle: Natural Earth, "Admin 0 – Countries", Maßstab 1:50 Mio.
// (https://www.naturalearthdata.com, GeoJSON unter
// github.com/nvkelso/natural-earth-vector/geojson/). Gemeinfrei: "All
// versions of Natural Earth raster + vector map data ... are in the public
// domain."
//
// Deutschland, Österreich, die Schweiz und Liechtenstein kräftig, die
// Nachbarn blass. Alles wird auf einen Ausschnitt um den Katalog
// zugeschnitten und vereinfacht; ein Punkt auf etwa einen Kilometer genau
// reicht für eine Karte von Handybreite.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ZIEL = path.join(WURZEL, 'src/data/landkarte.js');

const KERN = ['DEU', 'AUT', 'CHE', 'LIE'];
const NACHBARN = ['FRA', 'ITA', 'CZE', 'POL', 'NLD', 'BEL', 'LUX', 'DNK', 'SVN', 'HUN', 'SVK', 'HRV'];
// Ausschnitt, in Grad. Reicht auch für einen Umkreis von 300 km um das
// äußerste Haus.
const RAHMEN = { lonMin: 1.5, lonMax: 21.5, latMin: 43, latMax: 57.5 };
const TOLERANZ = 0.02;          // Grad, für die Vereinfachung
const KOSINUS = Math.cos(50 * Math.PI / 180);

/** Sutherland–Hodgman: ein Ring, auf ein Rechteck zugeschnitten. */
function zuschneiden(ring) {
    const kanten = [
        [p => p[0] >= RAHMEN.lonMin, (a, b) => schnittLon(a, b, RAHMEN.lonMin)],
        [p => p[0] <= RAHMEN.lonMax, (a, b) => schnittLon(a, b, RAHMEN.lonMax)],
        [p => p[1] >= RAHMEN.latMin, (a, b) => schnittLat(a, b, RAHMEN.latMin)],
        [p => p[1] <= RAHMEN.latMax, (a, b) => schnittLat(a, b, RAHMEN.latMax)],
    ];
    let punkte = ring;
    for (const [innen, schnitt] of kanten) {
        const aus = [];
        for (let i = 0; i < punkte.length; i++) {
            const a = punkte[i], b = punkte[(i + 1) % punkte.length];
            if (innen(b)) {
                if (!innen(a)) aus.push(schnitt(a, b));
                aus.push(b);
            } else if (innen(a)) {
                aus.push(schnitt(a, b));
            }
        }
        punkte = aus;
        if (!punkte.length) break;
    }
    return punkte;
}
const schnittLon = (a, b, lon) => [lon, a[1] + (b[1] - a[1]) * (lon - a[0]) / (b[0] - a[0])];
const schnittLat = (a, b, lat) => [a[0] + (b[0] - a[0]) * (lat - a[1]) / (b[1] - a[1]), lat];

/** Douglas–Peucker, in grob längentreuen Einheiten (Längengrade gestaucht). */
function vereinfachen(punkte) {
    if (punkte.length < 4) return punkte;
    const abstand = (p, a, b) => {
        const [px, py, ax, ay, bx, by] = [p[0] * KOSINUS, p[1], a[0] * KOSINUS, a[1], b[0] * KOSINUS, b[1]];
        const dx = bx - ax, dy = by - ay;
        const l = dx * dx + dy * dy;
        const t = l ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l)) : 0;
        return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    };
    const behalten = new Uint8Array(punkte.length);
    behalten[0] = behalten[punkte.length - 1] = 1;
    const stapel = [[0, punkte.length - 1]];
    while (stapel.length) {
        const [von, bis] = stapel.pop();
        let max = 0, idx = -1;
        for (let i = von + 1; i < bis; i++) {
            const d = abstand(punkte[i], punkte[von], punkte[bis]);
            if (d > max) { max = d; idx = i; }
        }
        if (max > TOLERANZ) {
            behalten[idx] = 1;
            stapel.push([von, idx], [idx, bis]);
        }
    }
    return punkte.filter((_, i) => behalten[i]);
}

const rund = n => Math.round(n * 100) / 100;

const quelle = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const laender = [];
for (const f of quelle.features) {
    const id = f.properties.ADM0_A3;
    if (!KERN.includes(id) && !NACHBARN.includes(id)) continue;
    const polygone = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const ringe = [];
    for (const polygon of polygone) {
        const aussen = zuschneiden(polygon[0]);   // Löcher braucht es hier nicht
        if (aussen.length < 3) continue;
        const einfach = vereinfachen(aussen);
        if (einfach.length < 3) continue;
        ringe.push(einfach.flatMap(p => [rund(p[0]), rund(p[1])]));
    }
    if (ringe.length) laender.push({ id, kern: KERN.includes(id), ringe });
}
laender.sort((a, b) => Number(a.kern) - Number(b.kern) || a.id.localeCompare(b.id));

const text = `// Ländergrenzen unter der Häuserkarte (HouseMap.js).
//
// Erzeugt von tests/werkzeug/landkarte-erzeugen.mjs aus Natural Earth
// (Admin 0 – Countries, 1:50 Mio.; gemeinfrei, naturalearthdata.com) –
// NICHT von Hand bearbeiten. Zugeschnitten auf den Ausschnitt um den Katalog
// und vereinfacht. Je Ring abwechselnd Länge und Breite in Grad.

export const LAENDER = [
${laender.map(l => `    { id: '${l.id}', kern: ${l.kern}, ringe: [\n${l.ringe.map(r => `        [${r.join(',')}]`).join(',\n')}\n    ] }`).join(',\n')}
];
`;
fs.writeFileSync(ZIEL, text);
console.log(`${laender.length} Länder, ${laender.reduce((s, l) => s + l.ringe.reduce((t, r) => t + r.length / 2, 0), 0)} Punkte, ${Math.round(text.length / 1024)} KB in src/data/landkarte.js`);
