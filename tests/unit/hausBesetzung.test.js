// Besetzung je Vorstellung aus den Seiten der Häuser (Beta): das Werkzeug
// (tests/werkzeug/besetzung-lesen.mjs), die Datei im Repo und der Weg in den
// Vorschlag beim Loggen (src/data/hausBesetzung.js).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { hausAbend, ladeHausBesetzung, HAEUSER_MIT_BESETZUNG } from '../../src/data/hausBesetzung.js';
import { leipzigAbend, werkVerzeichnis, zusammenfuehren, titelSchluessel, semperAbende, komischeTermine, komischeBesetzung, komischeAbende, staatsoperAbende, deutscheAbende, frankfurtTermine, frankfurtAbend, LESER } from '../werkzeug/besetzung-lesen.mjs';
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
    assert.equal(await ladeHausBesetzung('hamburgische-staatsoper', { abruf: async () => { n++; } }), null);
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

// Komische Oper Berlin: die Stückseite mit den Terminen und das HTML, das
// /callbacks/get-cast-and-crew.json je Termin liefert (gekürzt).
const KOB_SEITE = `<div class="nextperformance "> <div class="nextperformance__top"> <div class="nextperformance__dayofweek">Sa</div> <div class="nextperformance__date">28. Nov <span class="--hide-phone-only">2026</span></div> <div class="nextperformance__time">19:30</div></div>
<a href="#" class="js-marker-get-cast-and-crew" data-performance-id="1390" data-baselink="/spielplan/a-z/madama-butterfly/1390/">Besetzung</a></div>
<div class="nextperformance "> <div class="nextperformance__date">3. Dez <span>2026</span></div> <div class="nextperformance__time">19:00</div>
<a href="#" data-performance-id="1391" data-baselink="/spielplan/a-z/madama-butterfly/1390/">Besetzung</a></div>`;
const kobCast = (tante) => `<div class="castcrew"><div class="castcrew__col castcrew__col--crew">
<div class="castcrew__item"> <div class="castcrew__role">Musikalische Leitung</div> <div class="castcrew__names"><a href="#" class="ci-26-0">Yi-Chen Lin</a></div> </div>
<div class="castcrew__item"> <div class="castcrew__role">Inszenierung</div> <div class="castcrew__names"><a href="#" class="ci-27-0">Andrea Breth</a></div> </div></div>
<div class="castcrew__col castcrew__col--cast">
<div class="castcrew__item"> <div class="castcrew__role">Pinkerton</div> <div class="castcrew__names"><a href="#" class="ci-30-0">Mihails Culpa&shy;jevs</a></div> </div>
<div class="castcrew__item"> <div class="castcrew__role">Tante</div> <div class="castcrew__names">${tante}</div> </div>
<div class="castcrew__item"> <div class="castcrew__role">Darsteller</div> <div class="castcrew__names"><a class="ci-49-0">Aya Yasuda</a>/<a class="ci-49-1">Jun Azuma</a></div> </div>
<div class="castcrew__item"> <div class="castcrew__role">Chor</div> <div class="castcrew__names"><a class="ci-50-0">Chorsolisten der Komischen Oper Berlin</a></div> </div></div></div>`;

