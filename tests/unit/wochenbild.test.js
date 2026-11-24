// Das Wochenbild (tests/werkzeug/wochenbild.mjs): welche Woche, was darin neu
// ist, was aufs Bild kommt und der Text dazu. Gerendert wird hier nichts.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { wochenbeginn, neuInDerWoche, fuersBild, begleittext, zeitraum, wochenseite } from '../werkzeug/wochenbild.mjs';

const WERKE = [{ id: 'tosca', title: 'Tosca' }, { id: 'aida', title: 'Aida' }];
const HAEUSER = [
    { id: 'gross', name: 'Großes Haus', city: 'Berlin', capacity: 1800 },
    { id: 'klein', name: 'Theater Kleinstadt', city: 'Kleinstadt', capacity: 400 },
];

test('die Woche beginnt am nächsten Montag, montags an diesem', () => {
    assert.equal(wochenbeginn('2026-11-30'), '2026-11-30');   // Montag
    assert.equal(wochenbeginn('2026-11-24'), '2026-11-30');   // Dienstag
    assert.equal(wochenbeginn('2026-11-29'), '2026-11-30');   // Sonntag
    assert.equal(zeitraum('2026-11-30'), '30.11.–6.12.2026');
});

test('neu ist eine Produktion, deren erster bekannter Termin in die Woche fällt', () => {
    const plan = [
        { werk: 'tosca', haus: 'gross', url: 'u1', termine: ['2026-12-12', '2026-12-05'], zeiten: { '2026-12-05': '19:00' } },
        { werk: 'aida', haus: 'klein', url: 'u2', termine: ['2026-10-01', '2026-12-02'] },           // läuft schon
        { werk: 'aida', haus: 'gross', url: 'u3', termine: ['2026-12-01'] },
        { werk: 'unbekannt', haus: 'gross', url: 'u4', termine: ['2026-12-01'] },                     // nicht im Katalog
    ];
    const liste = neuInDerWoche('2026-11-30', { plan, werke: WERKE, haeuser: HAEUSER });
    assert.deepEqual(liste.map(x => `${x.werk.id}@${x.haus.id} ${x.datum} ${x.zeit}`), ['aida@gross 2026-12-01 null', 'tosca@gross 2026-12-05 19:00']);
});

test('aufs Bild die größten Häuser, dann nach Datum; der Text nennt alle', () => {
    const liste = [
        { werk: WERKE[0], haus: HAEUSER[1], datum: '2026-12-01', url: 'a' },
        { werk: WERKE[1], haus: HAEUSER[0], datum: '2026-12-03', url: 'b' },
        { werk: WERKE[0], haus: HAEUSER[0], datum: '2026-12-02', url: 'c' },
    ];
    assert.deepEqual(fuersBild(liste, 2).map(x => x.url), ['c', 'b']);
    const text = begleittext('2026-11-30', liste);
    assert.match(text, /^Neu auf den Opernbühnen, 30\.11\.–6\.12\.2026/);
    // Steht die Stadt schon im Namen, nicht noch einmal.
    assert.match(text, /Di 1\.12\. Tosca – Theater Kleinstadt\n/);
    assert.match(text, /Do 3\.12\. Aida – Großes Haus, Berlin/);
    assert.match(text, /opernlog\.de/);
    const html = wochenseite('2026-11-30', liste, text);
    assert.match(html, /<meta name="robots" content="noindex">/);
    assert.equal((html.match(/class="karten"/g) || []).length, 3);
});
