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

test('"weitere Termine anzeigen" auch als Listenelement statt Knopf (Hagen)', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const SEITE = '<!doctype html><html><body><main><h1>Die Fledermaus</h1><ul id="t">'
        + '<li>Sa, 03.10.2026, 19:30 Uhr</li>'
        + '<li class="show-more-event-items"><b>weitere Termine anzeigen</b></li></ul></main><script>'
        + 'document.querySelector(".show-more-event-items").addEventListener("click", (e) => {'
        + '  e.currentTarget.remove();'
        + '  document.getElementById("t").insertAdjacentHTML("beforeend", "<li>Sa, 20.02.2027, 19:30 Uhr</li>");'
        + '});'
        + '</script></body></html>';
    const ctx = await browser.newContext();
    try {
        await ctx.route('https://theater.example/fledermaus', r => r.fulfill({ body: SEITE, contentType: 'text/html; charset=utf-8' }));
        const d = await seite(ctx, 'https://theater.example/fledermaus');
        assert.match(d.text, /20\.02\.2027/);
    } finally { await ctx.close(); }
});

test('"Network Error" beim ersten Laden: kurz warten und neu laden (Kassel)', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    let aufrufe = 0;
    const ctx = await browser.newContext();
    try {
        await ctx.route('https://theater.example/elisir', r => {
            aufrufe++;
            const body = aufrufe === 1
                ? '<!doctype html><html><head><title>Network Error</title></head><body><main>Network Error</main></body></html>'
                : '<!doctype html><html><head><title>L’elisir d’amore</title></head><body><main><h1>L’elisir d’amore</h1><p>Sa 13.02.2027, 19:00 Uhr</p></main></body></html>';
            return r.fulfill({ body, contentType: 'text/html; charset=utf-8' });
        });
        const d = await seite(ctx, 'https://theater.example/elisir');
        assert.match(d.text, /13\.02\.2027/);
        assert.equal(aufrufe, 2);
    } finally { await ctx.close(); }
});

test('Nachlade-Knopf in einem <div> mit demselben Text: der Knopf wird geklickt (Leipzig)', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const SEITE = '<!doctype html><html><body><main><h1>Carmen</h1><ul id="t"><li>Sa, 09.01.2027, 19:00 Uhr</li></ul>'
        + '<div class="mehr"><button type="button">Weitere Termine anzeigen</button></div></main>'
        // Eine Leiste über allem, wie ein Cookiehinweis: Playwrights Klick
        // kommt nicht durch, nur der direkte im Dokument.
        + '<div style="position: fixed; inset: 0; z-index: 9"></div><script>'
        + 'document.querySelector(".mehr button").addEventListener("click", () => {'
        + '  document.querySelector(".mehr").remove();'
        + '  document.getElementById("t").insertAdjacentHTML("beforeend", "<li>So, 09.05.2027, 18:00 Uhr</li>");'
        + '});'
        + '</script></body></html>';
    const ctx = await browser.newContext();
    try {
        await ctx.route('https://theater.example/carmen', r => r.fulfill({ body: SEITE, contentType: 'text/html; charset=utf-8' }));
        const d = await seite(ctx, 'https://theater.example/carmen');
        assert.match(d.text, /09\.05\.2027/);
    } finally { await ctx.close(); }
});

test('"Weitere Termine" als Schalter wird nur einmal aufgeklappt (Karlsruhe)', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const SEITE = '<!doctype html><html><body><main><h1>Il Trittico</h1>'
        + '<div>Samstag, 3.7.2027, 18:00</div>'
        + '<p><b><a href="#liste" class="schalter" aria-expanded="false">Weitere Termine</a></b></p>'
        + '<div id="liste" style="display: none">Mittwoch, 21.7.2027, 19:00</div></main><script>'
        + 'document.querySelector(".schalter").addEventListener("click", (e) => {'
        + '  e.preventDefault();'
        + '  const liste = document.getElementById("liste");'
        + '  const zu = liste.style.display === "none";'
        + '  liste.style.display = zu ? "block" : "none";'
        + '  e.currentTarget.setAttribute("aria-expanded", zu ? "true" : "false");'
        + '});'
        + '</script></body></html>';
    const ctx = await browser.newContext();
    try {
        await ctx.route('https://theater.example/trittico', r => r.fulfill({ body: SEITE, contentType: 'text/html; charset=utf-8' }));
        const d = await seite(ctx, 'https://theater.example/trittico');
        assert.match(d.text, /21\.7\.2027/);
    } finally { await ctx.close(); }
});

test('"Alle Termine anzeigen" als Link auf eine andere Seite wird nicht geklickt (Staatsoper Berlin)', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const SEITE = '<!doctype html><html><body><main><h1>Spielplan Dezember</h1><ul><li>Fr, 04.12.2026, 19:00 Uhr – La Bohème</li></ul>'
        + '<a href="/andere-seite">Alle Termine anzeigen</a></main></body></html>';
    const ctx = await browser.newContext();
    try {
        await ctx.route('https://theater.example/dezember', r => r.fulfill({ body: SEITE, contentType: 'text/html; charset=utf-8' }));
        await ctx.route('https://theater.example/andere-seite', r => r.fulfill({ body: '<!doctype html><html><body><main>Andere Seite</main></body></html>', contentType: 'text/html' }));
        const d = await seite(ctx, 'https://theater.example/dezember');
        assert.equal(d.endUrl, 'https://theater.example/dezember');
        assert.match(d.text, /04\.12\.2026/);
    } finally { await ctx.close(); }
});