test('Komische Oper: Termine der Stückseite, Besetzung je Termin, offene Rollen bleiben weg', () => {
    assert.deepEqual(komischeTermine(KOB_SEITE), [
        { datum: '2026-11-28', zeit: '19:30', id: '1390', baselink: '/spielplan/a-z/madama-butterfly/1390/' },
        { datum: '2026-12-03', zeit: '19:00', id: '1391', baselink: '/spielplan/a-z/madama-butterfly/1390/' },
    ]);
    const fest = komischeBesetzung(kobCast('<span class="ci-47-0">Sabine Hill</span>'));
    assert.deepEqual(fest.team.map(z => z.rolle), ['Musikalische Leitung', 'Inszenierung']);
    assert.deepEqual(fest.rollen.find(z => z.rolle === 'Pinkerton').namen, ['Mihails Culpajevs']);
    const offen = komischeBesetzung(kobCast('<span class="ci-47-0">Paula Rummel</span>/<span class="ci-47-1">Sabine Hill</span>'));
    const abende = komischeAbende([
        { datum: '2026-11-28', zeit: '19:30', ...fest },
        { datum: '2026-12-03', zeit: '19:00', ...offen },
    ]);
    const rollen = (i) => abende[i].abend.besetzung.map(b => `${b.rolle}: ${b.name}`);
    assert.deepEqual(rollen(0), ['Pinkerton: Mihails Culpajevs', 'Tante: Sabine Hill', 'Darsteller: Aya Yasuda', 'Darsteller: Jun Azuma']);
    // Am 3.12. steht die Tante noch nicht fest; die Darsteller sind immer mehrere.
    assert.deepEqual(rollen(1), ['Pinkerton: Mihails Culpajevs', 'Darsteller: Aya Yasuda', 'Darsteller: Jun Azuma']);
    assert.equal(abende[0].abend.dirigent, 'Yi-Chen Lin');
    assert.equal(abende[0].abend.regie, 'Andrea Breth');
});

// Staatsoper Berlin: ein Termin einer Stückseite (gekürzt).
const STAATSOPER = `<div class="tabs__panel js-tabs-panel flow u-mt--double" id="153939"> <div> <time itemprop="startDate"> Freitag, 28. Mai 2027 <br/>19.00 Uhr </time></div>
<div class="besetzung flow" id="besetzung-153939"> <h2>Besetzung</h2> <ul class="besetzung__liste u-mt"> <!-- Leitung &amp; Technik -->
<li class="besetzung__item"> <span class="besetzung__rolle">Musikalische Leitung:</span> <div class="besetzung__beteiligte-liste"> <div class="besetzung__beteiligte-liste-item"><a href="#"><span>Philippe Jordan</span></a> </div> </div> </li>
<li class="besetzung__item"> <span class="besetzung__rolle">Inszenierung:</span> <div class="besetzung__beteiligte-liste"> <div class="besetzung__beteiligte-liste-item"><a href="#"><span>Vasily Barkhatov</span></a> </div> </div> </li>
<li class="besetzung__item"> <span class="besetzung__rolle">Bühne:</span> <div class="besetzung__beteiligte-liste"> <div class="besetzung__beteiligte-liste-item"><a href="#"><span>Christian Schmidt</span></a> </div> </div> </li>
<!-- Künstler --> <li class="besetzung__item u-mt"> <span class="besetzung__rolle">Donna Leonora di Vargas:</span> <div class="besetzung__beteiligte-liste"> <div class="besetzung__beteiligte-liste-item"><a href="#"><span>Lise Davidsen</span></a> </div> </div> </li>
<li class="besetzung__item"> <span class="besetzung__rolle">Il Marchese di Calatrava, Padre Guardiano:</span> <div class="besetzung__beteiligte-liste"> <div class="besetzung__beteiligte-liste-item"><a href="#"><span>Roberto Tagliavini</span></a> </div> </div> </li>
<!-- Kollektive --> <li class="besetzung__item besetzung__item--single-column u-mt"> <ul class="besetzung__beteiligte-liste"> <li class="besetzung__beteiligte-liste-item"><a href="#"><span> Staatsopernchor</span></a>, </li> </ul> </li> </ul> </div></div>`;

test('Staatsoper Berlin: Termin mit Datum, Zeit, Leitung und Rollen; Bühnenbild und Chor nicht', () => {
    assert.deepEqual(staatsoperAbende(STAATSOPER), [{
        datum: '2027-05-28',
        abend: { zeit: '19:00', dirigent: 'Philippe Jordan', regie: 'Vasily Barkhatov', besetzung: [
            { rolle: 'Donna Leonora di Vargas', name: 'Lise Davidsen' },
            { rolle: 'Il Marchese di Calatrava, Padre Guardiano', name: 'Roberto Tagliavini' },
        ] },
    }]);
});

