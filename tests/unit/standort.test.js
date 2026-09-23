// Die Standortabfrage und ihr Vermerk "verweigert".
//
// Anlass (23.09.2026, am Mac in Safari): die Seite war für den Standort
// freigegeben, die App sagte trotzdem "nicht freigegeben". Sie hatte sich
// eine frühere Ablehnung gemerkt und prüfte diesen Vermerk vor allem anderen –
// eine Woche lang, ohne den Browser überhaupt zu fragen.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { requestPosition, standortFehler, standortHinweis } from '../../src/utils.js';

const VERMERK = 'opernlog:positionDenied';
let speicher;
let abfragen;

/** Ein nachgebauter Browser: Freigabe laut Permissions-API und Antwort der Ortung. */
function browser({ freigabe = 'prompt', ortung = { lat: 51.05, lon: 13.74 } } = {}) {
    abfragen = 0;
    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: {
            permissions: { query: async () => ({ state: freigabe }) },
            geolocation: {
                getCurrentPosition: (ok, fehler) => {
                    abfragen += 1;
                    if (ortung.code) fehler({ code: ortung.code, message: 'x' });
                    else ok({ coords: { latitude: ortung.lat, longitude: ortung.lon } });
                },
            },
        },
    });
}

beforeEach(() => {
    speicher = new Map();
    globalThis.localStorage = {
        getItem: k => speicher.has(k) ? speicher.get(k) : null,
        setItem: (k, v) => speicher.set(k, String(v)),
        removeItem: k => speicher.delete(k),
    };
});

const abgelehnt = () => speicher.set(VERMERK, JSON.stringify({ at: Date.now() }));

test('freigegeben: fragt auch nach einer früheren Ablehnung, und der Vermerk ist weg', async () => {
    abgelehnt();
    browser({ freigabe: 'granted' });
    const p = await requestPosition();
    assert.deepEqual([p?.lat, p?.lon], [51.05, 13.74]);
    assert.equal(abfragen, 1);
    assert.equal(speicher.has(VERMERK), false);
    assert.equal(standortFehler(), null);
});

test('ohne Freigabe hält der Vermerk die Automatik zurück', async () => {
    abgelehnt();
    browser({ freigabe: 'prompt' });
    assert.equal(await requestPosition(), null);
    assert.equal(abfragen, 0, 'trotz Vermerk gefragt');
    assert.equal(standortFehler(), 'verweigert');
});

test('ausdrücklich gewünscht: wird trotz Vermerk gefragt', async () => {
    abgelehnt();
    browser({ freigabe: 'prompt' });
    const p = await requestPosition({ nachfragen: true });
    assert.ok(p);
    assert.equal(abfragen, 1);
});

test('vom Browser gesperrt: kein Fragen, Vermerk, Grund "verweigert"', async () => {
    browser({ freigabe: 'denied' });
    assert.equal(await requestPosition({ nachfragen: true }), null);
    assert.equal(abfragen, 0);
    assert.equal(standortFehler(), 'verweigert');
    assert.ok(speicher.has(VERMERK));
});

test('der Grund unterscheidet gesperrt, nicht ermittelbar und Zeit', async () => {
    for (const [code, grund] of [[1, 'verweigert'], [2, 'nicht-ermittelbar'], [3, 'zeit']]) {
        speicher.clear();
        browser({ freigabe: 'granted', ortung: { code } });
        assert.equal(await requestPosition(), null);
        assert.equal(standortFehler(), grund, `Code ${code}`);
    }
    assert.match(standortHinweis('verweigert'), /Ortungsdienste/);
    assert.match(standortHinweis('zeit'), /noch einmal/);
    assert.match(standortHinweis('nicht-ermittelbar'), /WLAN/);
});
