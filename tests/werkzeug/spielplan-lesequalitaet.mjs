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

/** Fehlen dem Lauf Seiten dieses Hauses? Dann ist, was er dort nicht fand, kein Befund. */
export function lueckenhaft(erg) {
    return gesperrteSeiten(erg).length > 0;
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
 * Ein zweiter Versuch lohnt, wenn Seiten gesperrt waren oder der Lauf an
 * einem Haus nichts fand, das in der App noch Termine hat.
 * @param {object} erg
 * @param {object[]} [bekannt]  Seiten des Hauses, auf die die App verlinkt
 */
export function zweiterVersuchLohnt(erg, bekannt = []) {
    return lueckenhaft(erg) || (bekannt.length > 0 && mitTerminen(erg) === 0);
}

/** Von zwei Läufen desselben Hauses der mit mehr Werken, bei Gleichstand der mit weniger gesperrten Seiten. */
export function besseresErgebnis(a, b) {
    if (mitTerminen(a) !== mitTerminen(b)) return mitTerminen(b) > mitTerminen(a) ? b : a;
    return gesperrteSeiten(b).length < gesperrteSeiten(a).length ? b : a;
}
