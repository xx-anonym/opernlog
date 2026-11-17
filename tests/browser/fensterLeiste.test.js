// Fenster und die Leiste unten am Handy.
//
// Das Fenster "Profil bearbeiten" reichte bis an den unteren Rand des
// Bildschirms, die Leiste lag darüber. Ganz nach unten gerollt, verschwanden
// "Datenschutz" und "Bildnachweise" unter ihr und ließen sich nicht mehr
// antippen (Jonas, 17.11.2026). Jetzt endet jedes Fenster über der Leiste.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { starteServer, ladePlaywright, starteBrowser, ersetzeSupabase, vorhangAuf } from './umgebung.js';

const pw = await ladePlaywright();
const fehltPlaywright = pw ? false : 'Playwright ist nicht installiert';

let browser, server;

before(async () => {
    if (!pw) return;
    server = await starteServer();
    browser = await starteBrowser(pw.chromium);
}, { timeout: 120000 });

after(async () => {
    await browser?.close();
    await server?.schliessen();
});

test('"Profil bearbeiten" ganz unten: Datenschutz und Bildnachweise liegen über der Leiste', { skip: fehltPlaywright, timeout: 60000 }, async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 700 } });
    const p = await ctx.newPage();
    const fehler = [];
    p.on('pageerror', e => fehler.push(e.message));
    try {
        await ersetzeSupabase(p);
        await p.goto(`${server.url}/index.html#/profile/user-me`);
        await p.waitForSelector('#editProfileBtn', { timeout: 15000 });
        await vorhangAuf(p);
        await p.click('#editProfileBtn');
        await p.waitForSelector('#editProfileModal .rechtstext-link');
        const lage = await p.evaluate(() => {
            const fenster = document.querySelector('#editProfileModal .modal__content');
            fenster.scrollTop = fenster.scrollHeight;
            const leiste = document.querySelector('.tab-leiste').getBoundingClientRect();
            return {
                leisteOben: leiste.top,
                fensterUnten: fenster.getBoundingClientRect().bottom,
                links: [...fenster.querySelectorAll('.rechtstext-link')].map(a => {
                    const r = a.getBoundingClientRect();
                    const getroffen = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
                    return { text: a.textContent, unten: r.bottom, antippbar: getroffen === a || a.contains(getroffen) };
                }),
            };
        });
        assert.ok(lage.fensterUnten <= lage.leisteOben, `Fenster endet bei ${lage.fensterUnten}, Leiste beginnt bei ${lage.leisteOben}`);
        assert.deepEqual(lage.links.map(l => l.text), ['Feedback', 'Datenschutz', 'Bildnachweise']);
        for (const l of lage.links) {
            assert.ok(l.unten <= lage.leisteOben, `${l.text} liegt unter der Leiste`);
            assert.ok(l.antippbar, `${l.text} lässt sich nicht antippen`);
        }
        assert.deepEqual(fehler, []);
    } finally { await ctx.close(); }
});
