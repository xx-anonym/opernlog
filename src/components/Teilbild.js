// Das Bild zum Teilen des Saisonrückblicks: 1080 × 1920, das Hochformat, das
// Instagram- und WhatsApp-Status ungeschnitten zeigen.
//
// In der Sprache der Story (Jonas, 4.10.2026: das alte Bild sah "total
// billig" aus): Samtgrund mit Bühnenlicht, Vorhangkanten links und rechts,
// die Spielzeit in Gold, darunter Karten mit goldener Haarlinie – mit
// Sternen, Reiseweg, Wochenpunkten und Monatsraster wie auf den Folien.
//
// Keine Fotos: das Bild verlässt die App. Momentaufnahmen sind privat oder
// nur für Freunde, und die Katalogbilder von Wikimedia verlangen eine
// Namensnennung, die ein geteiltes Bild nicht mitträgt.

import { reisewegGeometrie } from './Reiseweg.js';

const B = 1080;
const H = 1920;
const RAND = 80;
const GOLD = '#c9a84c';
const GOLD_HELL = '#dfc06a';
const CREME = '#f0e6d2';
const BLASS = 'rgba(240, 230, 210, 0.62)';
const ROSE = '#c75b6a';
const SERIF = '"Playfair Display", Georgia, serif';
const SANS = '"DM Sans", sans-serif';
const WOCHE = ['M', 'D', 'M', 'D', 'F', 'S', 'S'];
const WOCHENTAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

const zahl = n => new Intl.NumberFormat('de-DE').format(n);
const abende = n => `${zahl(n)} ${n === 1 ? 'Abend' : 'Abende'}`;

/**
 * @param {object} r  der Rückblick aus buildSeasonReview() (src/data/season.js)
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function zeichneTeilbild(r) {
    const c = document.createElement('canvas');
    c.width = B;
    c.height = H;
    const g = c.getContext('2d');

    // Ohne das Warten zeichnet der Browser die Schrift beim ersten Mal in der
    // Ersatzschrift, weil sie noch nicht geladen ist.
    try {
        await Promise.all([
            document.fonts.load(`400 120px ${SERIF}`),
            document.fonts.load(`700 120px ${SERIF}`),
            document.fonts.load(`400 40px ${SANS}`),
            document.fonts.load(`600 40px ${SANS}`),
        ]);
        await document.fonts.ready;
    } catch { /* dann eben mit Ersatzschrift */ }

    grund(g);
    let y = kopf(g, r);
    y = held(g, r, y);
    karten(g, r, y + 50, H - 160);
    fuss(g);
    return c;
}

// ── Grund ─────────────────────────────────────────────────────────────

function grund(g) {
    const samt = g.createLinearGradient(0, 0, 0, H);
    samt.addColorStop(0, '#3a0f1a');
    samt.addColorStop(0.32, '#1c1219');
    samt.addColorStop(1, '#0e1115');
    g.fillStyle = samt;
    g.fillRect(0, 0, B, H);

    // Bühnenlicht von oben, warmer Schein von der Rampe.
    licht(g, B / 2, -160, 1000, 'rgba(255, 225, 170, 0.22)');
    licht(g, B / 2, H + 140, 760, 'rgba(255, 200, 130, 0.10)');

    vorhangkante(g, 0, 1);
    vorhangkante(g, B, -1);
    bogen(g);
}

/** Oben ein schmaler Bogen aus Samt mit goldener Kante, wie beim Ladebildschirm. */
function bogen(g) {
    const samt = g.createLinearGradient(0, 0, 0, 44);
    samt.addColorStop(0, '#6b1525');
    samt.addColorStop(1, '#3d0a15');
    g.fillStyle = samt;
    g.fillRect(0, 0, B, 44);
    const falten = g.createLinearGradient(0, 0, B, 0);
    for (let i = 0; i <= 30; i++) falten.addColorStop(i / 30, i % 2 ? 'rgba(0, 0, 0, 0.22)' : 'rgba(255, 255, 255, 0.05)');
    g.fillStyle = falten;
    g.fillRect(0, 0, B, 44);
    g.fillStyle = 'rgba(201, 168, 76, 0.55)';
    g.fillRect(0, 44, B, 2);
    const schatten = g.createLinearGradient(0, 46, 0, 110);
    schatten.addColorStop(0, 'rgba(8, 4, 6, 0.5)');
    schatten.addColorStop(1, 'rgba(8, 4, 6, 0)');
    g.fillStyle = schatten;
    g.fillRect(0, 46, B, 64);
}

