// Das Bild zum Teilen des Saisonrückblicks: 1080 × 1920, das Hochformat, das
// Instagram- und WhatsApp-Status ungeschnitten zeigen.
//
// Gestaltet wie ein Theaterzettel (Jonas, 4.10.2026, nach zwei Entwürfen):
// Papierton, schwarze und rote Druckfarbe, zentrierter Satz zwischen
// Linien. "OpernLog präsentiert die Spielzeit 2025/26 in 6 Abenden, mit
// den Werken …, in den Häusern …", darunter Stammhaus, Komponist und bester
// Abend. Ein Entwurf davor – Glaskarten mit Goldrand und Leuchten – sah ihm
// "nach AI slop" aus.
//
// Keine Fotos: das Bild verlässt die App. Momentaufnahmen sind privat oder
// nur für Freunde, und die Katalogbilder von Wikimedia verlangen eine
// Namensnennung, die ein geteiltes Bild nicht mitträgt.

const B = 1080;
const H = 1920;
const MITTE = B / 2;
const SATZBREITE = 860;
const PAPIER = '#f2e9d8';
const TINTE = '#1c1915';
const ROT = '#8b1a2b';
const SERIF = '"Playfair Display", Georgia, serif';
const SANS = '"DM Sans", sans-serif';

const zahl = n => new Intl.NumberFormat('de-DE').format(n);

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
            document.fonts.load(`400 100px ${SERIF}`),
            document.fonts.load(`700 100px ${SERIF}`),
            document.fonts.load(`italic 400 100px ${SERIF}`),
            document.fonts.load(`400 30px ${SANS}`),
            document.fonts.load(`700 30px ${SANS}`),
        ]);
        await document.fonts.ready;
    } catch { /* dann eben mit Ersatzschrift */ }

    g.fillStyle = PAPIER;
    g.fillRect(0, 0, B, H);
    // Doppelter Rahmen wie auf einem gedruckten Zettel.
    g.strokeStyle = TINTE;
    g.lineWidth = 6;
    g.strokeRect(44, 44, B - 88, H - 88);
    g.lineWidth = 1.5;
    g.strokeRect(60, 60, B - 120, H - 120);

    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';

    // Erst setzen, dann zeichnen: so lässt sich der Satz zwischen Kopf und
    // Fuß ausgewogen verteilen, ob die Spielzeit drei Abende hatte oder dreißig.
    const oben = 140;
    const unten = H - 170;
    const kopf = kopfSatz(r);
    // Passt der Satz nicht, werden die Listen kürzer und zuletzt fallen die
    // Schlusszeilen weg – lieber weglassen als in den Fuß laufen.
    let rumpf;
    for (const stufe of STUFEN) {
        rumpf = rumpfSatz(g, r, stufe);
        if (hoehe(kopf) + hoehe(rumpf) <= unten - oben) break;
    }
    const frei = Math.max(0, unten - oben - hoehe(kopf) - hoehe(rumpf));
    const y = setze(g, kopf, oben + frei * 0.35);
    setze(g, rumpf, y + frei * 0.3);

    g.fillStyle = 'rgba(28, 25, 21, 0.6)';
    g.font = `400 26px ${SANS}`;
    g.fillText('opernlog.vercel.app', MITTE, H - 110);
    g.textAlign = 'start';
    return c;
}

// ── Satz ──────────────────────────────────────────────────────────────
// Ein Satz ist eine Liste von Zeilen { hoehe, zeichne(g, y) }; y ist die
// Oberkante der Zeile.

const hoehe = satz => satz.reduce((s, z) => s + z.hoehe, 0);

function setze(g, satz, y) {
    for (const z of satz) {
        g.save();
        z.zeichne(g, y);
        g.restore();
        y += z.hoehe;
    }
    return y;
}

const sperren = (g, px) => { if ('letterSpacing' in g) g.letterSpacing = `${px}px`; };

