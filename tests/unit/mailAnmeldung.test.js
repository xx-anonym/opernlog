// Angemeldet per Knopf in der Mail (src/mailAnmeldung.js): was aus der
// Adresse gelesen wird, wann eingelöst wird – und wann nicht.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mailLinkAusHash, mailLinkEinloesen, mailAnmeldungText } from '../../src/mailAnmeldung.js';
import { knopfLink } from '../../supabase/functions/mail-senden/felder.js';

function umgebung(hash) {
    const u = { location: { hash }, ersetzt: [] };
    u.history = { replaceState: (_s, _t, url) => { u.ersetzt.push(url); u.location.hash = url; } };
    return u;
}

test('liest Code und Ziel, das Ziel nur als Stelle in der App', () => {
    assert.deepEqual(mailLinkAusHash('#/mail?code=abcDEF123_-xyz&weiter=%23%2Fseason'), { code: 'abcDEF123_-xyz', weiter: '#/season' });
    assert.equal(mailLinkAusHash('#/season'), null);
    assert.equal(mailLinkAusHash(''), null);
    // Fremde Adressen, Schleifen und Unsinn werden zu #/.
    for (const weiter of ['https://boese.example/', '//boese.example', '#/mail?code=x', '#/umzug?code=x', 'javascript:alert(1)', '#/ x']) {
        assert.equal(mailLinkAusHash(`#/mail?code=abcDEF123_-xyz&weiter=${encodeURIComponent(weiter)}`).weiter, '#/', weiter);
    }
    // Ein unbrauchbarer Code wird gar nicht erst versucht.
    assert.equal(mailLinkAusHash('#/mail?code=kurz&weiter=%23%2F').code, null);
    assert.equal(mailLinkAusHash('#/mail?code=a%20b%26c%3Dd12&weiter=%23%2F').code, null);
});

test('der Link aus felder.js lässt sich hier lesen', () => {
    const url = new URL(knopfLink('saison', 'abcDEF123_-xyz'));
    assert.equal(url.origin, 'https://opernlog.de');
    assert.deepEqual(mailLinkAusHash(url.hash), { code: 'abcDEF123_-xyz', weiter: '#/season' });
});

test('nicht angemeldet: eingelöst, Adresse aufgeräumt', async () => {
    const u = umgebung('#/mail?code=abcDEF123_-xyz&weiter=%23%2Fseason');
    const eingeloest = [];
    const ergebnis = await mailLinkEinloesen({ umgebung: u, angemeldet: async () => false, einloesen: async c => { eingeloest.push(c); } });
    assert.equal(ergebnis, 'angemeldet');
    assert.deepEqual(eingeloest, ['abcDEF123_-xyz']);
    assert.deepEqual(u.ersetzt, ['#/season']);
});

test('schon angemeldet: kein Kontowechsel, auch wenn unklar', async () => {
    for (const angemeldet of [async () => true, async () => { throw new Error('kaputt'); }]) {
        const u = umgebung('#/mail?code=abcDEF123_-xyz&weiter=%23%2Fseason');
        let gerufen = false;
        const ergebnis = await mailLinkEinloesen({ umgebung: u, angemeldet, einloesen: async () => { gerufen = true; } });
        assert.equal(ergebnis, 'schon');
        assert.equal(gerufen, false);
        assert.deepEqual(u.ersetzt, ['#/season']);
    }
});

test('abgelaufen: gemeldet, Adresse trotzdem aufgeräumt', async () => {
    const u = umgebung('#/mail?code=abcDEF123_-xyz&weiter=%23%2F');
    const ergebnis = await mailLinkEinloesen({ umgebung: u, angemeldet: async () => false, einloesen: async () => { throw new Error('otp_expired'); } });
    assert.equal(ergebnis, 'abgelaufen');
    assert.deepEqual(u.ersetzt, ['#/']);
});

test('keine Mail-Adresse: nichts angefasst', async () => {
    const u = umgebung('#/opera/tosca');
    assert.equal(await mailLinkEinloesen({ umgebung: u, angemeldet: async () => false, einloesen: async () => {} }), 'kein');
    assert.deepEqual(u.ersetzt, []);
});

test('der Hinweis nennt das Konto', () => {
    assert.equal(mailAnmeldungText('JonasS'), 'Angemeldet als JonasS.');
    assert.equal(mailAnmeldungText(''), 'Du bist jetzt angemeldet.');
});
