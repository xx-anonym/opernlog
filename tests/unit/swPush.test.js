// Der Service Worker bei einer Push-Mitteilung: anzeigen und beim Tippen
// an die richtige Stelle führen.
//
// sw.js läuft als klassischer Worker und exportiert nichts. Deshalb wird die
// Datei hier in einer eigenen Umgebung ausgeführt, mit einem nachgebauten
// "self", und die Ereignisse werden von Hand ausgelöst.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const QUELLE = fs.readFileSync(new URL('../../sw.js', import.meta.url), 'utf8');
const URSPRUNG = 'https://opernlog.vercel.app';

function worker({ fenster = [] } = {}) {
    const zuhoerer = {};
    const log = { angezeigt: [], nachrichten: [], geoeffnet: [], fokussiert: 0 };
    const self = {
        location: new URL(`${URSPRUNG}/sw.js`),
        registration: {
            scope: `${URSPRUNG}/`,
            showNotification: async (titel, optionen) => { log.angezeigt.push({ titel, ...optionen }); },
        },
        clients: {
            matchAll: async () => fenster.map(url => ({
                url,
                postMessage: (n) => log.nachrichten.push(n),
                focus: async () => { log.fokussiert++; },
            })),
            openWindow: async (url) => { log.geoeffnet.push(url); },
            claim: () => {},
        },
        addEventListener: (art, f) => { zuhoerer[art] = f; },
        skipWaiting: () => {},
    };
    vm.runInNewContext(QUELLE, { self, caches: {}, console, URL, fetch: () => {}, Response: class {} });

    async function ausloesen(art, ereignis) {
        let warten;
        zuhoerer[art]({ ...ereignis, waitUntil: (p) => { warten = p; } });
        await warten;
    }
    return { log, ausloesen };
}

const nachricht = (daten) => ({ data: { json: () => daten, text: () => JSON.stringify(daten) } });

test('eine Mitteilung erscheint mit Titel, Text und Ziel', async () => {
    const w = worker();
    await w.ausloesen('push', nachricht({ titel: 'Neuer Kommentar', text: 'UweM: Brava!', url: '#/visit/abc', tag: 'kommentar-abc' }));
    assert.equal(w.log.angezeigt.length, 1);
    const m = w.log.angezeigt[0];
    assert.equal(m.titel, 'Neuer Kommentar');
    assert.equal(m.body, 'UweM: Brava!');
    assert.equal(m.tag, 'kommentar-abc');
    assert.equal(m.data.url, '#/visit/abc');
    assert.match(m.icon, /icon-any-192\.png$/);
});

test('eine kaputte Nachricht zeigt trotzdem etwas an', async () => {
    // Safari entzieht einer Seite das Recht auf Push, wenn sie auf eine
    // Mitteilung hin nichts anzeigt.
    const w = worker();
    await w.ausloesen('push', { data: { json: () => { throw new Error('kein JSON'); }, text: () => 'roh' } });
    assert.equal(w.log.angezeigt[0].titel, 'OpernLog');
    assert.equal(w.log.angezeigt[0].body, 'roh');
    await w.ausloesen('push', { data: null });
    assert.equal(w.log.angezeigt[1].titel, 'OpernLog');
});

test('ein fremdes Ziel führt zur Startseite', async () => {
    const w = worker();
    await w.ausloesen('push', nachricht({ titel: 'x', url: 'https://evil.example/' }));
    assert.equal(w.log.angezeigt[0].data.url, '#/');
});

const tippen = (url) => ({ notification: { data: { url }, close() {} } });

test('ist die App offen, wechselt sie beim Tippen dorthin', async () => {
    const w = worker({ fenster: [`${URSPRUNG}/#/diary`] });
    await w.ausloesen('notificationclick', tippen('#/visit/abc'));
    // Das Objekt stammt aus der Umgebung des Workers – verglichen wird der Inhalt.
    assert.equal(JSON.stringify(w.log.nachrichten), JSON.stringify([{ typ: 'oeffne', url: '#/visit/abc' }]));
    assert.equal(w.log.fokussiert, 1);
    assert.deepEqual(w.log.geoeffnet, []);
});

test('ist sie zu, öffnet sie sich an der Stelle', async () => {
    const w = worker();
    await w.ausloesen('notificationclick', tippen('#/season'));
    assert.deepEqual(w.log.geoeffnet, [`${URSPRUNG}/#/season`]);
});

test('ein fremdes Ziel wird auch beim Tippen nicht geöffnet', async () => {
    const w = worker();
    await w.ausloesen('notificationclick', tippen('javascript:alert(1)'));
    assert.deepEqual(w.log.geoeffnet, [`${URSPRUNG}/#/`]);
});