const text = (inhalt, schrift, farbe, zeilenhoehe, grundlinie, sperrung = 0) => ({
    hoehe: zeilenhoehe,
    zeichne(g, y) {
        g.font = schrift;
        g.fillStyle = farbe;
        sperren(g, sperrung);
        g.fillText(inhalt, MITTE, y + grundlinie);
    },
});

const luecke = h => ({ hoehe: h, zeichne() {} });

const linie = (breite, h = 40) => ({
    hoehe: h,
    zeichne(g, y) {
        g.fillStyle = TINTE;
        g.fillRect(MITTE - breite / 2, y + h / 2, breite, 2);
    },
});

/** Zwei Linien mit einer roten Raute dazwischen. */
const raute = () => ({
    hoehe: 60,
    zeichne(g, y) {
        g.fillStyle = TINTE;
        g.fillRect(MITTE - 150, y + 30, 120, 2);
        g.fillRect(MITTE + 30, y + 30, 120, 2);
        g.translate(MITTE, y + 31);
        g.rotate(Math.PI / 4);
        g.fillStyle = ROT;
        g.fillRect(-9, -9, 18, 18);
    },
});

const rubrik = inhalt => text(inhalt.toUpperCase(), `700 24px ${SANS}`, ROT, 52, 24, 8);

function kopfSatz(r) {
    return [
        text('OPERNLOG', `700 30px ${SANS}`, ROT, 40, 30, 12),
        linie(160, 44),
        text('präsentiert', `italic 400 46px ${SERIF}`, TINTE, 74, 52),
        text('DIE SPIELZEIT', `700 84px ${SERIF}`, TINTE, 100, 80, 6),
        text(r.label, `700 236px ${SERIF}`, ROT, 230, 200),
        text(r.visitCount === 1 ? 'an einem Abend' : `in ${zahl(r.visitCount)} Abenden`, `italic 400 54px ${SERIF}`, TINTE, 80, 52),
        raute(),
    ];
}

/**
 * Namen mit " · " zu zentrierten Zeilen umbrechen, höchstens maxZeilen;
 * was nicht mehr passt, zählt eine letzte Zeile ("und 3 weiteren").
 */
function aufzaehlung(g, namen, schrift, farbe, zeilenhoehe, maxZeilen, rest) {
    g.font = schrift;
    const zeilen = [];
    let zeile = [];
    let gesetzt = 0;
    for (const name of namen) {
        const probe = [...zeile, name].join('  ·  ');
        if (zeile.length && g.measureText(probe).width > SATZBREITE) {
            if (zeilen.length + 1 >= maxZeilen) break;
            zeilen.push(zeile.join('  ·  '));
            zeile = [name];
        } else {
            zeile.push(name);
        }
        gesetzt++;
    }
    // Ein einzelner überlanger Name wird gekürzt.
    if (zeile.length) zeilen.push(kuerze(g, zeile.join('  ·  '), SATZBREITE));
    const satz = zeilen.map(z => text(z, schrift, farbe, zeilenhoehe, Math.round(zeilenhoehe * 0.72)));
    if (gesetzt < namen.length) {
        satz.push(text(rest(namen.length - gesetzt), `italic 400 32px ${SERIF}`, TINTE, 48, 34));
    }
    return satz;
}

// "mit den Werken … und 3 weiteren", "in den Häusern … und einem weiteren"
const weitere = n => (n === 1 ? 'und einem weiteren' : `und ${zahl(n)} weiteren`);

// Von großzügig bis knapp: höchstens so viele Zeilen Werke und Häuser, und
// ob die Schlusszeilen (Kilometer, Schnitt) noch Platz haben.
const STUFEN = [
    { werke: 4, haeuser: 3, schluss: 2 },
    { werke: 3, haeuser: 2, schluss: 2 },
    { werke: 2, haeuser: 2, schluss: 1 },
    { werke: 2, haeuser: 1, schluss: 0 },
];