// Deutsche Oper Berlin: ein kommender Termin mit Datum, Leitung und Besetzung (gekürzt).
const DEUTSCHE = `<span id="furtherevent_17916341_detail" class="further-event"><div class="date_price"> <span class="date">Do  4.3.27, 19:30 </span></div></span>
<span id="staff-furtherevent_17916341" class="event-staff-span"><div class="ensemble"><div> <span class="person-role">Musikalische Leitung</span> <span class="person-names"><div class="person_wrapper"><a href="#" class="person-link">Alejo Pérez</a></div></span></div>
<div> <span class="person-role">Regie</span> <span class="person-names"><div class="person_wrapper"><a href="#" class="person-link">Ole Anders Tandberg</a></div></span></div></div></span>
<span id="ensemble-furtherevent_17916341" class="event-ensemble-span"><div class="ensemble"><div> <span class="person-role">Carmen</span> <span class="person-names"><div class="person_wrapper"><a href="#" class="person-link">Kristina Stanek</a></div></span></div>
<div> <span class="person-role">Drei Knaben</span> <span class="person-names"><div class="person_wrapper"><a href="#" class="person-link">Solisten des Tölzer Knabenchores</a></div></span></div></div></span>
<span id="staff-furtherevent_17916336" class="event-staff-span"><div> <span class="person-role">Musikalische Leitung</span> <span class="person-names"><div class="person_wrapper">Ohne Datum</div></span></div></span>`;

test('Deutsche Oper: nur Termine mit Datum, Chorsolisten sind keine Person', () => {
    assert.deepEqual(deutscheAbende(DEUTSCHE), [{
        datum: '2027-03-04',
        abend: { zeit: '19:30', dirigent: 'Alejo Pérez', regie: 'Ole Anders Tandberg', besetzung: [{ rolle: 'Carmen', name: 'Kristina Stanek' }] },
    }]);
});

// Oper Frankfurt: der Kalender der Stückseite und eine Terminseite (gekürzt).
const FRANKFURT_TERMIN = `<h2 class="section-header season-text">Ihre Auswahl</h2> <dl class="dl-list dl-horizontal"> <dt>Samstag</dt> <dd>22. Mai 2027</dd> <dt>Beginn</dt> <dd>18.00 Uhr</dd> </dl> </div> </section>
<section class="col-is-6 col-sm-12" id="castdata"> <div class="section-inner"> <h2>Besetzung</h2> <dl class="dl-list dl-horizontal"><dt>Musikalische Leitung</dt><dd>Pier&nbsp;Giorgio&nbsp;Morandi</dd><dt>Inszenierung</dt><dd>Lydia&nbsp;Steier</dd><dt>Kostüme</dt><dd>Siegfried&nbsp;Zoller</dd></dl>
<dl class="dl-list dl-horizontal"><dt>Aida</dt><dd><a href="#">Nombulelo&nbsp;Yende</a></dd><dt>Ramfis</dt><dd><a href="#">Andreas&nbsp;Bauer&nbsp;Kanabas</a>&nbsp;/ <a href="#">Kihwan&nbsp;Sim</a></dd><dt>Eine Priesterin</dt><dd><a href="#">Alina&nbsp;Avagyan</a><span class="deg">&deg;</span></dd></dl>
<p>Chor der Oper Frankfurt</p></div></section>`;

test('Oper Frankfurt: Termine aus dem Kalender, je Termin Leitung und Rollen, offene Rollen weg', () => {
    assert.deepEqual(frankfurtTermine('<a href="/de/spielplan/aida_3/?id_datum=4971#date">Sa<span>15.</span></a><a href="/de/spielplan/aida_3/?id_datum=4972#date">Sa</a><a href="?id_datum=4971">x</a>'), ['4971', '4972']);
    assert.deepEqual(frankfurtAbend(FRANKFURT_TERMIN), {
        datum: '2027-05-22',
        abend: { zeit: '18:00', dirigent: 'Pier Giorgio Morandi', regie: 'Lydia Steier', besetzung: [
            { rolle: 'Aida', name: 'Nombulelo Yende' },
            { rolle: 'Eine Priesterin', name: 'Alina Avagyan' },
        ] },
    });
    assert.equal(frankfurtAbend('<html>ohne Termin</html>'), null);
});