function licht(g, x, y, r, farbe) {
    const v = g.createRadialGradient(x, y, 0, x, y, r);
    v.addColorStop(0, farbe);
    v.addColorStop(1, 'rgba(0, 0, 0, 0)');
    g.fillStyle = v;
    g.fillRect(0, 0, B, H);
}

/** Ein schmaler Samtstreifen am Rand, mit Falten, nach innen auslaufend. */
function vorhangkante(g, kante, richtung) {
    const breite = 58;
    const x0 = richtung > 0 ? kante : kante - breite;
    const falten = g.createLinearGradient(x0, 0, x0 + breite, 0);
    const stufen = [[0, '#2a0710'], [0.18, '#5c111c'], [0.34, '#33081a'], [0.52, '#6b1525'], [0.7, '#3d0a15'], [0.86, '#5c111c'], [1, '#2a0710']];
    for (const [o, f] of (richtung > 0 ? stufen : stufen.map(([o, f]) => [1 - o, f]).reverse())) falten.addColorStop(o, f);
    g.fillStyle = falten;
    g.fillRect(x0, 0, breite, H);

    // Nach innen in den Grund auslaufen lassen.
    const innen = richtung > 0 ? kante + breite : kante - breite;
    const schatten = g.createLinearGradient(innen, 0, innen + richtung * 70, 0);
    schatten.addColorStop(0, 'rgba(8, 4, 6, 0.55)');
    schatten.addColorStop(1, 'rgba(8, 4, 6, 0)');
    g.fillStyle = schatten;
    g.fillRect(Math.min(innen, innen + richtung * 70), 0, 70, H);
}

// ── Kopf und Kennzahl ─────────────────────────────────────────────────

function sperren(g, abstand) {
    if ('letterSpacing' in g) g.letterSpacing = `${abstand}px`;
}

function kopf(g, r) {
    g.textBaseline = 'alphabetic';
    g.font = `600 30px ${SANS}`;
    sperren(g, 8);
    g.fillStyle = GOLD;
    g.fillText('OPERNLOG', RAND, 160);
    const marke = g.measureText('OPERNLOG ').width;
    g.fillStyle = BLASS;
    g.fillText('· SAISONRÜCKBLICK', RAND + marke + 8, 160);
    sperren(g, 0);

    g.font = `700 200px ${SERIF}`;
    const breite = g.measureText(r.label).width;
    const verlauf = g.createLinearGradient(RAND, 200, RAND + breite, 380);
    verlauf.addColorStop(0, GOLD_HELL);
    verlauf.addColorStop(1, ROSE);
    g.fillStyle = verlauf;
    g.fillText(r.label, RAND - 6, 366);

    g.fillStyle = GOLD;
    g.fillRect(RAND, 410, 120, 4);
    return 414;
}

function held(g, r, y) {
    g.font = `400 250px ${SERIF}`;
    g.fillStyle = CREME;
    const n = String(r.visitCount);
    g.fillText(n, RAND - 8, y + 240);
    const breite = g.measureText(n).width;
    g.font = `400 56px ${SANS}`;
    g.fillStyle = BLASS;
    g.fillText(r.visitCount === 1 ? 'Abend' : 'Abende', RAND + breite + 18, y + 236);

    g.font = `400 38px ${SANS}`;
    g.fillStyle = CREME;
    const teile = [
        `${zahl(r.operaCount)} ${r.operaCount === 1 ? 'Werk' : 'Werke'}`,
        `${zahl(r.houseCount)} ${r.houseCount === 1 ? 'Haus' : 'Häuser'}`,
        `${zahl(r.cityCount)} ${r.cityCount === 1 ? 'Stadt' : 'Städte'}`,
    ];
    g.fillText(teile.join('  ·  '), RAND, y + 312);
    return y + 312;
}

// ── Karten ────────────────────────────────────────────────────────────

