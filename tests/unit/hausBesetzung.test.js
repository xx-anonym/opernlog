// Besetzung je Vorstellung aus den Seiten der Häuser (Beta): das Werkzeug
// (tests/werkzeug/besetzung-lesen.mjs), die Datei im Repo und der Weg in den
// Vorschlag beim Loggen (src/data/hausBesetzung.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { hausAbend, ladeHausBesetzung, HAEUSER_MIT_BESETZUNG } from '../../src/data/hausBesetzung.js';
import { leipzigAbend, werkVerzeichnis, zusammenfuehren, titelSchluessel, semperAbende, LESER } from '../werkzeug/besetzung-lesen.mjs';
import { operas } from '../../src/data/operas.js';

const person = (first_name, last_name) => ({ first_name, last_name });
const EREIGNIS = {
    title: 'Eugen Onegin', writer: 'Peter I. Tschaikowski', start: '2026-11-28T19:00:00+01:00',
    productionteam_objs: [
        { role_obj: { name: 'Musikalische Leitung' }, persons_objs: [person('Ivan', 'Repušić')] },
        { role_obj: { name: 'Inszenierung' }, persons_objs: [person('Vasily', 'Barkhatov')] },
        { role_obj: { name: 'Bühne' }, persons_objs: [person('Zinovy', 'Margolin')] },
    ],
    cast_objs: [
        { role_obj: { name: 'Tatjana' }, persons_objs: [person('Olesya', 'Golovneva')] },
        // Chor und Orchester stehen ohne Vornamen da – keine Einzelperson.
        { role_obj: { name: 'Chor' }, persons_objs: [{ first_name: null, last_name: 'Chor der Oper Leipzig' }] },
    ],
};

test('eine Vorstellung der Oper Leipzig: Werk, Datum, Zeit, Dirigat, Regie, Einzelpersonen der Besetzung', () => {
    const v = werkVerzeichnis();
    assert.deepEqual(leipzigAbend(EREIGNIS, v), {
        schluessel: 'eugen-onegin|2026-11-28',
        abend: { zeit: '19:00', dirigent: 'Ivan Repušić', regie: 'Vasily Barkhatov', besetzung: [{ rolle: 'Tatjana', name: 'Olesya Golovneva' }] },
    });
    // Unbekannter Titel oder fremder Komponist: nichts.
    assert.equal(leipzigAbend({ ...EREIGNIS, title: 'Kostprobe' }, v), null);
    assert.equal(leipzigAbend({ ...EREIGNIS, title: 'Carmen', writer: 'Ballett von Mats Ek' }, v), null);
    assert.equal(titelSchluessel('Così fan tutte'), 'cosi fan tutte');
});

test('Gelesenes bleibt stehen, bis es älter als 400 Tage ist – geloggt wird hinterher', () => {
    const alt = { 'tosca|2025-09-01': { zeit: '19:00' }, 'tosca|2026-10-01': { zeit: '19:00' } };
    const neu = { 'tosca|2026-12-01': { zeit: '18:00' }, 'tosca|2026-10-01': { zeit: '19:30' } };
    assert.deepEqual(Object.keys(zusammenfuehren(alt, neu, '2026-11-23')), ['tosca|2026-10-01', 'tosca|2026-12-01']);
    assert.equal(zusammenfuehren(alt, neu, '2026-11-23')['tosca|2026-10-01'].zeit, '19:30');
});

test('der Abend in der Form eines Besuchs, für mitwirkendeVorschlag', () => {
    const daten = { abende: { 'eugen-onegin|2026-11-28': { dirigent: 'Ivan Repušić', regie: '', besetzung: [{ rolle: 'Tatjana', name: 'Olesya Golovneva' }, { rolle: '', name: 'Ohne Rolle' }] } } };
    assert.deepEqual(hausAbend(daten, 'eugen-onegin', '2026-11-28'), {
        conductor: 'Ivan Repušić', director: '', castList: 'Olesya Golovneva (Tatjana)\nOhne Rolle',
    });
    assert.equal(hausAbend(daten, 'eugen-onegin', '2026-11-29'), null);
    assert.equal(hausAbend(null, 'eugen-onegin', '2026-11-28'), null);
});

test('nur Häuser mit Datei werden gefragt; ohne Netz kommt null und beim nächsten Mal ein neuer Versuch', async () => {
    let n = 0;
    assert.equal(await ladeHausBesetzung('oper-frankfurt', { abruf: async () => { n++; } }), null);
    assert.equal(n, 0);
    assert.equal(await ladeHausBesetzung('oper-leipzig', { abruf: async () => { n++; throw new Error('offline'); } }), null);
    const d = await ladeHausBesetzung('oper-leipzig', { abruf: async () => { n++; return { ok: true, json: async () => ({ abende: {} }) }; } });
    assert.deepEqual(d, { abende: {} });
    assert.equal(n, 2);
});

