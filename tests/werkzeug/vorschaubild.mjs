// Erzeugt icons/vorschau.png (1200 × 630): das Bild, das WhatsApp, iMessage,
// Signal und Mastodon neben einem Link auf opernlog.de zeigen (og:image in
// index.html). Vorhang, Masken, Name – wie der Ladebildschirm.
//
// Dazu icons/vorschau-quadrat.png (1200 × 1200) für Google: dessen Vorschau
// im Treffer ist quadratisch, und das breite Bild stand dort mit grauen
// Rändern oben und unten (Jonas, 19.11.2026). Google bekommt beide über
// "image" in den Strukturdaten und wählt das passende.
//
//   node tests/werkzeug/vorschaubild.mjs
//
// Braucht Playwright aus tests/browser (dort installiert).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ladePlaywright, starteBrowser } from '../browser/umgebung.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const masken = `
  <svg viewBox="11 13 46 40" width="300" height="261" fill="none" stroke="#f0d074" stroke-width="1.4"
       stroke-linecap="round" stroke-linejoin="round">
    <path d="M32 26C32 16 54 16 54 26C54 37 49 44 43 44C37 44 32 37 32 26Z" fill="#2a0d15"/>
    <path d="M40 26.5Q42.5 29.5 45 26.5" stroke-width="1.1"/>
    <path d="M47.5 26.5Q50 29.5 52.5 26.5" stroke-width="1.1"/>
    <path d="M41 38Q46 33.5 51 38" stroke-width="1.1"/>
    <path d="M14 30C14 19 38 19 38 30C38 42 33 50 26 50C19 50 14 42 14 30Z" fill="#1a0710"/>
    <path d="M19.5 30.5Q22 27.5 24.5 30.5" stroke-width="1.1"/>
    <path d="M27.5 30.5Q30 27.5 32.5 30.5" stroke-width="1.1"/>
    <path d="M19.5 38Q26 44 32.5 38" stroke-width="1.1"/>
  </svg>`;

const seiteFuer = ({ breite, hoehe, quadrat }) => `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  @font-face { font-family: 'Playfair Display'; font-weight: 400 900; src: url('${pathToFileURL(path.join(WURZEL, 'fonts/playfair-display-normal-latin.woff2'))}'); }
  @font-face { font-family: 'DM Sans'; font-weight: 300 800; src: url('${pathToFileURL(path.join(WURZEL, 'fonts/dm-sans-normal-latin.woff2'))}'); }
  html, body { margin: 0; width: ${breite}px; height: ${hoehe}px; overflow: hidden; }
  body {
    background:
      repeating-linear-gradient(90deg, rgba(0,0,0,0.25) 0 18px, rgba(255,255,255,0.03) 18px 44px, rgba(0,0,0,0.18) 44px 70px),
      linear-gradient(180deg, #6b1525 0%, #4a0d19 70%, #3d0a15 100%);
    display: flex; align-items: center; gap: 64px; padding: 0 96px; box-sizing: border-box;
    ${quadrat ? 'flex-direction: column; justify-content: center; gap: 48px; text-align: center;' : ''}
    font-family: 'DM Sans', sans-serif; color: #e8d6d9;
  }
  body::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 8px;
    background: linear-gradient(90deg, #a08030, #dfc06a, #a08030); }
  h1 { font-family: 'Playfair Display', serif; font-size: 112px; font-weight: 700; color: #dfc06a; margin: 0; letter-spacing: 1px; }
  p { font-size: 38px; margin: 10px 0 0; line-height: 1.3; }
  .klein { font-size: 28px; color: #c9a7ad; margin-top: 26px; white-space: nowrap; }
  ${quadrat ? 'svg { width: 420px; height: 365px; } h1 { font-size: 150px; } p { font-size: 50px; } .klein { font-size: 36px; margin-top: 34px; }' : ''}
</style></head><body>
  ${masken}
  <div>
    <h1>OpernLog</h1>
    <p>Dein Operntagebuch</p>
    <p class="klein">Abende festhalten · Spielpläne von über 90 Häusern</p>
  </div>
</body></html>`;

const pw = await ladePlaywright();
const browser = await starteBrowser(pw.chromium);
const ordner = fs.mkdtempSync(path.join(os.tmpdir(), 'opernlog-vorschau-'));
for (const bild of [
    { datei: 'icons/vorschau.png', breite: 1200, hoehe: 630, quadrat: false },
    { datei: 'icons/vorschau-quadrat.png', breite: 1200, hoehe: 1200, quadrat: true },
]) {
    const seite = await browser.newPage({ viewport: { width: bild.breite, height: bild.hoehe } });
    // Als Datei geöffnet, nicht per setContent: von about:blank aus lädt der
    // Browser keine Schriften von file://.
    const html = path.join(ordner, 'vorschau.html');
    fs.writeFileSync(html, seiteFuer(bild));
    await seite.goto(pathToFileURL(html).href, { waitUntil: 'load' });
    await seite.evaluate(() => document.fonts.ready);
    await seite.screenshot({ path: path.join(WURZEL, bild.datei), type: 'png' });
    await seite.close();
    console.log(bild.datei);
}
await browser.close();
fs.rmSync(ordner, { recursive: true, force: true });
