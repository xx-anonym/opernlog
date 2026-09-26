// Der Katalog hat seit dem Admin-Schreibrecht zwei Quellen: die drei Dateien
// im Repo und drei Tabellen in Supabase. Hier werden sie zu einer.
//
// Zusammengeführt wird durch Verändern der bestehenden Arrays, nicht durch
// neue. Das ist Absicht: operas, operaHouses und composers werden an 26
// Stellen importiert, und alle 26 halten dasselbe Array-Objekt in der Hand.
// Ein push() darauf sehen sie alle sofort. Ein neues Array müsste an 26
// Stellen nachgezogen werden, und die 27. würde vergessen.
//
// Reihenfolge beim Start:
//
//   1. beim Import: der zuletzt gesehene Stand aus dem localStorage. Ohne
//      Netz ist das der einzige, und er ist sofort da – die Seiten zeichnen
//      sich, bevor irgendeine Abfrage zurückkommt.
//   2. später im Start: der frische Stand aus der Cloud, danach zeichnet
//      main.js neu.
//
// Ohne Schritt 1 wäre ein selbst angelegtes Werk offline unsichtbar, und beim
// Start online würde es kurz fehlen und dann aufpoppen.

import { operas } from './operas.js';
import { operaHouses } from './operaHouses.js';
import { composers } from './composers.js';

const SPEICHER = 'opernlog_katalog_zusatz';

/** Die Spalten heißen in der Datenbank mit Unterstrich, in der App gemischt. */
const UMBENANNT = {
    year_composed: 'yearComposed',
    image_url: 'imageUrl',
    bild_lizenz: 'bildLizenz',
    bild_urheber: 'bildUrheber',
};

/** Eine Datenbankzeile in die Form bringen, die der Katalog führt. */
function alsKatalogEintrag(zeile) {
    const eintrag = {};
    for (const [spalte, wert] of Object.entries(zeile ?? {})) {
        // Verwaltungsspalten gehören nicht in den Katalog.
        if (spalte === 'created_at' || spalte === 'created_by') continue;
        eintrag[UMBENANNT[spalte] ?? spalte] = wert;
    }
    // Woher der Eintrag stammt, entscheidet, ob er sich aus der App entfernen
    // lässt: was in einer Datei im Repo steht, kann die App nicht löschen.
    eintrag.ausDatenbank = true;
    return eintrag;
}

/**
 * Einträge in ein Katalog-Array mischen, ohne Dubletten.
 * Ein Eintrag mit bekannter Id ersetzt den vorhandenen – so wirkt eine
 * Korrektur in der Datenbank, ohne dass der Nutzer die Seite neu lädt.
 */
function mischen(ziel, neue) {
    let dazu = 0;
    for (const eintrag of neue) {
        if (!eintrag?.id) continue;
        const platz = ziel.findIndex(v => v.id === eintrag.id);
        if (platz === -1) { ziel.push(eintrag); dazu++; }
        else ziel[platz] = eintrag;
    }
    return dazu;
}

/** Alle drei Listen auf einmal einmischen, dazu die Bildausschnitte. */
export function uebernehmen({ werke = [], haeuser = [], komponisten = [], ausschnitte } = {}) {
    const dazu = {
        werke: mischen(operas, werke.map(alsKatalogEintrag)),
        haeuser: mischen(operaHouses, haeuser.map(alsKatalogEintrag)),
        komponisten: mischen(composers, komponisten.map(alsKatalogEintrag)),
    };
    // Nach dem Mischen: ein Eintrag aus der Datenbank ist dabei durch ein
    // neues Objekt ersetzt worden und hätte seinen Ausschnitt sonst verloren.
    // Ein Stand von vor den Ausschnitten (im localStorage) bringt keine mit –
    // dann bleibt, was da ist, statt dass alles auf die Mitte springt.
    if (Array.isArray(ausschnitte)) ausschnitteAnwenden(ausschnitte);
    return dazu;
}

// ── Bildausschnitte ───────────────────────────────────────────────────────
//
// Welcher Teil eines Bildes zu sehen ist, legt ein Admin fest (Tabelle
// bild_ausschnitte). Er gilt für Werke und Häuser aus beiden Quellen, also
// auch für die Dateien im Repo – deshalb hängt er als Feld bildAusschnitt
// am Katalogeintrag, nicht an der Zeile in catalog_operas.

const KATALOG_JE_ART = { werk: operas, haus: operaHouses };

