// Der Umzug von opernlog.vercel.app nach opernlog.de (src/umzug.js) und die
// Edge Function, die die Anmeldung übergibt (supabase/functions/umzug).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
    UMZUG_AKTIV, umzugSchritt, umzugZiel, umzugAusHash, vonAlterAdresse, umzugEinloesen, istAlteAdresse,
} from '../../src/umzug.js';

test('bis zum Umschalten passiert unter der alten Adresse nichts', () => {
    assert.equal(UMZUG_AKTIV, false);
    assert.equal(umzugSchritt({ alteAdresse: true, installiert: false, angemeldet: true }), 'nichts');
});

test('umgeschaltet: angemeldet mit Code, abgemeldet einfach weiter, installiert nur Hinweis', () => {
    const s = (o) => umzugSchritt({ aktiv: true, ...o });
    assert.equal(s({ alteAdresse: true, installiert: false, angemeldet: true }), 'mitAnmeldung');
    assert.equal(s({ alteAdresse: true, installiert: false, angemeldet: false }), 'weiter');
    assert.equal(s({ alteAdresse: true, installiert: true, angemeldet: true }), 'hinweis');
    // Unter der neuen Adresse, beim Entwickeln und in Vorschauen: nichts.
    assert.equal(s({ alteAdresse: false, installiert: false, angemeldet: true }), 'nichts');
});

test('nur opernlog.vercel.app ist die alte Adresse', () => {
    const ort = (host) => ({ location: { hostname: host } });
    assert.equal(istAlteAdresse(ort('opernlog.vercel.app')), true);
    for (const h of ['opernlog.de', 'www.opernlog.de', '127.0.0.1', 'opernlog-git-x.vercel.app']) {
        assert.equal(istAlteAdresse(ort(h)), false, h);
    }
});

test('die Zieladresse: dieselbe Stelle, mit Code über #/umzug', () => {
    assert.equal(umzugZiel({ hash: '#/opera/tosca' }), 'https://opernlog.de/#/opera/tosca');
    assert.equal(umzugZiel({ hash: '' }), 'https://opernlog.de/#/');
    const mit = umzugZiel({ hash: '#/visit/abc?x=1', code: 'umzugcode1234' });
    assert.ok(mit.startsWith('https://opernlog.de/#/umzug?'), mit);
    assert.deepEqual(umzugAusHash(mit.slice('https://opernlog.de/'.length)), { code: 'umzugcode1234', weiter: '#/visit/abc?x=1', push: false });
    const mitPush = umzugZiel({ hash: '#/', code: 'umzugcode1234', push: true });
    assert.equal(umzugAusHash(mitPush.slice('https://opernlog.de/'.length)).push, true);
});

test('aus der Adresse: nur ein sauberer Code, und weiter nur in die App', () => {
    assert.equal(umzugAusHash('#/opera/tosca'), null);
    assert.equal(umzugAusHash('#/umzug?code=zu'), null, 'zu kurz');
    assert.equal(umzugAusHash('#/umzug?code=ab%3Cscript%3Ecd1234'), null, 'fremde Zeichen');
    const fremd = umzugAusHash(`#/umzug?code=umzugcode1234&weiter=${encodeURIComponent('https://boese.example/')}`);
    assert.equal(fremd.weiter, '#/');
    const schleife = umzugAusHash(`#/umzug?code=umzugcode1234&weiter=${encodeURIComponent('#/umzug?code=x')}`);
    assert.equal(schleife.weiter, '#/');
});

test('eingelöst wird nur, was von der alten Adresse kommt', () => {
    assert.equal(vonAlterAdresse('https://opernlog.vercel.app/'), true);
    assert.equal(vonAlterAdresse('http://opernlog.vercel.app/'), false);
    assert.equal(vonAlterAdresse('https://boese.example/'), false);
    assert.equal(vonAlterAdresse(''), false);
});

