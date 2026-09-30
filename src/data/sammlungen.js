// Sammlungen: Werkgruppen und Häuser, die man gern vollständig hätte – der
// ganze Ring, alle drei Da-Ponte-Opern, Oper in jedem Bundesland.
//
// Als gesehen zählt ein Werk, das geloggt oder als "schon gesehen" markiert
// ist (wie "Werke gesehen" im Profil); ein Haus, in dem ein Abend geloggt
// ist. Die Mitglieder stehen als Kennungen aus dem Katalog;
// tests/unit/sammlungen.test.js prüft, dass es sie gibt.

import { operas } from './operas.js';
import { operaHouses } from './operaHouses.js';

// Die Häuser außerhalb Deutschlands tragen das Land statt eines Bundeslands.
const KEIN_BUNDESLAND = new Set(['Österreich', 'Schweiz']);

export const SAMMLUNGEN = [
    {
        id: 'ring', titel: 'Der Ring des Nibelungen', art: 'werke',
        mitglieder: ['ring-rheingold', 'ring-walkuere', 'ring-siegfried', 'ring-goetterdaemmerung'],
    },
    {
        id: 'da-ponte', titel: 'Mozarts Da-Ponte-Opern', art: 'werke',
        mitglieder: ['nozze-di-figaro', 'don-giovanni', 'cosi-fan-tutte'],
    },
    {
        id: 'trilogia', titel: 'Verdis Trilogia popolare', art: 'werke',
        mitglieder: ['rigoletto', 'il-trovatore', 'la-traviata'],
    },
    {
        id: 'trittico', titel: 'Puccinis Il trittico', art: 'werke',
        mitglieder: ['il-tabarro', 'suor-angelica', 'gianni-schicchi'],
    },
    {
        // Die zehn Werke, die in Bayreuth gespielt werden – der Ring zählt
        // mit seinen vier Teilen.
        id: 'bayreuth', titel: 'Der Bayreuther Kanon', art: 'werke',
        mitglieder: ['fliegender-hollaender', 'tannhaeuser', 'lohengrin', 'tristan', 'meistersinger',
            'ring-rheingold', 'ring-walkuere', 'ring-siegfried', 'ring-goetterdaemmerung', 'parsifal'],
    },
    {
        id: 'berlin', titel: 'Die drei Berliner Opernhäuser', art: 'haeuser',
        mitglieder: ['staatsoper-berlin', 'deutsche-oper-berlin', 'komische-oper-berlin'],
    },
    {
        id: 'wien', titel: 'Wiens große drei', art: 'haeuser',
        mitglieder: ['wiener-staatsoper', 'volksoper-wien', 'theater-an-der-wien'],
    },
    {
        // Die Häuser, die die Kritikerumfrage der Zeitschrift Opernwelt zum
        // "Opernhaus des Jahres" gewählt hat, 1992/93 bis 2025/26 – laut
        // de.wikipedia.org/wiki/Kritikerumfrage_der_Opernwelt, Stand 30.9.2026.
        // Nicht im Katalog und deshalb nicht dabei: La Monnaie (2010/11),
        // Opéra de Lyon (2016/17), Opéra national du Rhin (2018/19). 2003/04
        // ging der Titel an "das deutsche Stadttheater", kein einzelnes Haus.
        // Kommt ein neuer Preisträger dazu (jeden Herbst), hier ergänzen.
        id: 'opernhaus-des-jahres', titel: 'Die Opernhäuser des Jahres', art: 'haeuser',
        mitglieder: ['oper-leipzig', 'staatstheater-stuttgart', 'opernhaus-zuerich', 'oper-frankfurt',
            'hamburgische-staatsoper', 'oper-graz', 'theater-bremen', 'komische-oper-berlin', 'theater-essen',
            'theater-basel', 'oper-koeln', 'bayerische-staatsoper', 'nationaltheater-mannheim',
            'grand-theatre-geneve', 'staatstheater-mainz'],
    },
    { id: 'bundeslaender', titel: 'Oper in allen 16 Bundesländern', art: 'bundeslaender' },
];

/** Die Bundesländer, in denen der Katalog Häuser hat – alphabetisch. */
export function bundeslaender() {
    return [...new Set(operaHouses.map(h => h.state).filter(s => s && !KEIN_BUNDESLAND.has(s)))]
        .sort((a, b) => a.localeCompare(b, 'de'));
}

function teile(sammlung) {
    if (sammlung.art === 'bundeslaender') return bundeslaender().map(s => ({ id: s, name: s }));
    const katalog = sammlung.art === 'werke' ? operas : operaHouses;
    return sammlung.mitglieder
        .map(id => katalog.find(e => e.id === id))
        .filter(Boolean)
        .map(e => ({ id: e.id, name: e.title || e.name }));
}

/**
 * Der Stand jeder Sammlung. Begonnene zuerst, die dem Ende nächsten vorn;
 * dann die vollständigen; dann die unbegonnenen, die kleinsten vorn.
 *
 * @param {Array<object>} besuche  Abende – aus dem Store (operaId, houseId) oder
 *   so, wie fremde aus der Datenbank kommen (opera_id, house_id)
 * @param {string[]} [gesehen]  als "schon gesehen" markierte Werke; nur die
 *   eigenen, die fremden sind privat
 * @returns {Array<{sammlung: object, teile: Array<{id: string, name: string, erledigt: boolean}>,
 *   erledigt: number, gesamt: number, vollstaendig: boolean}>}
 */
export function fortschritt(besuche, gesehen = []) {
    const werke = new Set([...(besuche || []).map(b => b.operaId ?? b.opera_id), ...(gesehen || [])]);
    const haeuser = new Set((besuche || []).map(b => b.houseId ?? b.house_id));
    const laender = new Set([...haeuser].map(id => operaHouses.find(h => h.id === id)?.state).filter(Boolean));
    const hat = { werke, haeuser, bundeslaender: laender };

    const stand = SAMMLUNGEN.map((sammlung) => {
        const liste = teile(sammlung).map(t => ({ ...t, erledigt: hat[sammlung.art].has(t.id) }));
        const erledigt = liste.filter(t => t.erledigt).length;
        return { sammlung, teile: liste, erledigt, gesamt: liste.length, vollstaendig: erledigt === liste.length };
    });

    const rang = s => (s.vollstaendig ? 1 : s.erledigt > 0 ? 0 : 2);
    return stand.sort((a, b) => rang(a) - rang(b)
        || (rang(a) === 0 ? b.erledigt / b.gesamt - a.erledigt / a.gesamt : 0)
        || (rang(a) === 2 ? a.gesamt - b.gesamt : 0));
}
