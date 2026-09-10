// Die Regeln, nach denen ein Katalogeintrag gebaut sein muss.
//
// Bis hierher standen sie ausschließlich in tests/checks/katalog.test.js und
// galten damit nur für das, was im Repo liegt. Seit der Admin Werke und Häuser
// aus der App heraus anlegen kann, gibt es einen zweiten Weg in den Katalog,
// den kein Test der Welt vor dem Speichern sieht.
//
// Deshalb stehen die Regeln jetzt hier, als schlichte Funktionen ohne DOM und
// ohne Netz, und werden an drei Stellen benutzt:
//
//   1. im Formular, damit der Admin den Fehler sieht, bevor er speichert
//   2. in tests/checks/katalogRegeln.test.js gegen den Katalog im Repo, damit
//      Regel und Bestand nicht auseinanderlaufen
//   3. in tests/werkzeug/katalog-datenbank-pruefen.mjs, das täglich in der CI
//      über die Datenbank läuft und ein Issue aufmacht, wenn dort etwas steht,
//      das den Regeln nicht genügt
//
// Jede Funktion gibt eine Liste von Mängeln in Klartext zurück. Leere Liste
// heißt: nichts zu beanstanden.

// Muss mit IMAGE_HOSTS in sw.js übereinstimmen: von einem anderen Host holt
// der Service Worker nichts, das Bild wäre offline eine leere Kachel.
// tests/checks/katalogRegeln.test.js hält beide Listen zusammen.
export const BILD_HOSTS = ['upload.wikimedia.org'];

// Wikimedia liefert nur eine feste Liste von Breiten und antwortet auf alles
// andere mit HTTP 400. 500 ist die, die der ganze Katalog benutzt.
export const BILD_BREITE = 500;

// Grobe Umrisse. Sie fangen, was eine allgemeine Bereichsprüfung durchlässt:
// vertauschte lat/lon, ein verrutschtes Komma, eine aus der falschen Zeile
// kopierte Koordinate.
export const LAENDER = {
    'Österreich': { lat: [46.3, 49.1], lon: [9.4, 17.2] },
    'Schweiz':    { lat: [45.8, 47.9], lon: [5.9, 10.6] },
};
export const DEUTSCHLAND = { lat: [47.2, 55.1], lon: [5.8, 15.1] };

const ID_MUSTER = /^[a-z0-9-]+$/;

// Lizenzen mit "BY" verlangen die Namensnennung des Urhebers – das ist der
// ganze Inhalt des Kürzels. Public domain und CC0 verlangen sie nicht.
const BRAUCHT_URHEBER = /^CC BY/i;

const leer = (w) => !String(w ?? '').trim();