function umgebung(hash, referrer) {
    const speicher = new Map();
    const u = { location: { hash }, document: { referrer }, ersetzt: [], speicher,
        localStorage: { setItem: (k, v) => speicher.set(k, v), getItem: k => speicher.get(k) ?? null } };
    u.history = { replaceState: (_s, _t, url) => { u.ersetzt.push(url); u.location.hash = url; } };
    return u;
}

test('Einlösen: Code an verifyOtp, dann an die alte Stelle, ohne Code im Verlauf', async () => {
    const u = umgebung('#/umzug?code=umzugcode1234&weiter=%23%2Fdiary', 'https://opernlog.vercel.app/');
    const codes = [];
    assert.equal(await umzugEinloesen({ umgebung: u, einloesen: async c => { codes.push(c); } }), true);
    assert.deepEqual(codes, ['umzugcode1234']);
    assert.deepEqual(u.ersetzt, ['#/diary']);
});

test('Einlösen: von fremder Seite nicht – die Adresse wird trotzdem aufgeräumt', async () => {
    const u = umgebung('#/umzug?code=umzugcode1234&weiter=%23%2Fdiary', 'https://boese.example/');
    let gerufen = false;
    assert.equal(await umzugEinloesen({ umgebung: u, einloesen: async () => { gerufen = true; } }), false);
    assert.equal(gerufen, false);
    assert.deepEqual(u.ersetzt, ['#/diary']);
});

test('Einlösen: scheitert der Code, bleibt man abgemeldet an der alten Stelle', async () => {
    const u = umgebung('#/umzug?code=umzugcode1234', 'https://opernlog.vercel.app/');
    assert.equal(await umzugEinloesen({ umgebung: u, einloesen: async () => { throw new Error('abgelaufen'); } }), false);
    assert.deepEqual(u.ersetzt, ['#/']);
});

test('ohne #/umzug: nichts angefasst', async () => {
    const u = umgebung('#/opera/tosca', 'https://opernlog.vercel.app/');
    assert.equal(await umzugEinloesen({ umgebung: u, einloesen: async () => { throw new Error('nie'); } }), false);
    assert.deepEqual(u.ersetzt, []);
});

test('die Edge Function: nur für das eigene Konto, ohne Mail, ohne Zwischenspeicher', () => {
    const f = fs.readFileSync(new URL('../../supabase/functions/umzug/index.ts', import.meta.url), 'utf8');
    // Das Konto kommt aus dem Token, nie aus der Anfrage.
    assert.match(f, /\/auth\/v1\/user`, \{\s*headers: \{ apikey: DIENST, Authorization: `Bearer \$\{token\}` \}/);
    assert.doesNotMatch(f, /req\.json\(\)/, 'liest keine Angaben aus der Anfrage');
    assert.match(f, /einmalCode\(ich\.email\)/);
    assert.match(f, /\/auth\/v1\/admin\/generate_link/);
    assert.match(f, /type: 'magiclink'/);
    assert.match(f, /'Cache-Control': 'no-store'/);
    assert.match(f, /if \(!token\) return json\(\{ fehler: 'Nicht angemeldet' \}, 401\)/);
});

test('Mitteilungen waren an: nach dem Einlösen merkt sich die neue Adresse, noch einmal zu fragen', async () => {
    const mit = umgebung('#/umzug?code=umzugcode1234&push=1', 'https://opernlog.vercel.app/');
    await umzugEinloesen({ umgebung: mit, einloesen: async () => {} });
    assert.equal(mit.speicher.get('opernlog:umzugMitteilungen'), '1');
    const ohne = umgebung('#/umzug?code=umzugcode1234', 'https://opernlog.vercel.app/');
    await umzugEinloesen({ umgebung: ohne, einloesen: async () => {} });
    assert.equal(ohne.speicher.has('opernlog:umzugMitteilungen'), false);
    // Scheitert das Einlösen, wird auch nicht gefragt.
    const kaputt = umgebung('#/umzug?code=umzugcode1234&push=1', 'https://opernlog.vercel.app/');
    await umzugEinloesen({ umgebung: kaputt, einloesen: async () => { throw new Error('x'); } });
    assert.equal(kaputt.speicher.has('opernlog:umzugMitteilungen'), false);
});
