// Der Feed der Startseite: früh angefragt, und für den Notfall gemerkt
// (seit 25.11.2026).
//
// Bis dahin fragte die Startseite die Abende der Freunde erst an, wenn sie
// gezeichnet wurde – etwa 600 ms, nachdem der Vorhang schon aufging. Danach
// drehte sich der Spinner, bis die Antwort da war. Jonas: "warum öffnet sich
// der vorhang auch dann, wenn der feed auf der startseite noch lädt?" – und:
// "der feed soll beim start der app trotzdem unbedingt brandaktuell sein".
//
// Also:
//   1. Vorladen: main.js stößt die Anfrage an, sobald beim Start die Sitzung
//      feststeht, neben dem übrigen Abgleich, und der Vorhang wartet darauf
//      (höchstens so lange wie auf den Abgleich, GEDULD in main.js). Die
//      erste Startseite nimmt genau diese Antwort; jede spätere fragt frisch,
//      damit "Ziehen zum Aktualisieren" wirklich aktualisiert.
//   2. Gezeigt wird beim Start nur, was frisch ist. Der gemerkte Feed (im
//      localStorage, je Konto) erscheint nur, wenn die Anfrage scheitert –
//      ohne Netz –, und dann mit dem Stand dazu. Ist sie nur langsam, dreht
//      sich der Spinner wie bisher.
//   3. Beim Neuzeichnen derselben Sitzung (Abgleich fertig, Zurückkehren)
//      steht sofort der Feed, der eben frisch geladen wurde, und wird
//      ersetzt, falls sich etwas geändert hat. Kein Spinner-Flackern.
//
// Die Abende der Freunde sind ohnehin öffentlich (Datenschutz: "Wer was sehen
// kann"); gemerkt wird nur, was die Seite anzeigt, ohne Fotos. Beim Abmelden
// räumt store.logout() den Vorrat weg.

const SCHLUESSEL = 'opernlog:feed';
// Mehr zeigt der Feed nicht (getFeedCloud: limit 50).
const HOECHSTENS = 50;

let vorgeladen = null;   // die Anfrage vom Start, bis die erste Startseite sie nimmt
let sitzung = null;      // { nutzer, feed } – zuletzt frisch geladen, nur im Speicher

function laden(lader, nutzerId, speicher) {
    return Promise.resolve()
        .then(lader)
        .then(feed => {
            sitzung = { nutzer: nutzerId, feed };
            merken(nutzerId, feed, { speicher });
            return feed;
        });
}

/**
 * Beim Start: die Anfrage anstoßen. Das Ergebnis scheitert nie – der Start
 * wartet darauf, ohne zu stolpern; true, wenn der Feed frisch da ist.
 * @param {() => Promise<object[]>} lader  z. B. () => sb.getFeedCloud()
 * @param {string} nutzerId
 */
export function vorladen(lader, nutzerId, { speicher = globalThis.localStorage } = {}) {
    vorgeladen = laden(lader, nutzerId, speicher);
    // Unbehandelt bliebe ein Fehler hier liegen, wenn die Startseite nie kommt.
    vorgeladen.catch(() => {});
    return vorgeladen.then(() => true, () => false);
}

/**
 * Für die Startseite.
 * @returns {{ sofort: object[]|null, frisch: Promise<object[]> }}
 *   sofort  was gleich stehen darf: der in dieser Sitzung frisch geladene
 *           Feed (nie der gemerkte vom letzten Mal)
 *   frisch  die Antwort vom Start (einmal), sonst eine neue Anfrage
 */
export function holen(lader, nutzerId, { speicher = globalThis.localStorage } = {}) {
    const sofort = sitzung && sitzung.nutzer === nutzerId ? sitzung.feed : null;
    if (vorgeladen) {
        const frisch = vorgeladen;
        vorgeladen = null;
        return { sofort, frisch };
    }
    return { sofort, frisch: laden(lader, nutzerId, speicher) };
}

/** Der zuletzt geladene Feed dieses Kontos mit Zeitpunkt, oder null. */
export function gemerkt(nutzerId, { speicher = globalThis.localStorage } = {}) {
    if (!nutzerId) return null;
    try {
        const daten = JSON.parse(speicher?.getItem(SCHLUESSEL) || 'null');
        if (!daten || daten.nutzer !== nutzerId || !Array.isArray(daten.feed)) return null;
        return { feed: daten.feed, zeit: daten.zeit || null };
    } catch {
        return null;
    }
}

export function merken(nutzerId, feed, { speicher = globalThis.localStorage, jetzt = Date.now() } = {}) {
    if (!nutzerId || !Array.isArray(feed)) return;
    try {
        speicher?.setItem(SCHLUESSEL, JSON.stringify({ nutzer: nutzerId, zeit: jetzt, feed: feed.slice(0, HOECHSTENS) }));
    } catch {
        // Speicher voll oder gesperrt: dann eben ohne Vorrat.
    }
}

/** Beim Abmelden. */
export function vergessen({ speicher = globalThis.localStorage } = {}) {
    vorgeladen = null;
    sitzung = null;
    try { speicher?.removeItem(SCHLUESSEL); } catch { /* egal */ }
}

/** Unterscheidet sich der frische Feed von dem, der schon zu sehen ist? */
export function anders(alt, neu) {
    if (!alt) return true;
    return JSON.stringify(alt) !== JSON.stringify(neu);
}

/** "Stand: heute, 21:40" / "Stand: 23.11., 21:40" für den gemerkten Feed. */
export function standText(zeit, jetzt = new Date()) {
    if (!zeit) return 'Gespeicherter Stand';
    const d = new Date(zeit);
    const uhr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const heute = d.toDateString() === jetzt.toDateString();
    return heute ? `Stand: heute, ${uhr}` : `Stand: ${d.getDate()}.${d.getMonth() + 1}., ${uhr}`;
}

/** Nur für Tests: den Zustand des Moduls zurücksetzen. */
export function _zuruecksetzen() {
    vorgeladen = null;
    sitzung = null;
}
