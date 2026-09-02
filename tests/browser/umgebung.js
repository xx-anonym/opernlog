// Gemeinsamer Unterbau der Browser-Tests: ein Dateiserver für das
// Projektverzeichnis und ein Chromium, das sich sowohl hier als auch auf
// GitHubs Rechnern finden lässt.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

export const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const TYPEN = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',   // ohne das lädt der Browser keine Module
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
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