/** Die Karten in Reihenfolge; breit: über die ganze Breite. */
function kartenListe(r) {
    const liste = [];
    if (r.topHouse?.house) {
        liste.push({ label: 'Stammhaus', wert: r.topHouse.house.name, notiz: `${abende(r.topHouse.anzahl)} · ${r.topHouse.house.city}` });
    }
    if (r.topComposer) {
        liste.push({ label: 'Komponist der Saison', wert: r.topComposer.wert, notiz: abende(r.topComposer.anzahl) });
    }
    const weg = reisewegGeometrie(r.route);
    if (r.travelKm > 0 && weg) {
        liste.push({ breit: true, label: 'Zwischen den Häusern', wert: `${zahl(r.travelKm)} km`, notiz: 'Luftlinie, Abend für Abend', grafik: (g, k) => reiseweg(g, weg, k) });
    }
    if (r.bestVisit?.opera) {
        const note = Number(r.bestVisit.visit.rating);
        liste.push({ label: 'Bester Abend', wert: r.bestVisit.opera.title, notiz: r.bestVisit.house?.name || '', sterne: note });
    }
    if (r.ratings?.length) {
        liste.push({ label: 'Dein Schnitt', wert: r.avgRating.toFixed(1).replace('.', ','), notiz: 'von 5 Sternen', sterne: r.avgRating });
    }
    if (r.topWeekday) {
        liste.push({ label: 'Dein Opernabend', wert: r.topWeekday.wert, notiz: `${r.topWeekday.anzahl}× in der Spielzeit`, grafik: (g, k) => wochenpunkte(g, r.topWeekday, k) });
    }
    if (r.topMonth) {
        liste.push({ label: 'Dichtester Monat', wert: r.topMonth.name, notiz: abende(r.topMonth.anzahl), grafik: (g, k) => monatsraster(g, r.topMonth, k) });
    }
    if (r.topConductor) liste.push({ label: 'Dirigent der Saison', wert: r.topConductor.wert, notiz: `${abende(r.topConductor.anzahl)} am Pult` });
    if (r.topVoices?.length) liste.push({ label: 'Meistgehörte Stimme', wert: r.topVoices[0].name, notiz: abende(r.topVoices[0].anzahl) });
    return liste;
}

/** In Reihen ordnen: zwei halbe nebeneinander, eine breite allein. */
function reihen(liste) {
    const ergebnis = [];
    let offen = null;
    for (const k of liste) {
        if (k.breit) {
            if (offen) { ergebnis.push([{ ...offen, breit: true, flach: true }]); offen = null; }
            ergebnis.push([k]);
        } else if (offen) {
            ergebnis.push([offen, k]);
            offen = null;
        } else {
            offen = k;
        }
    }
    if (offen) ergebnis.push([{ ...offen, breit: true, flach: true }]);
    return ergebnis;
}

const LUECKE = 24;
const HOEHE_HALB = 212;
const HOEHE_BREIT = 244;

function karten(g, r, y, grenze) {
    const breite = B - 2 * RAND;
    const halb = (breite - LUECKE) / 2;
    for (const reihe of reihen(kartenListe(r))) {
        const h = reihe[0].breit && !reihe[0].flach ? HOEHE_BREIT : HOEHE_HALB;
        // Was nicht mehr ganz hineinpasst, fällt weg – lieber weglassen als überlaufen.
        if (y + h > grenze) break;
        reihe.forEach((k, i) => karte(g, RAND + i * (halb + LUECKE), y, k.breit ? breite : halb, h, k));
        y += h + LUECKE;
    }
}

function rundesRechteck(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
}

function karte(g, x, y, w, h, k) {
    rundesRechteck(g, x, y, w, h, 28);
    const flaeche = g.createLinearGradient(x, y, x, y + h);
    flaeche.addColorStop(0, 'rgba(255, 255, 255, 0.075)');
    flaeche.addColorStop(1, 'rgba(255, 255, 255, 0.03)');
    g.fillStyle = flaeche;
    g.fill();
    g.strokeStyle = 'rgba(201, 168, 76, 0.38)';
    g.lineWidth = 2;
    g.stroke();

    const innen = 36;
    // Mit Grafik: Text links, Grafik rechts – bei breiten Karten die halbe
    // Breite, bei halben ein schmaler Streifen. Sterne stehen rechts in der
    // Fußzeile, neben der Notiz.
    const grafikBreite = k.grafik ? (k.breit ? w * 0.5 - 18 : 140) : 0;
    const textBreite = w - 2 * innen - (k.grafik ? grafikBreite + 12 : 0);
    const STERN = 26;
    const sterneBreite = k.sterne ? 5 * STERN + 4 * 10 : 0;

    g.font = `600 23px ${SANS}`;
    sperren(g, 4);
    g.fillStyle = GOLD;
    g.fillText(kuerze(g, k.label.toUpperCase(), w - 2 * innen), x + innen, y + 56);
    sperren(g, 0);

    g.fillStyle = CREME;
    const groesse = passend(g, k.wert, textBreite, k.breit && !k.flach ? 76 : 54, 34);
    g.font = `400 ${groesse}px ${SERIF}`;
    g.fillText(kuerze(g, k.wert, textBreite), x + innen, y + 56 + 22 + groesse);

    const fussY = y + h - 34;
    if (k.sterne) sterne(g, x + w - innen - sterneBreite, fussY - 21, STERN, k.sterne);
    g.font = `400 26px ${SANS}`;
    g.fillStyle = BLASS;
    g.fillText(kuerze(g, k.notiz, textBreite - (sterneBreite ? sterneBreite + 16 : 0)), x + innen, fussY);

    if (k.grafik) {
        const kasten = k.breit
            ? { x: x + w - 18 - grafikBreite, y: y + 18, w: grafikBreite, h: h - 36 }
            // Unter der Überschriftzeile, bis zur Fußzeile.
            : { x: x + w - innen + 8 - grafikBreite, y: y + 82, w: grafikBreite, h: h - 82 - 26 };
        g.save();
        k.grafik(g, kasten);
        g.restore();
    }
}

