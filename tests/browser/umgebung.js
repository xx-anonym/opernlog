// Gemeinsamer Unterbau der Browser-Tests: ein Dateiserver für das
// Projektverzeichnis und ein Chromium, das sich sowohl hier als auch auf
// GitHubs Rechnern finden lässt.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

export const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * Liefert statt der echten Supabase-Bibliothek den Ersatz aus supabaseStub.js
 * aus. Eine Stelle für alle Tests: die Adresse hat sich schon einmal geändert
 * (früher cdn.jsdelivr.net, jetzt vendor/), und die Tests, die noch auf die
 * alte zeigten, luden daraufhin still die echte Bibliothek – sie zeigten dann
 * die Anmeldemaske statt der Seite, die sie prüfen sollten.
 *
 * Ausgenommen sind die Offline-Tests: die brauchen die echte Bibliothek, denn
 * genau deren Fehlen war der Fehler.
 */
// Ein Nachbau von Googles Skript: initialize merkt sich die Einstellungen
// (window.__gis), renderButton zeichnet einen Knopf, der beim Tippen die
// callback mit einem Token aufruft.
const GIS_NACHBAU = `window.google = { accounts: { id: {
  initialize(e) { window.__gis = [...(window.__gis || []), e]; },
  renderButton(ziel, o) {
    window.__gisKnopf = o;
    const b = document.createElement('div');
    b.className = 'gis-nachbau'; b.textContent = 'Über Google anmelden'; b.style.cssText = 'height:40px;width:' + o.width + 'px;border:1px solid #747775;border-radius:20px;background:#fff';
    b.onclick = () => window.__gis.at(-1).callback({ credential: 'google-id-token' });
    ziel.append(b);
  },
} } };`;

export async function ersetzeSupabase(page, { neuigkeit = false, google = false } = {}) {
    const { STUB } = await import('./supabaseStub.js');
    await page.route('**/vendor/supabase-js.js', r =>
        r.fulfill({ status: 200, contentType: 'text/javascript', body: STUB }));
    // Das Stück in index.html, das Fehler vor dem Start meldet, schickt
    // direkt an Supabase, ohne die Bibliothek. Aus einem Test darf nichts
    // die echte Datenbank erreichen.
    await page.route('https://*.supabase.co/**', r => r.fulfill({ status: 201, body: '' }));
    // Googles Anmeldeknopf (src/googleKnopf.js): ohne { google: true } kommt
    // das Skript nicht, und es bleibt der alte Knopf – wie ohne Netz. Mit
    // google: true ein Nachbau, der beim Tippen sofort ein Token liefert.
    await page.route('https://accounts.google.com/gsi/client', r => (google
        ? r.fulfill({ status: 200, contentType: 'text/javascript', body: GIS_NACHBAU })
        : r.abort()));
    // Bilder von Personen schlägt die App bei Wikipedia nach
    // (src/components/PersonBild.js). Aus einem Test nicht: es käme auf das
    // Netz an. Wer es braucht, legt eine eigene Route darüber – die zuletzt
    // angelegte gewinnt (personBild.test.js).
    await page.route('https://*.wikipedia.org/**', r => r.abort());
    // Das Testprofil ist von 2024 und bekäme sonst in jedem Test das Fenster
    // "Neu in OpernLog" vor die Nase. neuigkeit: true lässt es kommen.
    if (!neuigkeit) {
        const { NEUIGKEIT, NEUIGKEIT_GESEHEN } = await import('../../src/neuigkeiten.js');
        await page.addInitScript(([k, id]) => { try { localStorage.setItem(k, id); } catch { /* egal */ } }, [NEUIGKEIT_GESEHEN, NEUIGKEIT.id]);
    }
}

/**
 * Wartet, bis der Vorhang des Ladebildschirms aufgeht. Bis dahin fängt er
 * jeden Klick ab, auch wenn die Seite dahinter schon steht. Playwright
 * wiederholt den Klick dann und scrollt den Knopf dabei jedes Mal etwas
 * anders ins Bild. Weil die Seite weich scrollt (scroll-behavior: smooth),
 * misst es unter Last mitten in der Bewegung und klickt daneben – im
 * Passkeys-Test 19 Pixel über "Profil bearbeiten", das Fenster ging nie auf.
 * Mit gehobenem Vorhang sitzt schon der erste Klick, gescrollt wird nicht.
 */
export async function vorhangAuf(page) {
    await page.waitForFunction(() => !document.querySelector('#splash:not(.splash--hidden)'));
}

const TYPEN = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',   // ohne das lädt der Browser keine Module
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.ics': 'text/calendar; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.mp3': 'audio/mpeg',
};

/** Statischer Server auf einem freien Port. Gibt {url, schliessen} zurück. */
export async function starteServer() {
    const server = http.createServer((req, res) => {
        const pfad = decodeURIComponent(req.url.split('?')[0]);
        const datei = path.join(WURZEL, pfad === '/' ? 'index.html' : pfad);
        // Kein Ausbruch aus dem Projektverzeichnis.
        if (!datei.startsWith(WURZEL) || !fs.existsSync(datei) || fs.statSync(datei).isDirectory()) {
            res.writeHead(404).end('nicht gefunden');
            return;
        }
        res.writeHead(200, { 'Content-Type': TYPEN[path.extname(datei)] || 'application/octet-stream' });
        fs.createReadStream(datei).pipe(res);
    });

    await new Promise(fertig => server.listen(0, '127.0.0.1', fertig));
    const { port } = server.address();
    return {
        url: `http://127.0.0.1:${port}`,
        schliessen: () => new Promise(fertig => server.close(fertig)),
    };
}

/**
 * Playwright laden – als Projektabhängigkeit (tests/browser/package.json) oder
 * global installiert. Gibt null zurück, wenn es nicht da ist; die Tests
 * überspringen sich dann, statt fehlzuschlagen.
 */
export async function ladePlaywright() {
    // Playwright ist ein CommonJS-Paket: je nach Weg landet es unter .default
    // statt direkt im Namensraum. Beide Formen werden hier auf dieselbe
    // gebracht, sonst ist chromium undefined und die Ursache schwer zu sehen.
    const auspacken = (m) => (m?.chromium ? m : m?.default) || null;

    // In dieser Reihenfolge, weil ESM-Importe NODE_PATH nicht beachten: ein
    // blanker import findet nur, was neben dem aufrufenden Modul liegt. Der
    // zweite Weg ist der in der CI – dort wird in tests/browser/ installiert,
    // der Testlauf startet aber im Wurzelverzeichnis.
    const wege = [
        'playwright',
        pathToFileURL(path.join(WURZEL, 'tests/browser/node_modules/playwright/index.js')).href,
    ];

    for (const weg of wege) {
        try {
            const m = auspacken(await import(weg));
            if (m) return m;
        } catch { /* nächster Weg */ }
    }

    // Zuletzt eine globale Installation – so läuft es auf manchem
    // Entwicklungsrechner.
    try {
        const global = execSync('npm root -g', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        return auspacken(await import(pathToFileURL(path.join(global, 'playwright', 'index.js')).href));
    } catch {
        return null;
    }
}

/**
 * Chromium starten. Auf GitHubs Rechnern liegt es dort, wo Playwright es
 * selbst hingelegt hat; in der Entwicklungsumgebung unter /opt/pw-browsers.
 */
export async function starteBrowser(chromium) {
    try {
        return await chromium.launch();
    } catch (e) {
        const fest = '/opt/pw-browsers/chromium';
        if (!fs.existsSync(fest)) throw e;
        return await chromium.launch({ executablePath: fest });
    }
}