/** Aus einem Titel ein brauchbarer Id-Vorschlag. Der Admin darf ihn ändern. */
export function idVorschlag(text) {
    return String(text ?? '')
        .toLowerCase()
        .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
        // Alles Übrige entkleiden: é wird e, à wird a.
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/** Prüft eine Bildadresse gegen Host, Protokoll und Breite. */
function bildMaengel(adresse, feld) {
    const maengel = [];
    if (leer(adresse)) return [`${feld} fehlt.`];

    let url;
    try {
        url = new URL(adresse);
    } catch {
        return [`${feld} ist keine gültige Adresse.`];
    }

    if (url.protocol !== 'https:') maengel.push(`${feld} muss über https kommen.`);
    if (!BILD_HOSTS.includes(url.hostname)) {
        maengel.push(`${feld}: ${url.hostname} ist nicht ${BILD_HOSTS.join(' oder ')}. `
            + 'Von einem anderen Host holt der Service Worker nichts, offline bliebe die Kachel leer.');
    }

    const breite = adresse.match(/\/thumb\/.*?\/(?:lossy-page1-|page1-)?(\d+)px-/);
    if (!breite) {
        maengel.push(`${feld} zeigt auf das Original statt auf eine verkleinerte Fassung. `
            + 'Ein Katalogbild wurde so schon einmal 39 MB groß.');
    } else if (Number(breite[1]) > BILD_BREITE) {
        maengel.push(`${feld} ist ${breite[1]}px breit, erlaubt sind höchstens ${BILD_BREITE}px.`);
    }

    return maengel;
}

/** Id: vorhanden, url-tauglich, noch nicht vergeben. */
function idMaengel(id, vergeben) {
    if (leer(id)) return ['Die Id fehlt.'];
    const maengel = [];
    if (!ID_MUSTER.test(id)) {
        maengel.push(`Die Id "${id}" taugt nicht für eine Adresse. `
            + 'Erlaubt sind Kleinbuchstaben, Ziffern und Bindestriche.');
    }
    if (vergeben?.includes(id)) maengel.push(`Die Id "${id}" ist schon vergeben.`);
    return maengel;
}

function zahlMaengel(wert, feld, { min, max } = {}) {
    if (wert === '' || wert === null || wert === undefined) return [`${feld} fehlt.`];
    const n = Number(wert);
    if (!Number.isFinite(n)) return [`${feld} muss eine Zahl sein.`];
    if (min !== undefined && n < min) return [`${feld} muss mindestens ${min} sein.`];
    if (max !== undefined && n > max) return [`${feld} darf höchstens ${max} sein.`];
    return [];
}

/**
 * Ein Werk.
 * @param bestand { werke: [], komponisten: [] } – der Katalog, gegen den geprüft wird
 */
export function pruefeWerk(werk = {}, bestand = {}) {
    const werke = bestand.werke ?? [];
    const komponisten = bestand.komponisten ?? [];
    const maengel = [];

    maengel.push(...idMaengel(werk.id, werke.map(w => w.id)));

    if (leer(werk.title)) maengel.push('Der Titel fehlt.');
    if (leer(werk.composer)) {
        maengel.push('Der Komponist fehlt.');
    } else {
        // Blinde Flecken und die Statistik gruppieren über die Zeichenkette.
        // Ein "Giuseppe  Verdi" mit zwei Leerzeichen wäre ein zweiter Komponist.
        const sauber = werk.composer.trim().replace(/\s+/g, ' ');
        if (werk.composer !== sauber) {
            maengel.push(`Der Komponistenname ist krumm geschrieben: "${werk.composer}".`);
        }
        if (!komponisten.some(k => k.name === sauber)) {
            maengel.push(`Zu "${sauber}" gibt es kein Komponistenprofil. `
                + 'Ohne eines verlinkt die Werkseite ins Leere.');
        }
    }

    for (const [feld, name] of [['language', 'Die Sprache'], ['genre', 'Die Gattung'],
                                ['librettist', 'Der Librettist'], ['description', 'Die Beschreibung']]) {
        if (leer(werk[feld])) maengel.push(`${name} fehlt.`);
    }

    maengel.push(...zahlMaengel(werk.yearComposed, 'Das Entstehungsjahr', { min: 1000, max: 2100 }));
    maengel.push(...zahlMaengel(werk.acts, 'Die Zahl der Akte', { min: 1, max: 12 }));
    maengel.push(...bildMaengel(werk.image, 'Das Bild'));

    return maengel;
}

/**
 * Ein Haus.
 * @param bestand { haeuser: [] }
 */
export function pruefeHaus(haus = {}, bestand = {}) {
    const haeuser = bestand.haeuser ?? [];
    const maengel = [];

    maengel.push(...idMaengel(haus.id, haeuser.map(h => h.id)));

    if (leer(haus.name)) maengel.push('Der Name fehlt.');
    if (leer(haus.city)) maengel.push('Die Stadt fehlt.');
    if (leer(haus.state)) maengel.push('Das Bundesland oder Land fehlt.');
    if (leer(haus.description)) maengel.push('Die Beschreibung fehlt.');

    const lat = Number(haus.lat), lon = Number(haus.lon);
    const koordinatenDa = Number.isFinite(lat) && Number.isFinite(lon);
    maengel.push(...zahlMaengel(haus.lat, 'Die Breite'));
    maengel.push(...zahlMaengel(haus.lon, 'Die Länge'));

    if (koordinatenDa) {
        const kasten = LAENDER[haus.state] || DEUTSCHLAND;
        const land = LAENDER[haus.state] ? haus.state : 'Deutschland';
        if (lat < kasten.lat[0] || lat > kasten.lat[1] || lon < kasten.lon[0] || lon > kasten.lon[1]) {
            maengel.push(`Der Punkt ${lat}, ${lon} liegt nicht in ${land}. `
                + 'Sind Breite und Länge vertauscht?');
        }
        // Identische Koordinaten wären ein kopierter Eintrag, und die
        // Vorauswahl beim Loggen träfe dann zufällig.
        const doppelt = haeuser.find(h => Number(h.lat) === lat && Number(h.lon) === lon);
        if (doppelt) maengel.push(`Auf genau diesem Punkt steht schon "${doppelt.name}".`);
    }

    maengel.push(...zahlMaengel(haus.capacity, 'Die Platzzahl', { min: 1, max: 20000 }));
    maengel.push(...zahlMaengel(haus.founded, 'Das Gründungsjahr', { min: 1000, max: 2100 }));

    if (!/^#[0-9a-fA-F]{6}$/.test(haus.color || '')) {
        maengel.push('Die Farbe muss als #rrggbb angegeben sein. '
            + 'Sie ist die Rückfallebene, wenn das Bild fehlt.');
    }

    maengel.push(...bildMaengel(haus.imageUrl, 'Das Bild'));

    return maengel;
}

/**
 * Ein Komponist.
 * @param bestand { komponisten: [] }
 */
export function pruefeKomponist(k = {}, bestand = {}) {
    const komponisten = bestand.komponisten ?? [];
    const maengel = [];

    maengel.push(...idMaengel(k.id, komponisten.map(c => c.id)));

    if (leer(k.name)) maengel.push('Der Name fehlt.');
    if (komponisten.some(c => c.name === String(k.name ?? '').trim())) {
        maengel.push(`"${k.name}" steht schon im Komponistenkatalog.`);
    }
    if (leer(k.kurz)) maengel.push('Die Kurzfassung fehlt.');

    if (leer(k.bio)) {
        maengel.push('Die Biografie fehlt.');
    } else if (!/[.!?]$/.test(k.bio.trim())) {
        // Der Text wird bei 320 Zeichen geschnitten. Mitten im Satz
        // abzubrechen sähe nach einem Fehler aus, nicht nach einer Kurzfassung.
        maengel.push('Die Biografie endet nicht auf einem Satzzeichen.');
    }

    // Ohne Artikel dürfte der Text nicht dort stehen: er stammt aus der
    // Wikipedia und steht unter CC BY-SA, das verlangt die Herkunftsangabe.
    if (!/^https:\/\/de\.wikipedia\.org\/wiki\//.test(k.wikipedia || '')) {
        maengel.push('Der Wikipedia-Artikel fehlt. Die Biografie stammt von dort '
            + 'und steht unter CC BY-SA – ohne Quellenangabe darf sie nicht in der App stehen.');
    }

    // Ein Komponist ohne freies Porträt ist erlaubt, die Seite zeigt dann das
    // Monogramm. Steht aber eines da, muss es den Regeln genügen.
    if (!leer(k.bild)) {
        maengel.push(...bildMaengel(k.bild, 'Das Porträt'));
        if (leer(k.bildLizenz)) {
            maengel.push('Das Porträt nennt keine Lizenz.');
        } else if (BRAUCHT_URHEBER.test(k.bildLizenz) && leer(k.bildUrheber)) {
            // Nur bei den BY-Lizenzen. Bei Public domain und CC0 ist die
            // Namensnennung nicht verlangt, und bei den fünf Porträts im
            // Katalog, die keinen Urheber führen, ist er schlicht unbekannt –
            // Fotografien des 19. Jahrhunderts.
            maengel.push(`Die Lizenz "${k.bildLizenz}" verlangt Namensnennung, `
                + 'aber es steht kein Urheber dabei.');
        }
    }

    return maengel;
}