/** Die größte Schrift zwischen max und min, in der der Text in die Breite passt. */
function passend(g, text, breite, max, min) {
    for (let s = max; s > min; s -= 2) {
        g.font = `400 ${s}px ${SERIF}`;
        if (g.measureText(text).width <= breite) return s;
    }
    return min;
}

// Zu lange Namen abschneiden, statt sie über den Rand laufen zu lassen.
function kuerze(g, text, maxBreite) {
    if (g.measureText(text).width <= maxBreite) return text;
    let s = text;
    while (s.length > 1 && g.measureText(`${s}…`).width > maxBreite) s = s.slice(0, -1);
    return `${s}…`;
}

// ── Grafiken ──────────────────────────────────────────────────────────

function sternPfad(g, cx, cy, r) {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
        const winkel = -Math.PI / 2 + i * Math.PI / 5;
        const radius = i % 2 ? r * 0.45 : r;
        g.lineTo(cx + Math.cos(winkel) * radius, cy + Math.sin(winkel) * radius);
    }
    g.closePath();
}

/** Fünf Sterne, golden gefüllt bis zum Wert – der letzte auch zum Teil. */
function sterne(g, x, y, groesse, wert) {
    const r = groesse / 2;
    for (let i = 0; i < 5; i++) {
        const cx = x + r + i * (groesse + 10);
        const cy = y + r;
        sternPfad(g, cx, cy, r);
        g.fillStyle = 'rgba(255, 255, 255, 0.16)';
        g.fill();
        const anteil = Math.max(0, Math.min(1, wert - i));
        if (!anteil) continue;
        g.save();
        g.beginPath();
        g.rect(cx - r, cy - r, groesse * anteil, groesse);
        g.clip();
        sternPfad(g, cx, cy, r);
        g.shadowColor = 'rgba(201, 168, 76, 0.6)';
        g.shadowBlur = 12;
        g.fillStyle = GOLD;
        g.fill();
        g.restore();
    }
}

/** Der Weg der Spielzeit: zarte Grenzen, die zum Rand hin auslaufen, die Linie golden. */
function reiseweg(g, geo, k) {
    const mass = Math.min(k.w / geo.breite, k.h / geo.hoehe);
    const ox = k.x + (k.w - geo.breite * mass) / 2;
    const oy = k.y + (k.h - geo.hoehe * mass) / 2;

    // Grenzen auf eigener Leinwand, dann mit einem radialen Verlauf
    // ausgeblendet – sonst enden sie hart am Rand des Feldes.
    const blatt = document.createElement('canvas');
    blatt.width = Math.ceil(geo.breite * mass);
    blatt.height = Math.ceil(geo.hoehe * mass);
    const b = blatt.getContext('2d');
    b.scale(mass, mass);
    b.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    b.lineWidth = 1.2 / mass;
    b.lineJoin = 'round';
    for (const d of geo.laender) b.stroke(new Path2D(d));
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.globalCompositeOperation = 'destination-in';
    const blende = b.createRadialGradient(blatt.width / 2, blatt.height / 2, 0, blatt.width / 2, blatt.height / 2, blatt.width / 2);
    blende.addColorStop(0.5, 'rgba(0, 0, 0, 1)');
    blende.addColorStop(1, 'rgba(0, 0, 0, 0)');
    b.fillStyle = blende;
    b.fillRect(0, 0, blatt.width, blatt.height);
    g.drawImage(blatt, ox, oy);

    g.translate(ox, oy);
    g.scale(mass, mass);
    g.strokeStyle = GOLD;
    g.lineWidth = 3.2 / mass;
    g.lineCap = 'round';
    g.shadowColor = 'rgba(201, 168, 76, 0.7)';
    g.shadowBlur = 14;
    g.stroke(new Path2D(geo.linie));
    g.shadowBlur = 0;
    for (const h of geo.halte) {
        g.beginPath();
        g.arc(h.x, h.y, 6.5 / mass, 0, 2 * Math.PI);
        g.fillStyle = CREME;
        g.fill();
        g.lineWidth = 2 / mass;
        g.strokeStyle = GOLD;
        g.stroke();
    }
}