test('die Datei im Repo passt: jedes Haus hat eine, jeder Abend gehört zu einem Werk, mit gültigem Datum', () => {
    // Werke aus dem Repo und aus der Datenbank (die haben einen Werktext).
    const ids = new Set([...operas.map(o => o.id), ...fs.readdirSync(new URL('../../daten/werke/', import.meta.url)).map(f => f.replace(/\.json$/, ''))]);
    for (const haus of HAEUSER_MIT_BESETZUNG) {
        const d = JSON.parse(fs.readFileSync(new URL(`../../daten/besetzung/${haus}.json`, import.meta.url), 'utf8'));
        assert.equal(d.haus, haus);
        assert.ok(Object.keys(d.abende).length > 0);
        for (const [s, a] of Object.entries(d.abende)) {
            const [werk, datum] = s.split('|');
            assert.ok(ids.has(werk), `${haus}: ${werk}`);
            assert.match(datum, /^\d{4}-\d{2}-\d{2}$/);
            assert.ok(a.dirigent || a.regie || a.besetzung?.length, s);
            for (const p of a.besetzung || []) assert.ok(p.name && !/[<>]/.test(p.name + p.rolle), s);
        }
    }
});

// Ein Termin, wie er auf einer Stückseite der Semperoper steht (gekürzt).
const SEMPER = `<div class="accordion-item ni-event-item pt-3 pb-3 ni-past-event"><time class="sr-only" datetime="2026-09-02T19:00:00">2. September 2026, 19&nbsp;Uhr</time>
<div class="ni-cast-section ni-cast-it"><ul><li><span class="ni-cast-item-label ni-genre-color"> Musikalische Leitung&nbsp;</span><span class="person_link ni-cast-item-link"><a href="#">Lorenzo Passerini</a></span></li>
<li><span class="ni-cast-item-label ni-genre-color"> Inszenierung&nbsp;</span><span class="person_link ni-cast-item-link"><a href="#">Nadja Loschky</a></span></li>
<li><span class="ni-cast-item-label ni-genre-color"> Dramaturgie&nbsp;</span><span class="person_link ni-cast-item-link"><a href="#">Yvonne Gebauer</a></span><span class="ni-person-name">, </span><span class="person_link ni-cast-item-link"><a href="#">Benedikt Stampfli</a></span></li></ul>
<div class="ni-cast-additional"><div><span class="ni-cast-item-link"> Sächsische Staatskapelle Dresden </span></div></div></div>
<div class="ni-cast-section ni-cast-stars"><ul><li><span class="ni-cast-item-label ni-genre-color"> Don José&nbsp;</span><span class="person_link ni-cast-item-link"><a href="#">Matthew Polenzani</a></span></li>
<li><span class="ni-cast-item-label ni-genre-color"> Micaëla&nbsp;</span><span class="person_link ni-cast-item-link"><a href="#">Marjukka Tepponen</a></span></li></ul></div></div>
<div class="accordion-item ni-event-item pt-3 pb-3"><time datetime="2026-09-19T18:00:00">19. September</time>
<div class="ni-cast-section ni-cast-stars"><ul><li><span class="ni-cast-item-label ni-genre-color"> Don José&nbsp;</span><span class="ni-cast-item-link">Tomislav Mu&#382;ek</span></li></ul></div></div>`;

test('Semperoper: je Termin Datum, Zeit, Dirigat, Regie und Besetzung; Orchester und Dramaturgie nicht', () => {
    assert.deepEqual(semperAbende(SEMPER), [
        { datum: '2026-09-02', abend: { zeit: '19:00', dirigent: 'Lorenzo Passerini', regie: 'Nadja Loschky',
            besetzung: [{ rolle: 'Don José', name: 'Matthew Polenzani' }, { rolle: 'Micaëla', name: 'Marjukka Tepponen' }] } },
        // Ohne Leitungsteam, Name ohne Link, Zeichen als Entität.
        { datum: '2026-09-19', abend: { zeit: '18:00', besetzung: [{ rolle: 'Don José', name: 'Tomislav Mužek' }] } },
    ]);
    assert.deepEqual(semperAbende('<html>keine Termine</html>'), []);
});

test('jedes Haus mit Leser steht in der App, und umgekehrt', () => {
    assert.deepEqual(Object.keys(LESER).sort(), [...HAEUSER_MIT_BESETZUNG].sort());
});
