// Wie gut ein Haus in einem Lauf von spielplaene-lesen.mjs gelesen wurde.
//
// Ohne Browser und ohne Netz, damit es sich prüfen lässt
// (tests/unit/spielplanLesequalitaet.test.js). Gebraucht wird es an drei
// Stellen: der Lauf selbst entscheidet damit, welche Häuser er am Ende noch
// einmal liest; die Übernahme lässt bei lückenhaft gelesenen Häusern nichts
// wegfallen; der Bericht nennt sie beim Namen.
//
// Anlass: der Lauf vom 13.11.2026 auf GitHub. Die Bayerische Staatsoper gab
// jede zweite Seite mit 403 zurück, galt aber als gelesen, weil einige Seiten
// luden – und das Issue meldete 23 ihrer Produktionen als "nicht mehr
// gefunden".

/**
 * Antwortet ein Haus so, sperrt es den Lauf oder ist überlastet – die Seite
 * gibt es, nur nicht jetzt und nicht für uns. 404 gehört nicht dazu: die
 * Staatsoper Berlin hat für August noch keinen Kalender, Nürnberg keine
 * Produktionsseiten mehr. 0 heißt: gar keine Antwort.
 */
export function gesperrt(status) {
    return status === 0 || status === 403 || status === 429 || status >= 500;
}

/**
 * Die Seiten eines Hauses, die der Lauf nicht bekam: gesperrt (403, 429,
 * 5xx) oder ohne Antwort. Aus dem, was der Lauf ohnehin festhält – so gilt es
 * auch für ältere Läufe.
 * @param {{besucht?: object[], treffer?: object[], fehler?: string[]}} erg
 * @returns {string[]} Adressen, jede einmal
 */
export function gesperrteSeiten(erg) {
    const zu = new Set();
    for (const b of erg?.besucht || []) if (gesperrt(b.status ?? 0)) zu.add(b.url);
    for (const t of erg?.treffer || []) if (gesperrt(t.status ?? 0)) zu.add(t.url);
    for (const f of erg?.fehler || []) { const u = /^(https?:\S+?): /.exec(f)?.[1]; if (u) zu.add(u); }
    return [...zu];
}

/** Wie viele Seiten der Lauf an einem Haus aufrief. */
export function geleseneSeiten(erg) {
    return new Set([...(erg?.besucht || []).map(b => b.url), ...(erg?.treffer || []).map(t => t.url), ...gesperrteSeiten(erg)]).size;
}

/**
 * Was dem Lauf an einem Haus fehlt, so genau wie möglich – denn manche
 * Lücken sind harmlos und kehren jeden Monat wieder: Detmold und Luzern
 * antworten für Kalendermonate nach Ende der Spielzeit mit 500 statt 404.
 *
 *   ganz    eine Einstiegs- oder Übersichtsseite fehlt: was der Lauf an dem
 *           Haus nicht fand, hat er vielleicht nur nicht gesehen
 *   monate  die Kalenderseite dieser Monate fehlt: unsicher sind nur Termine
 *           in diesen Monaten
 *   werke   die Seite dieser Produktionen fehlt: unsicher sind nur ihre Termine
 *
 * Ältere Läufe nennen den Monat einer Kalenderseite nicht; dort zählt jede
 * gesperrte Einstiegsseite fürs ganze Haus.
 *
 * @returns {{ganz: boolean, monate: string[], werke: string[]}|null}  null: nichts fehlt
 */