function rumpfSatz(g, r, stufe) {
    const satz = [luecke(24)];
    const werke = (r.werkeRang || []).map(w => w.opera.title);
    if (werke.length) {
        satz.push(rubrik(werke.length === 1 ? 'mit dem Werk' : 'mit den Werken'));
        satz.push(...aufzaehlung(g, werke, `400 52px ${SERIF}`, TINTE, 68, stufe.werke, weitere));
        satz.push(luecke(34));
    }
    const haeuser = (r.haeuserRang || []).map(h => h.house.name);
    if (haeuser.length) {
        satz.push(rubrik(haeuser.length === 1 ? 'im Haus' : 'in den Häusern'));
        satz.push(...aufzaehlung(g, haeuser, `italic 400 42px ${SERIF}`, ROT, 58, stufe.haeuser, weitere));
        satz.push(luecke(30));
    }
    satz.push(linie(820, 60));

    // Bei nur einem Haus oder Werk stünde in der Spalte nur, was oben schon steht.
    const spalten = [
        haeuser.length > 1 && r.topHouse?.house && ['Stammhaus', r.topHouse.house.name],
        r.topComposer && ['Komponist', r.topComposer.wert],
        werke.length > 1 && r.bestVisit?.opera && ['Bester Abend', r.bestVisit.opera.title],
    ].filter(Boolean);
    if (spalten.length) satz.push(spaltenZeile(spalten), luecke(20));

    const zusatz = [
        r.travelKm > 0 && `${zahl(r.travelKm)} Kilometer zwischen den Häusern`,
        r.ratings?.length && `${r.ratings.length === 1 ? 'bewertet mit' : 'im Schnitt'} ${r.avgRating.toFixed(1).replace('.', ',')} von 5 Sternen`,
    ].filter(Boolean).slice(0, stufe.schluss);
    for (const z of zusatz) satz.push(text(z, `italic 400 38px ${SERIF}`, TINTE, 56, 40));
    return satz;
}

/** Bis zu drei Spalten: rote Rubrik, darunter der Name in höchstens zwei Zeilen. */
function spaltenZeile(spalten) {
    const breite = SATZBREITE / spalten.length;
    return {
        hoehe: 170,
        zeichne(g, y) {
            spalten.forEach(([label, wert], i) => {
                const x = (B - SATZBREITE) / 2 + breite * (i + 0.5);
                g.font = `700 22px ${SANS}`;
                g.fillStyle = ROT;
                sperren(g, 6);
                g.fillText(label.toUpperCase(), x, y + 30);
                sperren(g, 0);
                g.font = `700 38px ${SERIF}`;
                g.fillStyle = TINTE;
                umbrechen(g, wert, breite - 30, 2).forEach((z, k) => g.fillText(z, x, y + 86 + k * 46));
            });
        },
    };
}

/** Wörter auf höchstens maxZeilen umbrechen; die letzte Zeile wird nötigenfalls gekürzt. */
function umbrechen(g, inhalt, breite, maxZeilen) {
    const zeilen = [];
    let zeile = '';
    for (const wort of String(inhalt).split(/\s+/)) {
        const probe = zeile ? `${zeile} ${wort}` : wort;
        if (!zeile || g.measureText(probe).width <= breite) zeile = probe;
        else { zeilen.push(zeile); zeile = wort; }
    }
    if (zeile) zeilen.push(zeile);
    if (zeilen.length > maxZeilen) {
        const letzte = zeilen.slice(maxZeilen - 1).join(' ');
        zeilen.length = maxZeilen - 1;
        zeilen.push(letzte);
    }
    return zeilen.map(z => kuerze(g, z, breite));
}

// Zu lange Namen abschneiden, statt sie über den Rand laufen zu lassen.
function kuerze(g, inhalt, maxBreite) {
    if (g.measureText(inhalt).width <= maxBreite) return inhalt;
    let s = inhalt;
    while (s.length > 1 && g.measureText(`${s}…`).width > maxBreite) s = s.slice(0, -1);
    return `${s}…`;
}
