// Das Wochenbild: was in einer Woche neu auf die Opernbühnen kommt, als Bild
// für Instagram und Mastodon (1080 × 1350) samt Begleittext – für neue
// Nutzer (Jonas, 24.11.2026). Jonas postet es; das Werkzeug macht es fertig.
//
//   node tests/werkzeug/wochenbild.mjs                 die Woche ab dem nächsten Montag (montags: diese)
//   node tests/werkzeug/wochenbild.mjs --ab=2026-11-30
//
// Schreibt woche/bild.png und woche/index.html; unter opernlog.de/woche/
// liegt beides zum Speichern und Kopieren bereit. Der wöchentliche
// Besetzungslauf (.github/workflows/besetzung-woechentlich.yml) erzeugt es
// montags früh neu.
//
// "Neu" heißt: die erste Vorstellung der Spielzeit, die der Spielplan
// (src/data/spielplan.js) von dieser Produktion kennt, fällt in die Woche –
// eine Premiere oder Wiederaufnahme. Aufs Bild kommen höchstens acht, die
// größten Häuser zuerst; der Begleittext und die Seite nennen alle.
//
// Braucht Playwright aus tests/browser (dort installiert).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { operas } from '../../src/data/operas.js';
import { operaHouses } from '../../src/data/operaHouses.js';
import { spielplan } from '../../src/data/spielplan.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const ORDNER = 'woche';
export const AUF_DEM_BILD = 8;

