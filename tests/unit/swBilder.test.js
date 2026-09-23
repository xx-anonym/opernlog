// Der Service Worker und die Bilder von Wikimedia.
//
// Anlass: Die Bilder kamen als opaque Responses in den Cache, und Chrome
// rechnet jede davon mit rund 7 MB an. Nach gut 120 Bildern war das
// Kontingent voll; cache.put scheiterte, und weil das im selben catch landete
// wie ein Netzfehler, fiel das Bild aus, obwohl es geladen war.
//
// Wie in swPush.test.js läuft sw.js in einer eigenen Umgebung, mit
// nachgebautem self, caches und fetch.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const QUELLE = fs.readFileSync(new URL('../../sw.js', import.meta.url), 'utf8');
const BILD = 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f0/Semperoper_at_night.jpg/500px-Semperoper_at_night.jpg';

class Antwort {
    constructor(art = 'cors', ok = true) { this.type = art; this.ok = ok; }
    clone() { return this; }
    static error() { return { fehler: true }; }
}

/**
 * @param {object} o
 * @param {(url: string, optionen?: object) => Promise} o.netz  fetch
 * @param {boolean} [o.speicherVoll]  cache.put wirft
 */
function worker({ netz, speicherVoll = false }) {
    const zuhoerer = {};
    const abrufe = [];
    const gespeichert = new Map();
    const cache = {
        match: async (r) => gespeichert.get(r.url),
        put: async (r, antwort) => {
            if (speicherVoll) throw Object.assign(new Error('Quota exceeded'), { name: 'QuotaExceededError' });
            gespeichert.set(r.url, antwort);
        },
        keys: async () => [...gespeichert.keys()],
        delete: async () => true,
    };
    const self = {
        location: new URL('https://opernlog.vercel.app/sw.js'),
        registration: { scope: 'https://opernlog.vercel.app/' },
        clients: { claim: () => {} },
        addEventListener: (art, f) => { zuhoerer[art] = f; },
        skipWaiting: () => {},
    };
    const fetch = (anfrage, optionen) => {
        abrufe.push({ url: typeof anfrage === 'string' ? anfrage : anfrage.url, optionen });
        return netz(anfrage, optionen);
    };
    vm.runInNewContext(QUELLE, {
        self, fetch, URL, Response: Antwort, console: { log() {}, warn() {}, error() {} },
        caches: { open: async () => cache, keys: async () => [], match: async () => undefined },
    });

    async function bild() {
        let antwort;
        zuhoerer.fetch({
            request: { url: BILD, method: 'GET', mode: 'no-cors' },
            respondWith: (p) => { antwort = p; },
        });
        return await antwort;
    }
    return { bild, abrufe, gespeichert };
}

test('Bilder werden mit CORS geholt, damit sie mit ihrer echten Größe zählen', async () => {
    const w = worker({ netz: async () => new Antwort('cors') });
    const antwort = await w.bild();
    assert.equal(antwort.type, 'cors');
    assert.equal(w.abrufe.length, 1);
    assert.equal(w.abrufe[0].url, BILD);
    assert.equal(w.abrufe[0].optionen?.mode, 'cors');
    assert.equal(w.gespeichert.get(BILD), antwort, 'zwischengespeichert');
});

test('ist das Speicherkontingent voll, erscheint das Bild trotzdem', async () => {
    const w = worker({ netz: async () => new Antwort('cors'), speicherVoll: true });
    const antwort = await w.bild();
    assert.notEqual(antwort.fehler, true, 'das Bild fiel aus, weil das Speichern scheiterte');
    assert.equal(antwort.type, 'cors');
});

test('ein Host ohne CORS bekommt den Abruf wie bisher, opaque', async () => {
    const w = worker({
        netz: async (anfrage, optionen) => {
            if (optionen?.mode === 'cors') throw new TypeError('CORS verweigert');
            return new Antwort('opaque', false);
        },
    });
    const antwort = await w.bild();
    assert.equal(antwort.type, 'opaque');
    assert.equal(w.abrufe.length, 2);
    assert.ok(w.gespeichert.has(BILD), 'auch opaque wird gespeichert');
});

test('ohne Netz und ohne Cache: ein Fehler statt eines hängenden Bildes', async () => {
    const w = worker({ netz: async () => { throw new TypeError('offline'); } });
    const antwort = await w.bild();
    assert.equal(antwort.fehler, true);
});

test('was im Cache liegt, kommt ohne Netz', async () => {
    const w = worker({ netz: async () => new Antwort('cors') });
    const erste = await w.bild();
    const zweite = await w.bild();
    assert.equal(zweite, erste);
    assert.equal(w.abrufe.length, 1);
});
