// Wie das Spielplan-Werkzeug (tests/werkzeug/spielplaene-lesen.mjs) eine
// Seite lädt: nachgeladene Listen müssen ganz dastehen, bevor es liest.
//
// Die Seite kommt nicht aus dem Netz, sondern aus context.route(): ein
// Monatskalender wie der der Deutschen Oper Berlin. Er zeigt erst die halbe
// Liste; "weitere Spieltage anzeigen" lädt – mit etwas Verzögerung wie über
// das Netz – den nächsten Teil, und das Monatsende kommt erst, wenn man
// danach ans Ende rollt. Dort fehlte der Holländer am 31.10.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { ladePlaywright, starteBrowser } from './umgebung.js';
import { seite } from '../werkzeug/spielplaene-lesen.mjs';

const pw = await ladePlaywright();
const fehltPlaywright = pw ? false : 'Playwright ist nicht installiert';

let browser;

before(async () => {
    if (!pw) return;
    browser = await starteBrowser(pw.chromium);
}, { timeout: 120000 });

after(async () => {
    await browser?.close();
});

const KALENDER = '<!doctype html><html><body><main>'
    + '<div id="liste"><p>Mi</p><p>28.10.</p><p>19:00</p><p>Der fliegende Holländer</p></div>'
    + '<button id="mehr">weitere Spieltage anzeigen</button>'
    + '<div id="ende" style="height: 10px"></div>'
    + '</main><script>'
    + 'const liste = document.getElementById("liste");'
    + 'document.getElementById("mehr").addEventListener("click", (e) => {'
    + '  e.target.remove();'
    // Die Antwort braucht länger, als das Werkzeug nach einem Klick wartet.
    + '  setTimeout(() => {'
    + '    for (let i = 0; i < 20; i++) liste.insertAdjacentHTML("beforeend", "<p style=\\"height: 200px\\">Führung</p>");'
    + '    new IntersectionObserver((eintraege, beobachter) => {'
    + '      if (!eintraege[0].isIntersecting) return;'
    + '      beobachter.disconnect();'
    + '      liste.insertAdjacentHTML("beforeend", "<p>Sa</p><p>31.10.</p><p>19:30</p><p>Der fliegende Holländer</p>");'
    + '    }).observe(document.getElementById("ende"));'
    + '  }, 1500);'
    + '});'
    + '</script></body></html>';

test('nach "weitere Spieltage anzeigen" rollt das Werkzeug weiter bis zum Monatsende', { skip: fehltPlaywright, timeout: 90000 }, async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    try {
        await ctx.route('https://kalender.example/oktober', r => r.fulfill({ body: KALENDER, contentType: 'text/html; charset=utf-8' }));
        const d = await seite(ctx, 'https://kalender.example/oktober');
        assert.match(d.text, /28\.10\./);
        assert.match(d.text, /31\.10\.\s+19:30\s+Der fliegende Holländer/);
    } finally { await ctx.close(); }
});

test('Uhrzeiten aus schema.org-Mikrodaten, wo der Text sie nicht neben dem Datum nennt (Wiesbaden)', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { seitenTermine } = await import('../werkzeug/spielplaene-lesen.mjs');
    const SEITE = '<!doctype html><html><body><main><h1>Tosca</h1>'
        + '<div itemscope itemtype="https://schema.org/Event"><meta itemprop="startDate" content="2026-11-01T18:00:00">'
        + '<p>So</p><p>01 11 2026</p><p>18 Uhr</p></div>'
        + '<div itemscope itemtype="https://schema.org/Event"><meta itemprop="startDate" content="2026-12-12T19:30:00">'
        + '<meta itemprop="endDate" content="2026-12-12T22:15:00"><p>Sa</p><p>12 12 2026</p><p>19.30 Uhr</p></div>'
        + '</main></body></html>';
    const ctx = await browser.newContext();
    try {
        await ctx.route('https://theater.example/tosca', r => r.fulfill({ body: SEITE, contentType: 'text/html; charset=utf-8' }));
        const d = await seite(ctx, 'https://theater.example/tosca');
        const erg = seitenTermine(d, { von: '2026-09-26', bis: '2027-09-30' });
        assert.deepEqual(erg.termine, ['2026-11-01', '2026-12-12']);
        assert.deepEqual(erg.zeiten, { '2026-11-01': '18:00', '2026-12-12': '19:30-22:15' });
    } finally { await ctx.close(); }
});

test('Uhrzeiten aus <time datetime="… 18:00">, wo der Text keine Daten zeigt (Gelsenkirchen)', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const { seitenTermine } = await import('../werkzeug/spielplaene-lesen.mjs');
    const SEITE = '<!doctype html><html><body><main><h1>Wozzeck</h1><ul>'
        + '<li><time datetime="2026-09-27 18:00"></time><span>Großes Haus</span></li>'
        + '<li><time datetime="2026-10-04T16:00"></time><span>Großes Haus</span></li>'
        + '<li><time datetime="2026-10-11"></time><span>Großes Haus</span></li>'
        + '</ul></main></body></html>';
    const ctx = await browser.newContext();
    try {
        await ctx.route('https://theater.example/wozzeck', r => r.fulfill({ body: SEITE, contentType: 'text/html; charset=utf-8' }));
        const d = await seite(ctx, 'https://theater.example/wozzeck');
        const erg = seitenTermine(d, { von: '2026-09-26', bis: '2027-09-30' });
        assert.deepEqual(erg.termine, ['2026-09-27', '2026-10-04', '2026-10-11']);
        assert.deepEqual(erg.zeiten, { '2026-09-27': '18:00', '2026-10-04': '16:00' });
    } finally { await ctx.close(); }
});