const WOCHENTAG = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const tagDazu = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const wochentag = (iso) => WOCHENTAG[new Date(`${iso}T12:00:00Z`).getUTCDay()];
/** "5.12." */
const kurz = (iso) => { const [, m, t] = iso.split('-').map(Number); return `${t}.${m}.`; };
const maske = (s) => String(s ?? '').replace(/[&<>"']/g, z => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[z]);

/** Der Montag der Woche: heute, wenn heute Montag ist, sonst der nächste. */
export function wochenbeginn(heute) {
    const tag = new Date(`${heute}T12:00:00Z`).getUTCDay();
    return tagDazu(heute, (8 - tag) % 7);
}

/**
 * Was in der Woche ab montag neu auf die Bühne kommt, nach Datum:
 * [{ werk, haus, datum, zeit, url }] – nur Werke und Häuser im Katalog.
 */
export function neuInDerWoche(montag, { plan = spielplan, werke = operas, haeuser = operaHouses } = {}) {
    const sonntag = tagDazu(montag, 6);
    const werkMap = new Map(werke.map(w => [w.id, w]));
    const hausMap = new Map(haeuser.map(h => [h.id, h]));
    return plan
        .map(e => ({ e, erster: [...(e.termine || [])].sort()[0] }))
        .filter(({ e, erster }) => erster && erster >= montag && erster <= sonntag && werkMap.has(e.werk) && hausMap.has(e.haus))
        .map(({ e, erster }) => ({ werk: werkMap.get(e.werk), haus: hausMap.get(e.haus), datum: erster, zeit: e.zeiten?.[erster] || null, url: e.url }))
        .sort((a, b) => a.datum.localeCompare(b.datum) || a.haus.name.localeCompare(b.haus.name, 'de'));
}

/** Höchstens AUF_DEM_BILD fürs Bild: die größten Häuser, dann wieder nach Datum. */
export function fuersBild(liste, n = AUF_DEM_BILD) {
    return [...liste]
        .sort((a, b) => (b.haus.capacity || 0) - (a.haus.capacity || 0))
        .slice(0, n)
        .sort((a, b) => a.datum.localeCompare(b.datum) || a.haus.name.localeCompare(b.haus.name, 'de'));
}

export const zeitraum = (montag) => {
    const sonntag = tagDazu(montag, 6);
    return `${kurz(montag)}–${kurz(sonntag)}${sonntag.slice(0, 4)}`;
};

/** Der Text zum Bild, zum Kopieren. */
export function begleittext(montag, liste) {
    return [
        `Neu auf den Opernbühnen, ${zeitraum(montag)}: Premieren und Wiederaufnahmen dieser Woche`,
        '',
        ...liste.map(x => `${wochentag(x.datum)} ${kurz(x.datum)} ${x.werk.title} – ${x.haus.name}${x.haus.name.includes(x.haus.city) ? '' : `, ${x.haus.city}`}`),
        '',
        'Alle Termine, Besetzungen und dein eigenes Operntagebuch: opernlog.de',
        '',
        '#oper #opera #opernhaus #spielplan #premiere #operntagebuch',
    ].join('\n');
}

/** Wikimedia-Vorschau in 250 px (feste Breiten, sonst HTTP 400). */
const plakat = (bild) => String(bild || '').replace(/\/\d+px-([^/]+)$/, '/250px-$1');

function bildHtml(montag, auswahl, gesamt) {
    const schrift = (datei) => pathToFileURL(path.join(WURZEL, 'fonts', datei)).href;
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  @font-face { font-family: 'Playfair Display'; font-weight: 400 900; src: url('${schrift('playfair-display-normal-latin.woff2')}'); }
  @font-face { font-family: 'Playfair Display'; font-weight: 400 900; src: url('${schrift('playfair-display-normal-latin-ext.woff2')}'); unicode-range: U+0100-024F; }
  @font-face { font-family: 'DM Sans'; font-weight: 300 800; src: url('${schrift('dm-sans-normal-latin.woff2')}'); }
  @font-face { font-family: 'DM Sans'; font-weight: 300 800; src: url('${schrift('dm-sans-normal-latin-ext.woff2')}'); unicode-range: U+0100-024F; }
  html, body { margin: 0; width: 1080px; height: 1350px; overflow: hidden; }
  body { box-sizing: border-box; padding: 70px 72px 0; font-family: 'DM Sans', sans-serif; color: #e8d6d9; position: relative;
    background: radial-gradient(ellipse 90% 60% at 0% 0%, rgba(139, 26, 43, 0.55), transparent 70%), linear-gradient(170deg, #2a0d15 0%, #14181c 60%); }
  .oben { font-size: 26px; letter-spacing: 6px; text-transform: uppercase; color: #dfc06a; margin: 0; }
  h1 { font-family: 'Playfair Display', serif; font-size: 76px; line-height: 1.02; margin: 14px 0 6px; color: #fff; font-weight: 700; }
  .zeit { font-size: 32px; color: #c9a7ad; margin: 0 0 30px; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  li { display: grid; grid-template-columns: 62px 132px 1fr; gap: 20px; align-items: center; padding: 8px 18px 8px 8px;
    background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(201, 168, 76, 0.22); border-radius: 16px; }
  img, .leer { width: 62px; height: 78px; object-fit: cover; border-radius: 8px; background: #3a1a22; }
  .tag { line-height: 1.05; }
  .tag span { display: block; font-size: 19px; letter-spacing: 3px; text-transform: uppercase; color: #c9a7ad; }
  .tag b { display: block; font-family: 'Playfair Display', serif; font-size: 38px; color: #f0d074; }
  .werk { font-family: 'Playfair Display', serif; font-size: 33px; color: #fff; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .haus { font-size: 23px; color: #c9a7ad; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .fuss { position: absolute; left: 72px; right: 72px; bottom: 40px; display: flex; justify-content: space-between; align-items: baseline; }
  .marke { font-family: 'Playfair Display', serif; font-size: 50px; font-weight: 700; color: #dfc06a; }
  .mehr { font-size: 24px; color: #c9a7ad; }
  body::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 10px; background: linear-gradient(90deg, #a08030, #dfc06a, #a08030); }
</style></head><body>
  <p class="oben">Premieren &amp; Wiederaufnahmen</p>
  <h1>Neu auf den Opernbühnen</h1>
  <p class="zeit">${maske(zeitraum(montag))}</p>
  <ul>
${auswahl.map(x => `    <li>${x.werk.image ? `<img src="${maske(plakat(x.werk.image))}" alt="">` : '<span class="leer"></span>'}<span class="tag"><span>${wochentag(x.datum)}</span><b>${kurz(x.datum)}</b></span><span><div class="werk">${maske(x.werk.title)}</div><div class="haus">${maske(x.haus.name)}${x.haus.name.includes(x.haus.city) ? '' : ` · ${maske(x.haus.city)}`}</div></span></li>`).join('\n')}
  </ul>
  <div class="fuss"><span class="marke">opernlog.de</span><span class="mehr">${gesamt > auswahl.length ? `+ ${gesamt - auswahl.length} weitere · ` : ''}dein Operntagebuch</span></div>
</body></html>`;
}

/** Die Seite unter /woche/: Bild, Text zum Kopieren, die ganze Liste. */
export function wochenseite(montag, liste, text) {
    return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Neu auf den Opernbühnen, ${maske(zeitraum(montag))} | OpernLog</title>
  <meta name="robots" content="noindex">
  <meta name="color-scheme" content="dark">
  <link rel="icon" href="/icons/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="/fonts/schriften.css">
  <link rel="stylesheet" href="/seiten/stil.css">
</head>
<body>
  <header class="kopf"><a class="marke" href="/">OpernLog</a></header>
  <main>
    <article>
      <h1>Neu auf den Opernbühnen</h1>
      <p class="unterzeile">${maske(zeitraum(montag))} · ${liste.length} Premieren und Wiederaufnahmen</p>
      <figure class="bild"><img src="bild.png?${montag}" alt="Wochenbild ${maske(zeitraum(montag))}" width="1080" height="1350" style="width:100%;height:auto"></figure>
      <p><a class="knopf" href="bild.png?${montag}" download="opernlog-woche-${montag}.png">Bild speichern</a></p>
      <h2>Text zum Bild</h2>
      <textarea id="text" rows="14" readonly style="width:100%;box-sizing:border-box;font:inherit;font-size:15px;background:#1c2127;color:#e8e8e8;border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:12px">${maske(text)}</textarea>
      <p><button class="knopf" type="button" onclick="navigator.clipboard.writeText(document.getElementById('text').value).then(function(){this.textContent='Kopiert'}.bind(this))">Text kopieren</button></p>
      <h2>Alle</h2>
      <ul class="termine">
${liste.map(x => `        <li><time>${wochentag(x.datum)}, ${kurz(x.datum)}${x.zeit ? ` · ${maske(x.zeit)}` : ''}</time> <a href="/oper/${encodeURIComponent(x.werk.id)}/">${maske(x.werk.title)}</a> <span class="ort">${maske(x.haus.name)}, ${maske(x.haus.city)}</span> <a class="karten" href="${maske(x.url)}" rel="nofollow noopener" target="_blank">Karten &amp; Infos</a></li>`).join('\n')}
      </ul>
      <p class="klein">"Neu" heißt: die erste Vorstellung dieser Produktion in der Spielzeit, die OpernLog kennt. Maßgeblich sind die Seiten der Häuser.</p>
    </article>
  </main>
</body>
</html>
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const ab = process.argv.find(a => a.startsWith('--ab='))?.slice(5);
    const heute = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
    const montag = wochenbeginn(ab || heute);
    const liste = neuInDerWoche(montag);
    const auswahl = fuersBild(liste);
    const text = begleittext(montag, liste);
    const ziel = path.join(WURZEL, ORDNER);
    fs.mkdirSync(ziel, { recursive: true });

    const { ladePlaywright, starteBrowser } = await import('../browser/umgebung.js');
    const pw = await ladePlaywright();
    const browser = await starteBrowser(pw.chromium);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'opernlog-woche-'));
    try {
        const seite = await browser.newPage({ viewport: { width: 1080, height: 1350 } });
        // Als Datei geöffnet: von about:blank aus lädt der Browser keine Schriften von file://.
        const html = path.join(tmp, 'woche.html');
        fs.writeFileSync(html, bildHtml(montag, auswahl, liste.length));
        await seite.goto(pathToFileURL(html).href, { waitUntil: 'networkidle' });
        await seite.evaluate(() => document.fonts.ready);
        await seite.screenshot({ path: path.join(ziel, 'bild.png'), type: 'png' });
    } finally {
        await browser.close();
        fs.rmSync(tmp, { recursive: true, force: true });
    }
    fs.writeFileSync(path.join(ziel, 'index.html'), wochenseite(montag, liste, text));
    console.log(`Woche ${zeitraum(montag)}: ${liste.length} neu, ${auswahl.length} auf dem Bild. ${ORDNER}/bild.png und ${ORDNER}/index.html geschrieben.`);
}
