// Sammlungen: Werkgruppen und Häuser, die man gern vollständig hätte – der
// ganze Ring, alle drei Da-Ponte-Opern, Oper in jedem Bundesland.
//
// Jede beruht auf einer nachprüfbaren Regel oder einer benannten Quelle,
// nicht auf Geschmack (Jonas, 30.9.2026); die Quelle steht dabei.
//
// Als gesehen zählt ein Werk, das geloggt oder als "schon gesehen" markiert
// ist (wie "Werke gesehen" im Profil); ein Haus, in dem ein Abend geloggt
// ist. Die Mitglieder stehen als Kennungen aus dem Katalog;
// tests/unit/sammlungen.test.js prüft, dass es sie gibt.
//
// Arten:
//   werke, haeuser  feste Mitglieder aus dem Katalog
//   merkmal         je ein Werk (von: 'werke') oder Haus (von: 'haeuser')
//                   für jeden Wert eines Merkmals – je eine Sprache, ein
//                   Jahrhundert, ein Bundesland

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
        // Die zehn meistgespielten Opern laut Operabase, Spielzeit 2017/18
        // (zitiert nach operasense.com/most-popular-operas, abgerufen
        // 1.10.2026). Dieselben zehn Titel nennt WFMT (12.5.2025) nach
        // Operabase für 2000 bis heute, nur in anderer Reihenfolge.
        id: 'meistgespielt', titel: 'Die zehn meistgespielten Opern', art: 'werke',
        mitglieder: ['la-traviata', 'carmen', 'zauberflote', 'la-boheme', 'tosca', 'barbiere',
            'rigoletto', 'nozze-di-figaro', 'don-giovanni', 'madama-butterfly'],
    },
    {
        // Mozarts Opern ab Idomeneo (1781) – die sieben, die gemeint sind,
        // wenn von seinen großen Opern die Rede ist. Der Test prüft die Regel
        // gegen den Katalog.
        id: 'mozart', titel: 'Mozarts sieben große Opern', art: 'werke',
        mitglieder: ['idomeneo', 'entfuehrung', 'nozze-di-figaro', 'don-giovanni', 'cosi-fan-tutte',
            'zauberflote', 'clemenza-di-tito'],
    },
    {
        // Strauss-Opern mit Libretto von Hugo von Hofmannsthal, soweit im
        // Katalog – Die ägyptische Helena (1928) fehlt dort. Der Test prüft
        // die Regel gegen den Katalog; kommt sie hinzu, schlägt er an.
        id: 'strauss-hofmannsthal', titel: 'Strauss & Hofmannsthal', art: 'werke',
        mitglieder: ['elektra', 'rosenkavalier', 'ariadne-naxos', 'frau-ohne-schatten', 'arabella'],
    },
    {
        // Verdis Opern nach Dramen von Shakespeare.
        id: 'verdi-shakespeare', titel: 'Verdis Shakespeare', art: 'werke',
        mitglieder: ['macbeth', 'otello', 'falstaff'],
    },
    {
        // Je ein Werk der drei Komponisten, mit denen der Belcanto gemeint ist.
        id: 'belcanto', titel: 'Belcanto: Rossini, Bellini, Donizetti', art: 'merkmal', von: 'werke',
        werte: ['Gioachino Rossini', 'Vincenzo Bellini', 'Gaetano Donizetti'],
        merkmal: werk => [werk.composer],
    },
    {
        // Je ein Werk in jeder Sprache, in der der Katalog mindestens fünf
        // hat. Mehrsprachige Werke ("Deutsch/Englisch") zählen für jede.
        id: 'sprachen', titel: 'Oper in sechs Sprachen', art: 'merkmal', von: 'werke',
        werte: ['Italienisch', 'Deutsch', 'Französisch', 'Englisch', 'Russisch', 'Tschechisch'],
        merkmal: werk => String(werk.language || '').split('/'),
    },
    {
        // Je ein Werk aus jedem Jahrhundert der Operngeschichte, nach dem
        // Jahr der Entstehung: 1600–1699 ist das 17. Jahrhundert.
        id: 'jahrhunderte', titel: 'Fünf Jahrhunderte Oper', art: 'merkmal', von: 'werke',
        werte: ['17. Jahrhundert', '18. Jahrhundert', '19. Jahrhundert', '20. Jahrhundert', '21. Jahrhundert'],
        merkmal: werk => (werk.yearComposed ? [`${Math.floor(werk.yearComposed / 100) + 1}. Jahrhundert`] : []),
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
        // Die drei Festspielhäuser der Salzburger Festspiele.
        id: 'salzburg', titel: 'Die Salzburger Festspielhäuser', art: 'haeuser',
        mitglieder: ['grosses-festspielhaus', 'haus-fuer-mozart', 'felsenreitschule'],
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
    {
        id: 'bundeslaender', titel: 'Oper in allen 16 Bundesländern', art: 'merkmal', von: 'haeuser',
        werte: () => bundeslaender(),
        merkmal: haus => (haus.state && !KEIN_BUNDESLAND.has(haus.state) ? [haus.state] : []),
    },
];

/** Die Bundesländer, in denen der Katalog Häuser hat – alphabetisch. */
export function bundeslaender() {
    return [...new Set(operaHouses.map(h => h.state).filter(s => s && !KEIN_BUNDESLAND.has(s)))]
        .sort((a, b) => a.localeCompare(b, 'de'));
}

/** Die Werte eines Merkmals – fest oder, wie die Bundesländer, aus dem Katalog. */
export function merkmalWerte(sammlung) {
    return typeof sammlung.werte === 'function' ? sammlung.werte() : sammlung.werte;
}

function teile(sammlung) {
    if (sammlung.art === 'merkmal') return merkmalWerte(sammlung).map(w => ({ id: w, name: w }));
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
    const hat = { werke, haeuser };
    const katalog = { werke: operas, haeuser: operaHouses };
    // Bei einem Merkmal: welche Werte die gesehenen Werke oder Häuser haben.
    const erreicht = sammlung => new Set([...hat[sammlung.von]]
        .map(id => katalog[sammlung.von].find(e => e.id === id))
        .filter(Boolean)
        .flatMap(sammlung.merkmal));

    const stand = SAMMLUNGEN.map((sammlung) => {
        const da = sammlung.art === 'merkmal' ? erreicht(sammlung) : hat[sammlung.art];
        const liste = teile(sammlung).map(t => ({ ...t, erledigt: da.has(t.id) }));
        const erledigt = liste.filter(t => t.erledigt).length;
        return { sammlung, teile: liste, erledigt, gesamt: liste.length, vollstaendig: erledigt === liste.length };
    });

    const rang = s => (s.vollstaendig ? 1 : s.erledigt > 0 ? 0 : 2);
    return stand.sort((a, b) => rang(a) - rang(b)
        || (rang(a) === 0 ? b.erledigt / b.gesamt - a.erledigt / a.gesamt : 0)
        || (rang(a) === 2 ? a.gesamt - b.gesamt : 0));
}
