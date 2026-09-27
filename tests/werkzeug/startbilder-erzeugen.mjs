// Die Startbilder für das iPhone (apple-touch-startup-image).
//
//   node tests/werkzeug/startbilder-erzeugen.mjs
//
// Wer OpernLog vom Home-Bildschirm öffnet, sieht zuerst den Startbildschirm
// von iOS – ohne Startbild ein schwarzer, danach kurz den leeren, grauen
// Hintergrund des Browsers, bis die Seite zum ersten Mal gezeichnet ist.
// Erst dann kommt der Vorhang. Das sah aus wie ein Fehler.
//
// Das Startbild ist deshalb genau das, was die Seite als Erstes zeichnet: der
// geschlossene Vorhang, noch ohne Logo und Titel (die blenden danach ein).
// So geht das Bild ohne Sprung in die Seite über. Fotografiert wird die
// echte Seite, nicht nachgebaut – ändert sich der Vorhang, dieses Werkzeug
// neu laufen lassen.
//
// iOS nimmt nur ein Bild, das auf den Pixel zum Gerät passt; daher eines je
// Bildschirmgröße, ausgewählt über media in index.html. Die Zeilen dafür
// gibt das Werkzeug am Ende aus.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { starteServer, ladePlaywright, starteBrowser } from '../browser/umgebung.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ORDNER = path.join(WURZEL, 'icons/start');

// Breite und Höhe in CSS-Pixeln, Pixeldichte – hochkant, wie die App läuft.
export const GERAETE = [
    { w: 440, h: 956, dpr: 3, name: 'iPhone 16/17 Pro Max' },
    { w: 420, h: 912, dpr: 3, name: 'iPhone Air' },
    { w: 402, h: 874, dpr: 3, name: 'iPhone 16 Pro, 17, 17 Pro' },
    { w: 430, h: 932, dpr: 3, name: 'iPhone 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus' },
    { w: 393, h: 852, dpr: 3, name: 'iPhone 14 Pro, 15, 15 Pro, 16' },
    { w: 428, h: 926, dpr: 3, name: 'iPhone 12/13 Pro Max, 14 Plus' },
    { w: 390, h: 844, dpr: 3, name: 'iPhone 12, 13, 14' },
    { w: 375, h: 812, dpr: 3, name: 'iPhone X, XS, 11 Pro, 12/13 mini' },
    { w: 414, h: 896, dpr: 3, name: 'iPhone XS Max, 11 Pro Max' },
    { w: 414, h: 896, dpr: 2, name: 'iPhone XR, 11' },
    { w: 414, h: 736, dpr: 3, name: 'iPhone 6s/7/8 Plus' },
    { w: 375, h: 667, dpr: 2, name: 'iPhone SE, 6s, 7, 8' },
];

export const dateiname = g => `start-${g.w * g.dpr}x${g.h * g.dpr}.jpg`;

// Alles anhalten, Logo, Titel und Version ausblenden: so zeichnet die Seite
// ihren ersten Moment.
const STANDBILD = `
    *, *::before, *::after { animation: none !important; transition: none !important; }
    .splash__content { visibility: hidden !important; }
`;

export async function startbilderErzeugen() {
    const pw = await ladePlaywright();
    if (!pw) throw new Error('Playwright fehlt (tests/browser: npm install).');
    const server = await starteServer();
    const browser = await starteBrowser(pw.chromium);
    fs.mkdirSync(ORDNER, { recursive: true });
    try {
        for (const g of GERAETE) {
            const ctx = await browser.newContext({ viewport: { width: g.w, height: g.h }, deviceScaleFactor: g.dpr, serviceWorkers: 'block' });
            const p = await ctx.newPage();
            // Ohne App-Code bleibt der Vorhang geschlossen stehen.
            await p.route('**/src/main.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
            await p.goto(`${server.url}/index.html`, { waitUntil: 'load' });
            await p.addStyleTag({ content: STANDBILD });
            await p.waitForTimeout(200);
            await p.screenshot({ path: path.join(ORDNER, dateiname(g)), type: 'jpeg', quality: 82 });
            await ctx.close();
            console.log(`${dateiname(g)}  ${g.name}`);
        }
    } finally {
        await browser.close();
        await server.schliessen();
    }
}

/** Die Zeilen für index.html. */
export function startbildZeilen() {
    return GERAETE.map(g => `    <link rel="apple-touch-startup-image" href="icons/start/${dateiname(g)}"\n`
        + `        media="(device-width: ${g.w}px) and (device-height: ${g.h}px) and (-webkit-device-pixel-ratio: ${g.dpr}) and (orientation: portrait)" />`).join('\n');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    await startbilderErzeugen();
    console.log('\nFür index.html:\n' + startbildZeilen());
}