/**
 * Die Ausschnitte an die Einträge hängen. Wer keinen (mehr) hat, verliert
 * ihn: so wirkt auch das Zurücksetzen auf die Mitte auf anderen Geräten.
 */
function ausschnitteAnwenden(ausschnitte) {
    const je = new Map(ausschnitte.map(a => [`${a.art}:${a.id}`, a]));
    for (const [art, katalog] of Object.entries(KATALOG_JE_ART)) {
        for (const eintrag of katalog) {
            const a = je.get(`${art}:${eintrag.id}`);
            if (a) eintrag.bildAusschnitt = { x: Number(a.x), y: Number(a.y) };
            else delete eintrag.bildAusschnitt;
        }
    }
}

/**
 * Einen Ausschnitt sofort übernehmen, nachdem er gespeichert ist – im
 * Katalog und im Zwischenspeicher. null setzt auf die Mitte zurück.
 */
export function ausschnittSetzen(art, id, ausschnitt) {
    const eintrag = KATALOG_JE_ART[art]?.find(e => e.id === id);
    if (!eintrag) throw new Error(`Unbekannter Eintrag: ${art} ${id}`);
    if (ausschnitt) eintrag.bildAusschnitt = { x: Number(ausschnitt.x), y: Number(ausschnitt.y) };
    else delete eintrag.bildAusschnitt;

    const stand = ausSpeicher() ?? {};
    const andere = (stand.ausschnitte ?? []).filter(a => !(a.art === art && a.id === id));
    stand.ausschnitte = ausschnitt ? [...andere, { art, id, x: ausschnitt.x, y: ausschnitt.y }] : andere;
    inSpeicher(stand);
}

/**
 * Einen Eintrag aus dem Katalog nehmen – aus dem Array und aus dem
 * Zwischenspeicher. Gelöscht wird in der Datenbank, hier wird nur nachgezogen,
 * damit die Seite nicht erst neu geladen werden muss.
 */
export function entfernen(art, id) {
    const ziel = { werk: operas, haus: operaHouses, komponist: composers }[art];
    if (!ziel) throw new Error(`Unbekannte Art: ${art}`);

    const platz = ziel.findIndex(e => e.id === id);
    if (platz !== -1) ziel.splice(platz, 1);

    const stand = ausSpeicher();
    if (stand) {
        const schluessel = { werk: 'werke', haus: 'haeuser', komponist: 'komponisten' }[art];
        stand[schluessel] = (stand[schluessel] ?? []).filter(e => e.id !== id);
        inSpeicher(stand);
    }
    return platz !== -1;
}

/** Den zuletzt gesehenen Stand lesen. Fehlt er, ist das kein Fehler. */
export function ausSpeicher() {
    try {
        const roh = localStorage.getItem(SPEICHER);
        return roh ? JSON.parse(roh) : null;
    } catch {
        // Privater Modus, gesperrte Website-Daten, kaputter Inhalt: dann eben
        // nichts. Der Katalog aus dem Repo steht ja.
        return null;
    }
}

function inSpeicher(stand) {
    try {
        localStorage.setItem(SPEICHER, JSON.stringify(stand));
    } catch { /* siehe oben */ }
}

/**
 * Den frischen Stand holen und einmischen.
 *
 * @param holen  liefert { werke, haeuser, komponisten, ausschnitte } – in der App ist das
 *               getKatalogZusatzCloud() aus dem Supabase-Modul, in den Tests
 *               eine Attrappe.
 * @returns wie viele Einträge neu dazugekommen sind
 */
export async function ladeKatalogZusatz(holen) {
    const stand = await holen();
    // Kamen die Ausschnitte nicht (Fehler beim Holen), gelten die von zuletzt.
    if (!Array.isArray(stand.ausschnitte)) stand.ausschnitte = ausSpeicher()?.ausschnitte;
    inSpeicher(stand);
    return uebernehmen(stand);
}

// ── Beim Import: der Stand von zuletzt ────────────────────────────────────
//
// Läuft nur im Browser. Unter Node (Tests, Prüfläufe) gibt es keinen
// localStorage, und dort soll der Katalog ohnehin genau das sein, was im Repo
// steht – sonst prüfte tests/checks/katalog.test.js irgendwann Daten, die nur
// auf einem einzigen Rechner liegen.
if (typeof localStorage !== 'undefined') {
    const stand = ausSpeicher();
    if (stand) uebernehmen(stand);
}
