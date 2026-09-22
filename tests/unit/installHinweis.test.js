// Wann oben der Hinweis aufs Installieren steht – und wann die Frage nach
// Mitteilungen kommt.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { installHinweisArt } from '../../src/installHinweis.js';
import { mitteilungenFrageFaellig, mitteilungenFrageErledigt } from '../../src/push.js';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 Version/18.7 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';

const geraet = (userAgent, { standalone = false, platform, maxTouchPoints } = {}) => ({
    navigator: { userAgent, standalone, platform, maxTouchPoints },
    matchMedia: () => ({ matches: false }),
});

test('iPhone und Android im Browser bekommen den Hinweis', () => {
    assert.equal(installHinweisArt(geraet(IPHONE)), 'ios');
    assert.equal(installHinweisArt(geraet(ANDROID)), 'android');
});

test('ein iPad, das sich als Mac ausgibt, auch', () => {
    assert.equal(installHinweisArt(geraet(MAC, { platform: 'MacIntel', maxTouchPoints: 5 })), 'ios');
});

test('installiert oder am Rechner steht kein Hinweis', () => {
    assert.equal(installHinweisArt(geraet(IPHONE, { standalone: true })), null, 'iPhone vom Home-Bildschirm');
    assert.equal(installHinweisArt({ navigator: { userAgent: ANDROID }, matchMedia: q => ({ matches: q === '(display-mode: standalone)' }) }), null, 'installierte Android-App');
    assert.equal(installHinweisArt(geraet(MAC, { platform: 'MacIntel', maxTouchPoints: 0 })), null, 'Mac');
    assert.equal(installHinweisArt(geraet('Mozilla/5.0 (Windows NT 10.0) Chrome/128.0')), null, 'Windows');
});

// ── Die Frage nach Mitteilungen ──────────────────────────────────────────

function speicher() {
    const d = {};
    return { getItem: k => d[k] ?? null, setItem: (k, v) => { d[k] = String(v); }, daten: d };
}

const JETZT = Date.parse('2026-09-22T12:00:00Z');
const bereit = (erlaubnis = 'default', s = speicher()) => ({
    navigator: { userAgent: MAC, serviceWorker: {} },
    PushManager: function () {},
    Notification: { permission: erlaubnis },
    matchMedia: () => ({ matches: false }),
    localStorage: s,
});

test('ein neues Konto wird gefragt', () => {
    assert.equal(mitteilungenFrageFaellig({ umgebung: bereit(), profilErstellt: '2026-09-20T10:00:00Z', jetzt: JETZT }), true);
});

test('ein altes Konto nicht', () => {
    // Wer länger dabei ist, kennt "Profil bearbeiten".
    assert.equal(mitteilungenFrageFaellig({ umgebung: bereit(), profilErstellt: '2026-07-01T10:00:00Z', jetzt: JETZT }), false);
    assert.equal(mitteilungenFrageFaellig({ umgebung: bereit(), profilErstellt: undefined, jetzt: JETZT }), false);
});

test('einmal beantwortet, fragt das Gerät nicht wieder', () => {
    const s = speicher();
    const u = bereit('default', s);
    mitteilungenFrageErledigt(u);
    assert.equal(mitteilungenFrageFaellig({ umgebung: u, profilErstellt: '2026-09-20T10:00:00Z', jetzt: JETZT }), false);
});

test('schon erlaubt oder verboten: keine Frage', () => {
    assert.equal(mitteilungenFrageFaellig({ umgebung: bereit('granted'), profilErstellt: '2026-09-20', jetzt: JETZT }), false);
    assert.equal(mitteilungenFrageFaellig({ umgebung: bereit('denied'), profilErstellt: '2026-09-20', jetzt: JETZT }), false);
});

test('im Safari-Tab auf dem iPhone keine Frage – dort steht der Hinweis', () => {
    const u = { navigator: { userAgent: IPHONE, serviceWorker: {} }, matchMedia: () => ({ matches: false }), localStorage: speicher() };
    assert.equal(mitteilungenFrageFaellig({ umgebung: u, profilErstellt: '2026-09-20', jetzt: JETZT }), false);
});

test('ohne Speicher lieber gar nicht fragen als bei jedem Start', () => {
    const u = bereit();
    u.localStorage = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('SecurityError'); } };
    assert.equal(mitteilungenFrageFaellig({ umgebung: u, profilErstellt: '2026-09-20', jetzt: JETZT }), false);
    assert.doesNotThrow(() => mitteilungenFrageErledigt(u));
});
