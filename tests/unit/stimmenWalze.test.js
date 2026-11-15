// Die Stimmen-Walze der Story (src/components/StimmenWalze.js): alle
// Stimmen der Spielzeit blitzen nacheinander auf, erst schnell, dann
// langsamer, bis die meistgehörte stehen bleibt (Jonas, 15.11.2026).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { stimmenWalze } from '../../src/components/StimmenWalze.js';

/** Namen, Beginn und Dauer jedes Eintrags der Walze. */
function lesen(html) {
    return [...html.matchAll(/<span class="story-walze__name([^"]*)" style="--beginn: ([0-9.]+)s(?:; --dauer: ([0-9.]+)s)?"([^>]*)>([^<]*)<\/span>/g)]
        .map(m => ({ ziel: m[1].includes('--ziel'), beginn: +m[2], dauer: m[3] ? +m[3] : null, verborgen: m[4].includes('aria-hidden'), name: m[5] }));
}

const namen = n => Array.from({ length: n }, (_, i) => `Stimme ${i}`);

test('ohne andere Namen keine Walze', () => {
    assert.equal(stimmenWalze([], 'Ulrike Schneider'), '');
    assert.equal(stimmenWalze(['Ulrike Schneider'], 'Ulrike Schneider'), '');
});

test('am Ende steht die meistgehörte Stimme, nur sie ist für Vorleser da', () => {
    const e = lesen(stimmenWalze(['A', 'B', 'Ulrike Schneider', 'C'], 'Ulrike Schneider'));
    assert.equal(e.at(-1).name, 'Ulrike Schneider');
    assert.equal(e.at(-1).ziel, true);
    assert.equal(e.at(-1).verborgen, false);
    assert.ok(e.slice(0, -1).every(x => !x.ziel && x.verborgen));
    // Vorher kommt sie nicht vor – die Walze soll bei ihr erst stehen bleiben.
    assert.ok(e.slice(0, -1).every(x => x.name !== 'Ulrike Schneider'));
});

test('erst schnell, dann langsamer – jedes Fenster länger als das vorige', () => {
    for (const n of [3, 5, 13, 80]) {
        const e = lesen(stimmenWalze(namen(n), 'Stimme 0'));
        const dauern = e.slice(0, -1).map(x => x.dauer);
        for (let i = 1; i < dauern.length; i++) assert.ok(dauern[i] > dauern[i - 1], `n=${n}, Fenster ${i}`);
        // Lückenlos: jedes Fenster beginnt, wo das vorige endet.
        for (let i = 1; i < e.length; i++) assert.ok(Math.abs(e[i].beginn - (e[i - 1].beginn + e[i - 1].dauer)) < 0.002, `n=${n}, Lücke vor ${i}`);
        // Höchstens 2,6 s, und kein Fenster kürzer als zwei Bilder.
        assert.ok(e.at(-1).beginn - e[0].beginn <= 2.6 + 1e-9, `n=${n} zu lang`);
        assert.ok(dauern[0] >= 0.03, `n=${n} erstes Fenster ${dauern[0]}`);
    }
});

test('viele Stimmen: eine Auswahl, jede höchstens einmal', () => {
    const e = lesen(stimmenWalze(namen(150), 'Stimme 0'));
    assert.equal(e.length, 24);
    const vorher = e.slice(0, -1).map(x => x.name);
    assert.equal(new Set(vorher).size, vorher.length);
});

test('wenige Stimmen: die Liste läuft mehrmals durch, nie zweimal derselbe Name hintereinander', () => {
    const e = lesen(stimmenWalze(['A', 'B', 'C', 'Top'], 'Top'));
    assert.equal(e.length, 13);
    for (let i = 1; i < e.length; i++) assert.notEqual(e[i].name, e[i - 1].name);
    // Bei wenigen Namen ist die Walze kürzer.
    const zwei = lesen(stimmenWalze(['A', 'Top'], 'Top'));
    assert.deepEqual(zwei.map(x => x.name), ['A', 'Top']);
    assert.ok(zwei[1].beginn - zwei[0].beginn < 1);
});

test('dieselbe Spielzeit, dieselbe Walze; Namen werden maskiert', () => {
    const liste = ['A', 'B', '<img src=x onerror=alert(1)>', 'Top'];
    assert.equal(stimmenWalze(liste, 'Top'), stimmenWalze(liste, 'Top'));
    assert.doesNotMatch(stimmenWalze(liste, 'Top'), /<img/);
});
