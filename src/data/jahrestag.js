// "Heute vor einem Jahr": eigene Abende, die auf den Tag genau ein oder
// mehrere Jahre zurückliegen – für die Startseite (src/pages/Home.js).
//
// Nur der genaue Tag zählt, kein "ungefähr um diese Zeit": so bleibt es eine
// kleine Überraschung und kein Dauergast. Ein Abend am 29. Februar meldet
// sich in Jahren ohne diesen Tag am 28.

const istSchaltjahr = j => (j % 4 === 0 && j % 100 !== 0) || j % 400 === 0;

/**
 * @param {Array} besuche  eigene Abende, Datum als 'JJJJ-MM-TT'
 * @param {Date} heute
 * @returns {Array<{visit: object, jahre: number}>}  der jüngste Jahrestag zuerst
 */
export function abendeAmJahrestag(besuche, heute = new Date()) {
    const jahr = heute.getFullYear();
    const monat = heute.getMonth() + 1;
    const tag = heute.getDate();
    const auch29 = monat === 2 && tag === 28 && !istSchaltjahr(jahr);

    return (besuche || [])
        .map((visit) => {
            // Von Hand zerlegt: new Date('JJJJ-MM-TT') liegt auf Mitternacht
            // UTC und rutscht je nach Zeitzone auf den Vortag.
            const m = String(visit.date || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
            return m ? { visit, j: Number(m[1]), m: Number(m[2]), t: Number(m[3]) } : null;
        })
        .filter(d => d && d.j < jahr
            && ((d.m === monat && d.t === tag) || (auch29 && d.m === 2 && d.t === 29)))
        .map(d => ({ visit: d.visit, jahre: jahr - d.j }))
        .sort((a, b) => a.jahre - b.jahre);
}

/** "Heute vor einem Jahr", "Heute vor 3 Jahren" */
export function jahrestagText(jahre) {
    return jahre === 1 ? 'Heute vor einem Jahr' : `Heute vor ${jahre} Jahren`;
}

/**
 * Der Anfang eines Reviews für eine Karte: Leerraum zusammengezogen, nach
 * höchstens `laenge` Zeichen an einer Wortgrenze gekürzt.
 */
export function reviewAuszug(text, laenge = 120) {
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    if (s.length <= laenge) return s;
    const schnitt = s.slice(0, laenge);
    const grenze = schnitt.lastIndexOf(' ');
    return `${(grenze > laenge / 2 ? schnitt.slice(0, grenze) : schnitt).replace(/[\s,;:.–-]+$/, '')} …`;
}