/** Je Wochentag eine Spalte Punkte, die des Tages golden. */
function wochenpunkte(g, { wert, jeTag }, k) {
    if (!Array.isArray(jeTag)) return;
    const sieger = WOCHENTAGE.indexOf(wert);
    const spalte = k.w / 7;
    const unten = k.y + k.h - 26;
    const meiste = Math.max(1, ...jeTag);
    const r = Math.max(2.5, Math.min(6.5, (k.h - 34) / meiste / 2 - 1.5));
    jeTag.forEach((anzahl, i) => {
        const cx = k.x + spalte * (i + 0.5);
        for (let n = 0; n < anzahl; n++) {
            g.beginPath();
            g.arc(cx, unten - r - n * (2 * r + 3), r, 0, 2 * Math.PI);
            g.fillStyle = i === sieger ? GOLD : 'rgba(240, 230, 210, 0.35)';
            g.shadowColor = i === sieger ? 'rgba(201, 168, 76, 0.6)' : 'transparent';
            g.shadowBlur = i === sieger ? 10 : 0;
            g.fill();
        }
        g.shadowBlur = 0;
        g.font = `${i === sieger ? 600 : 400} 19px ${SANS}`;
        g.fillStyle = i === sieger ? GOLD : 'rgba(240, 230, 210, 0.45)';
        g.textAlign = 'center';
        g.fillText(WOCHE[i], cx, k.y + k.h);
        g.textAlign = 'start';
    });
}

/** Der Monat als kleines Punkteraster, die Abende golden umkreist. */
function monatsraster(g, { jahr, monat, tage }, k) {
    if (!Number.isInteger(jahr) || !Number.isInteger(monat)) return;
    const anzahlTage = new Date(jahr, monat + 1, 0).getDate();
    const erster = (new Date(jahr, monat, 1).getDay() + 6) % 7;
    const reihen = Math.ceil((erster + anzahlTage) / 7);
    const abstand = Math.min(k.w / 7, k.h / reihen);
    const ox = k.x + (k.w - abstand * 7) / 2;
    const oy = k.y + (k.h - abstand * reihen) / 2;
    const abendTage = new Set(tage);
    for (let tag = 1; tag <= anzahlTage; tag++) {
        const platz = erster + tag - 1;
        const cx = ox + abstand * (platz % 7 + 0.5);
        const cy = oy + abstand * (Math.floor(platz / 7) + 0.5);
        g.beginPath();
        g.arc(cx, cy, 2.8, 0, 2 * Math.PI);
        g.fillStyle = abendTage.has(tag) ? CREME : 'rgba(240, 230, 210, 0.3)';
        g.fill();
        if (abendTage.has(tag)) {
            g.beginPath();
            g.arc(cx, cy, abstand * 0.42, 0, 2 * Math.PI);
            g.strokeStyle = GOLD;
            g.lineWidth = 2;
            g.shadowColor = 'rgba(201, 168, 76, 0.6)';
            g.shadowBlur = 8;
            g.stroke();
            g.shadowBlur = 0;
        }
    }
}

// ── Fuß ───────────────────────────────────────────────────────────────

function fuss(g) {
    g.fillStyle = 'rgba(201, 168, 76, 0.5)';
    g.fillRect(RAND, H - 128, B - 2 * RAND, 1);
    g.font = `400 28px ${SANS}`;
    g.fillStyle = BLASS;
    g.fillText('opernlog.vercel.app', RAND, H - 76);
    g.font = `italic 400 28px ${SERIF}`;
    g.fillStyle = GOLD;
    g.textAlign = 'right';
    g.fillText('Bis zur nächsten Spielzeit', B - RAND, H - 76);
    g.textAlign = 'start';
}
