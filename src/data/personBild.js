// Ein Bild zur Personenseite (#/person/…): der Name bei Wikipedia
// nachgeschlagen, das Hauptbild des Artikels genommen (Jonas, 22.11.2026:
// "in der Regel passt es").
//
// Hier ohne DOM und ohne Netz, damit es sich prüfen lässt
// (tests/unit/personBild.test.js); abgerufen und angezeigt wird in
// src/components/PersonBild.js.
//
// Damit es nicht der gleichnamige Fußballer ist, muss die Kurzbeschreibung
// des Artikels zu dem passen, was die Person an den eigenen Abenden war:
// am Pult "Dirigent", bei der Regie "Regisseur", auf der Bühne "Sängerin"
// oder ein Stimmfach. Ohne Beschreibung kein Bild – lieber keins als ein
// falsches.

const PASST = {
    Dirigat: /dirigent|kapellmeister|generalmusikdirektor|chefdirigent|conductor|maestro/i,
    Regie: /regisseur|regie|intendant|bühnenbildner|director|choreograf|choreograph/i,
    // Alles andere ist eine Rolle auf der Bühne.
    Buehne: /sänger|sopran|mezzo|\balt(istin)?\b|kontraalt|tenor|bariton|bass|countertenor|koloratur|opern|singer|soprano|baritone|contralto|vocalist/i,
};

/**
 * Passt die Kurzbeschreibung eines Artikels zu dem, was die Person war?
 * @param {string} beschreibung  etwa "russisch-österreichischer Dirigent"
 * @param {string[]} als         Rollen, "Dirigat", "Regie" (siehe personen() in besetzung.js)
 */
export function passendeBeschreibung(beschreibung, als = []) {
    const text = String(beschreibung || '');
    if (!text.trim()) return false;
    const arten = new Set((als.length ? als : ['']).map(a => (a === 'Dirigat' || a === 'Regie' ? a : 'Buehne')));
    return [...arten].some(art => PASST[art].test(text));
}

/** Die Abfrage an die Wikipedia einer Sprache: Kurzbeschreibung, freies Hauptbild, Begriffsklärung erkennen. */
export function wikipediaAbfrage(name, sprache = 'de') {
    const titel = String(name || '').replace(/\s+/g, ' ').trim();
    return `https://${sprache}.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&origin=*&redirects=1`
        + '&prop=pageimages|description|pageprops&piprop=thumbnail|name&pithumbsize=400&pilicense=free&ppprop=disambiguation'
        + `&titles=${encodeURIComponent(titel)}`;
}

/**
 * Bildadressen von Commons in die Form, die die App sonst benutzt:
 * upload.wikimedia.org (den Host cacht der Service Worker, sw.js) und ohne
 * die Zählparameter, die Wikipedia neuerdings anhängt (?utm_source=…).
 */
export function bildAdresse(adresse) {
    const ohneQuery = String(adresse || '').split('?')[0];
    const m = ohneQuery.match(/^https:\/\/(?:upload|thumb)\.wikimedia\.org(\/wikipedia\/commons\/.+)$/);
    return m ? `https://upload.wikimedia.org${m[1]}` : null;
}

/**
 * Aus der Antwort der Abfrage der Artikel, wenn er zur Person passt – mit
 * Bild, wenn es ein freies gibt, sonst bild: null. Auch ohne Bild steht die
 * Kurzbeschreibung im Kopf der Personenseite (Jonas, 24.11.2026).
 * @param {object} antwort  JSON von wikipediaAbfrage()
 * @param {string[]} als
 * @param {string} sprache
 * @returns {{titel: string, beschreibung: string, bild: string|null, seite: string}|null}
 */
export function bildAusAntwort(antwort, als = [], sprache = 'de') {
    const seite = antwort?.query?.pages?.[0];
    if (!seite || seite.missing || seite.invalid || seite.pageprops?.disambiguation !== undefined) return null;
    if (!passendeBeschreibung(seite.description, als)) return null;
    const bild = bildAdresse(seite.thumbnail?.source);
    return {
        titel: seite.title,
        beschreibung: seite.description,
        bild,
        seite: `https://${sprache}.wikipedia.org/wiki/${encodeURIComponent(String(seite.title).replace(/ /g, '_'))}`,
    };
}
