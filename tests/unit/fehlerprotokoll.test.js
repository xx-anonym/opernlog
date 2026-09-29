// Das Fehlerprotokoll (src/fehlerprotokoll.js): was gemeldet wird, was nicht,
// und dass nichts Persönliches mitgeht.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { fehlerEintrag, seiteAus, stelleAus, fehlerprotokollEinrichten, HOECHSTENS } from '../../src/fehlerprotokoll.js';
import { VERSION } from '../../src/version.js';

test('von der Adresse bleibt nur die Seite, keine Kennung', () => {
    assert.equal(seiteAus('#/profile/11111111-2222-3333-4444-555555555555'), 'profile');
    assert.equal(seiteAus('#/opera/tosca?von=wunschliste'), 'opera');
    assert.equal(seiteAus('#/'), 'home');
    assert.equal(seiteAus(''), 'home');
});

test('die Stelle im Code ohne die Adresse der Seite', () => {
    assert.equal(stelleAus('https://opernlog.vercel.app/src/pages/Profile.js', 12, 5, 'https://opernlog.vercel.app'), '/src/pages/Profile.js:12:5');
    assert.equal(stelleAus('', 1, 1, 'https://x'), '');
});

test('eine Zeile trägt Version, Seite, Meldung, Stelle, Gerät und Anmeldung – gekürzt', () => {
    const e = fehlerEintrag({ meldung: 'x'.repeat(900), stelle: '/src/a.js:1:2', hash: '#/diary', geraet: 'iPhone', angemeldet: true });
    assert.deepEqual(Object.keys(e).sort(), ['angemeldet', 'geraet', 'meldung', 'seite', 'stelle', 'version']);
    assert.equal(e.version, VERSION);
    assert.equal(e.seite, 'diary');
    assert.equal(e.meldung.length, 500);
    assert.equal(e.angemeldet, true);
});

test('Rauschen von Browser und Erweiterungen wird nicht gemeldet', () => {
    assert.equal(fehlerEintrag({ meldung: 'ResizeObserver loop completed with undelivered notifications.' }), null);
    assert.equal(fehlerEintrag({ meldung: 'Script error.' }), null);
    assert.equal(fehlerEintrag({ meldung: 'kaputt', stelle: 'chrome-extension://abc/inject.js:1:1' }), null);
    assert.equal(fehlerEintrag({ meldung: '' }), null);
});

function fenster() {
    const ziel = new EventTarget();
    ziel.location = { origin: 'https://opernlog.vercel.app', hash: '#/opera/tosca' };
    ziel.navigator = { userAgent: 'Testbrowser' };
    return ziel;
}
const fehlerEreignis = (meldung, datei = 'https://opernlog.vercel.app/src/main.js', zeile = 3) =>
    Object.assign(new Event('error'), { message: meldung, filename: datei, lineno: zeile, colno: 7 });
const warten = () => new Promise(r => setTimeout(r, 0));

test('jeder Fehler einmal, höchstens fünf verschiedene je Seitenaufruf', async () => {
    const umgebung = fenster();
    const gesendet = [];
    fehlerprotokollEinrichten({ senden: async e => { gesendet.push(e); }, umgebung, angemeldet: () => true });
    for (let i = 0; i < 3; i++) umgebung.dispatchEvent(fehlerEreignis('immer derselbe'));
    for (let i = 0; i < 10; i++) umgebung.dispatchEvent(fehlerEreignis(`Fehler ${i}`));
    await warten();
    assert.equal(gesendet.length, HOECHSTENS);
    assert.equal(gesendet.filter(e => e.meldung === 'immer derselbe').length, 1);
    assert.deepEqual({ seite: gesendet[0].seite, stelle: gesendet[0].stelle, geraet: gesendet[0].geraet, angemeldet: gesendet[0].angemeldet },
        { seite: 'opera', stelle: '/src/main.js:3:7', geraet: 'Testbrowser', angemeldet: true });
});

test('ein abgelehntes Versprechen wird mit der Stelle aus dem Stapel gemeldet', async () => {
    const umgebung = fenster();
    const gesendet = [];
    fehlerprotokollEinrichten({ senden: async e => { gesendet.push(e); }, umgebung });
    const grund = new Error('Netz weg');
    grund.stack = 'Error: Netz weg\n    at laden (https://opernlog.vercel.app/src/store/store.js:120:15)\n    at async x';
    umgebung.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: grund }));
    // Safari schreibt den Stapel anders: funktion@adresse:zeile:spalte
    const safari = new Error('Safari');
    safari.stack = 'laden@https://opernlog.vercel.app/src/pages/Home.js:40:9\nglobal code@';
    umgebung.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: safari }));
    await warten();
    assert.deepEqual(gesendet.map(e => [e.meldung, e.stelle]), [
        ['Netz weg', '/src/store/store.js:120:15'],
        ['Safari', '/src/pages/Home.js:40:9'],
    ]);
});

test('scheitert das Melden, bleibt es still', async () => {
    const umgebung = fenster();
    fehlerprotokollEinrichten({ senden: async () => { throw new Error('offline'); }, umgebung });
    umgebung.dispatchEvent(fehlerEreignis('egal'));
    await warten();
    // Kein unbehandeltes Versprechen: der Testläufer würde sonst abbrechen.
});