export function luecken(erg) {
    const zu = new Set(gesperrteSeiten(erg));
    if (!zu.size) return null;
    const einstieg = new Map((erg?.besucht || []).map(b => [b.url, b.monat || null]));
    const produktion = new Map();
    for (const t of erg?.treffer || []) if (gesperrt(t.status ?? 0)) produktion.set(t.url, [...(produktion.get(t.url) || []), t.werk]);
    const aus = { ganz: false, monate: new Set(), werke: new Set() };
    for (const u of zu) {
        if (produktion.has(u)) produktion.get(u).forEach(w => aus.werke.add(w));
        else if (einstieg.get(u)) aus.monate.add(einstieg.get(u));
        else if (einstieg.has(u)) aus.ganz = true;
        // Sonst: die Ansicht eines einzelnen Termins (Frankfurt). Dort fehlt
        // höchstens eine Uhrzeit, kein Termin.
    }
    if (!aus.ganz && !aus.monate.size && !aus.werke.size) return null;
    return { ganz: aus.ganz, monate: [...aus.monate].sort(), werke: [...aus.werke].sort() };
}

/** Fehlen dem Lauf Seiten dieses Hauses? */
export function lueckenhaft(erg) {
    return luecken(erg) !== null;
}

/**
 * Ist unsicher, ob dieser Termin wirklich entfallen ist?
 * @param {{ganz: boolean, monate: string[], werke: string[]}|null|undefined} l  von luecken()
 */
export function unsicher(l, werk, termin) {
    return !!l && (l.ganz || l.werke.includes(werk) || l.monate.includes(termin.slice(0, 7)));
}

/**
 * Trifft die Lücke etwas, das die App zeigt? Eine gesperrte Kalenderseite
 * für einen Monat, in dem das Haus nichts spielt, ist keine Meldung wert.
 * @param {object|null} l  von luecken()
 * @param {{termine: string[]}[]} zeilen  die Einträge des Hauses in der App
 * @param {string} heute
 */
export function lueckeZaehlt(l, zeilen, heute) {
    if (!l) return false;
    if (l.ganz || l.werke.length) return true;
    return zeilen.some(z => z.termine.some(t => t > heute && l.monate.includes(t.slice(0, 7))));
}

/**
 * Warum der Lauf an einem Haus nichts fand – für den Bericht.
 * @returns {string}
 */
export function leseGrund(erg) {
    const zu = gesperrteSeiten(erg);
    const alle = geleseneSeiten(erg);
    const status = [...new Set([...(erg?.besucht || []), ...(erg?.treffer || [])].map(x => x.status).filter(gesperrt).filter(Boolean))].sort();
    const keineAntwort = (erg?.fehler || []).some(f => /timeout|net::|zeit/i.test(f));
    if (!alle) return 'keine Einstiegsseite';
    if (!zu.length) return 'Seiten luden, aber ohne ein Werk mit Terminen';
    const teile = [];
    if (status.length) teile.push(`HTTP ${status.join(', ')}`);
    if (keineAntwort) teile.push('keine Antwort');
    return `${zu.length} von ${alle} ${alle === 1 ? 'Seite' : 'Seiten'} gesperrt${teile.length ? ` (${teile.join(', ')})` : ''}`;
}

const mitTerminen = erg => Object.values(erg?.werke || {}).filter(w => w.termine?.length).length;

/**
 * Ein zweiter Versuch lohnt, wenn Seiten fehlen, auf die es ankommt, oder
 * der Lauf an einem Haus nichts fand, das in der App noch Termine hat.
 * @param {object} erg
 * @param {{termine: string[]}[]} [zeilen]  die Einträge des Hauses in der App
 * @param {string} [heute]
 */
export function zweiterVersuchLohnt(erg, zeilen = [], heute = '') {
    const kommt = zeilen.some(z => z.termine.some(t => t > heute));
    return lueckeZaehlt(luecken(erg), zeilen, heute) || (kommt && mitTerminen(erg) === 0);
}

/** Von zwei Läufen desselben Hauses der mit mehr Werken, bei Gleichstand der mit weniger gesperrten Seiten. */
export function besseresErgebnis(a, b) {
    if (mitTerminen(a) !== mitTerminen(b)) return mitTerminen(b) > mitTerminen(a) ? b : a;
    return gesperrteSeiten(b).length < gesperrteSeiten(a).length ? b : a;
}
