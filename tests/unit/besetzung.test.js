// Die Besetzung als Personen (src/data/besetzung.js): Zeilen lesen, Personen
// wiedererkennen, meistgehörte Stimmen, die Zeile an der Schreibmarke.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    besetzungLesen, personSchluessel, personAdresse, personen, meistgehoerteStimmen, besetzungsNamen, zeileAnMarke,
} from '../../src/data/besetzung.js';

test('"Name (Rolle)", "Rolle: Name" und ein Name allein', () => {
    assert.deepEqual(besetzungLesen('Ben Bliss (Herzog von Mantua)\nTosca: Anna Netrebko\n  Staatskapelle   Berlin  \n\n'), [
        { name: 'Ben Bliss', rolle: 'Herzog von Mantua', form: 'klammer' },
        { name: 'Anna Netrebko', rolle: 'Tosca', form: 'doppelpunkt' },
        { name: 'Staatskapelle Berlin', rolle: '', form: 'name' },
    ]);
});

test('nur eine Klammer am Zeilenende ist die Rolle', () => {
    assert.deepEqual(besetzungLesen('Chor (Extrachor) der Oper'), [{ name: 'Chor (Extrachor) der Oper', rolle: '', form: 'name' }]);
    assert.deepEqual(besetzungLesen(''), []);
    assert.deepEqual(besetzungLesen(null), []);
});

test('eine Person ist dieselbe ohne Unterschied in Groß- und Kleinschreibung und Leerraum', () => {
    assert.equal(personSchluessel(' Anna  NETREBKO '), personSchluessel('Anna Netrebko'));
    // Akzente zählen: dagegen helfen die Vorschläge beim Loggen.
    assert.notEqual(personSchluessel('Elena Villalón'), personSchluessel('Elena Villalon'));
    assert.equal(personAdresse('Anna  Netrebko'), '#/person/Anna%20Netrebko');
    assert.equal(personAdresse('AC/DC'), '#/person/AC%2FDC');
});

const A = { id: 'a', date: '2026-09-11', operaId: 'rigoletto', conductor: 'Domingo Hindoyan', director: 'Bartlett Sher',
    castList: 'Ben Bliss (Herzog von Mantua)\nSimon Keenlyside (Rigoletto)' };
const B = { id: 'b', date: '2026-10-02', operaId: 'macbeth', conductor: 'Simon Keenlyside',
    cast_list: 'simon keenlyside (Macbeth)\nAnna Netrebko (Lady Macbeth)' };
const C = { id: 'c', date: '2026-11-20', operaId: 'tosca', castList: 'Tosca: Anna Netrebko\nBen Bliss (Cavaradossi)' };

test('personen: je Person ihre Abende und was sie dort war, auch am Pult und in der Regie', () => {
    const p = personen([A, B, C]);
    const simon = p.get(personSchluessel('Simon Keenlyside'));
    assert.equal(simon.name, 'Simon Keenlyside');
    assert.deepEqual(simon.abende.map(a => [a.visit.id, a.als]), [['a', ['Rigoletto']], ['b', ['Dirigat', 'Macbeth']]]);
    assert.deepEqual(p.get(personSchluessel('Bartlett Sher')).abende.map(a => a.als), [['Regie']]);
    assert.deepEqual(p.get(personSchluessel('Anna Netrebko')).abende.map(a => a.als), [['Lady Macbeth'], ['Tosca']]);
});

test('die häufigste Schreibweise gibt den Namen, bei Gleichstand die mit Großbuchstaben', () => {
    const p = personen([{ id: 1, castList: 'anna netrebko' }, { id: 2, castList: 'Anna Netrebko' }, { id: 3, castList: 'Anna Netrebko' }]);
    assert.equal(p.get(personSchluessel('ANNA NETREBKO')).name, 'Anna Netrebko');
    // Gleichstand, die kleingeschriebene zuerst: trotzdem die richtige.
    const q = personen([{ id: 1, castList: 'ben bliss' }, { id: 2, castList: 'Ben Bliss' }]);
    assert.equal(q.get(personSchluessel('Ben Bliss')).name, 'Ben Bliss');
});

test('meistgehörte Stimmen: nur Besetzung, erst ab zwei Abenden, die meisten zuerst', () => {
    assert.deepEqual(meistgehoerteStimmen([A, B, C]), [
        { name: 'Anna Netrebko', anzahl: 2, rollen: ['Lady Macbeth', 'Tosca'] },
        { name: 'Ben Bliss', anzahl: 2, rollen: ['Herzog von Mantua', 'Cavaradossi'] },
        { name: 'Simon Keenlyside', anzahl: 2, rollen: ['Rigoletto', 'Macbeth'] },
    ]);
    // Ein einziger Abend: niemand ist "meistgehört".
    assert.deepEqual(meistgehoerteStimmen([A]), []);
    // Dirigat zählt nicht als Stimme.
    assert.deepEqual(meistgehoerteStimmen([A, { id: 'd', conductor: 'Domingo Hindoyan' }]), []);
});

test('Namen für die Vorschläge: jede Person einmal, die häufigsten zuerst, ohne Pult und Regie', () => {
    const namen = besetzungsNamen([A, B, C]).map(n => n.name);
    assert.deepEqual(namen.slice(0, 3), ['Anna Netrebko', 'Ben Bliss', 'Simon Keenlyside']);
    assert.ok(!namen.includes('Domingo Hindoyan'));
    assert.ok(!namen.includes('Bartlett Sher'));
});

test('die Zeile an der Schreibmarke, mit dem Namen vor einer Rolle', () => {
    const text = 'Ben Bliss (Herzog)\nAnna Net (Tosca)\nSim';
    assert.deepEqual(zeileAnMarke(text, text.indexOf('Net') + 3), { anfang: 19, ende: 35, name: 'Anna Net', rest: ' (Tosca)' });
    assert.deepEqual(zeileAnMarke(text, text.length), { anfang: 36, ende: 39, name: 'Sim', rest: '' });
    assert.deepEqual(zeileAnMarke('', 0), { anfang: 0, ende: 0, name: '', rest: '' });
});
