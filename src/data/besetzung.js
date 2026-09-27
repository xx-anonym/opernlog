// Die Besetzung eines Abends als Personen statt als Text.
//
// Gespeichert wird sie weiter als Freitext (visits.cast_list), eine Person je
// Zeile, so wie das Formular es seit jeher vorgibt: "Anna Netrebko (Tosca)".
// Hier wird daraus eine Liste von Namen und Rollen – für die Personenseite
// (alle eigenen Abende mit jemandem), die meistgehörten Stimmen im
// Saisonrückblick und die Namensvorschläge beim Loggen.
//
// Kein eigenes Feld in der Datenbank: jeder bisherige Eintrag folgt der
// Konvention schon (27.09.2026: der einzige mit Besetzung tut es), und Text
// bleibt lesbar, auch wo die App ihn nicht auswertet – im Datenexport, in der
// Suche des Tagebuchs.
//
// Dirigent und Regie stehen in eigenen Feldern und zählen auf der
// Personenseite mit: wer einmal dirigiert und einmal singt, ist eine Person.

import { visitCredits } from '../utils.js';

/**
 * Die Zeilen einer Besetzung als [{ name, rolle, form }].
 *
 * Verstanden werden "Name (Rolle)" – die Form, die das Formular vorgibt – und
 * "Rolle: Name". Alles andere gilt ganz als Name. Eine Klammer mitten im
 * Text bleibt beim Namen; nur eine am Zeilenende ist die Rolle. form sagt,
 * wie die Zeile geschrieben war ('klammer', 'doppelpunkt', 'name') – die
 * Karte zeigt sie so, wie sie eingetragen wurde.
 */
export function besetzungLesen(castList) {
    return String(castList ?? '')
        .split('\n')
        .map(z => z.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .map((zeile) => {
            const klammer = zeile.match(/^(.+?)\s*\(([^()]+)\)$/);
            if (klammer) return { name: klammer[1].trim(), rolle: klammer[2].trim(), form: 'klammer' };
            const doppelpunkt = zeile.match(/^([^:]{1,40}):\s*(.+)$/);
            if (doppelpunkt) return { name: doppelpunkt[2].trim(), rolle: doppelpunkt[1].trim(), form: 'doppelpunkt' };
            return { name: zeile, rolle: '', form: 'name' };
        })
        .filter(p => p.name);
}

/**
 * Woran eine Person wiedererkannt wird: der Name ohne Unterschied in Groß-
 * und Kleinschreibung und Leerraum. Akzente zählen – "Villalón" und
 * "Villalon" sind zwei Schreibweisen, gegen die die Namensvorschläge helfen.
 */
export function personSchluessel(name) {
    return String(name ?? '').normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('de');
}

/** Die Adresse der Personenseite. */
export function personAdresse(name) {
    return `#/person/${encodeURIComponent(String(name ?? '').replace(/\s+/g, ' ').trim())}`;
}

/**
 * Alle Personen dieser Abende, je mit ihren Abenden und was sie dort waren.
 *
 * @returns {Map<string, {name: string, abende: {visit: object, als: string[]}[]}>}
 *          Schlüssel personSchluessel(); name ist die häufigste Schreibweise
 *          (bei Gleichstand die mit mehr Großbuchstaben);
 *          als enthält Rollen sowie "Dirigat" und "Regie".
 */
export function personen(besuche) {
    const alle = new Map();
    const schreibweisen = new Map();
    const eintragen = (name, visit, als) => {
        const schluessel = personSchluessel(name);
        if (!schluessel) return;
        if (!alle.has(schluessel)) { alle.set(schluessel, { name, abende: [] }); schreibweisen.set(schluessel, new Map()); }
        const zaehler = schreibweisen.get(schluessel);
        zaehler.set(name, (zaehler.get(name) || 0) + 1);
        const person = alle.get(schluessel);
        let abend = person.abende.find(a => a.visit === visit);
        if (!abend) { abend = { visit, als: [] }; person.abende.push(abend); }
        if (als && !abend.als.includes(als)) abend.als.push(als);
    };
    for (const visit of besuche || []) {
        const c = visitCredits(visit);
        if (c.conductor) eintragen(c.conductor.replace(/\s+/g, ' ').trim(), visit, 'Dirigat');
        if (c.director) eintragen(c.director.replace(/\s+/g, ' ').trim(), visit, 'Regie');
        for (const { name, rolle } of besetzungLesen(c.castList)) eintragen(name, visit, rolle);
    }
    // Bei Gleichstand gewinnt die Schreibweise mit mehr Großbuchstaben:
    // "ben bliss" ist eher schnell getippt als so gemeint.
    const grosse = t => (t.match(/\p{Lu}/gu) || []).length;
    for (const [schluessel, person] of alle) {
        person.name = [...schreibweisen.get(schluessel).entries()]
            .sort((a, b) => (b[1] - a[1]) || (grosse(b[0]) - grosse(a[0])))[0][0];
    }
    return alle;
}

/**
 * Die meistgehörten Stimmen: wer in den meisten dieser Abende auf der Bühne
 * stand – nur Besetzung, ohne Dirigat und Regie. Erst ab zwei Abenden: bei
 * einem Abend mit sechs Namen wäre jeder "der meistgehörte".
 *
 * @returns {{name: string, anzahl: number, rollen: string[]}[]} höchstens n
 */
export function meistgehoerteStimmen(besuche, n = 3) {
    const buehne = (besuche || []).map(v => ({ ...v, conductor: '', director: '' }));
    return [...personen(buehne).values()]
        .map(p => ({
            name: p.name,
            anzahl: p.abende.length,
            rollen: [...new Set(p.abende.flatMap(a => a.als).filter(Boolean))],
        }))
        .filter(p => p.anzahl >= 2)
        .sort((a, b) => (b.anzahl - a.anzahl) || a.name.localeCompare(b.name, 'de'))
        .slice(0, n);
}

/**
 * Namen für die Vorschläge beim Loggen: jede Person aus der Besetzung der
 * eigenen Abende einmal, in ihrer häufigsten Schreibweise, die häufigsten
 * zuerst.
 */
export function besetzungsNamen(besuche) {
    const buehne = (besuche || []).map(v => ({ ...v, conductor: '', director: '' }));
    return [...personen(buehne).values()]
        .map(p => ({ name: p.name, anzahl: p.abende.length }))
        .sort((a, b) => (b.anzahl - a.anzahl) || a.name.localeCompare(b.name, 'de'));
}

/**
 * Die Zeile, in der die Schreibmarke steht, und wie weit der Name darin
 * reicht – für die Vorschläge im Textfeld der Besetzung.
 *
 * @returns {{anfang: number, ende: number, name: string, rest: string}}
 *          anfang/ende: Grenzen der Zeile im ganzen Text; name: was vor einer
 *          Rolle in Klammern steht; rest: die Klammer samt Leerraum davor
 */
export function zeileAnMarke(text, marke) {
    const anfang = text.lastIndexOf('\n', Math.max(0, marke - 1)) + 1;
    const umbruch = text.indexOf('\n', marke);
    const ende = umbruch === -1 ? text.length : umbruch;
    const zeile = text.slice(anfang, ende);
    const klammer = zeile.search(/\s*\(/);
    return klammer === -1
        ? { anfang, ende, name: zeile.trim(), rest: '' }
        : { anfang, ende, name: zeile.slice(0, klammer).trim(), rest: zeile.slice(klammer) };
}
