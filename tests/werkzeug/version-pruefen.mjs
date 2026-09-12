// Meldet, wenn ausgelieferte Dateien geändert wurden, ohne die Version zu
// erhöhen.
//
// Die Version ist keine Zierde: sie benennt den App-Shell-Cache, und activate
// löscht jeden Cache, der anders heißt. Bleibt sie stehen, behalten alle
// Nutzer, die die App installiert haben, ihre alte Shell – online fällt das
// nicht auf, weil der fetch-Handler network-first arbeitet, offline sehr wohl.
// Und im Ladebildschirm steht dann eine Nummer, die nichts mehr über den
// Stand aussagt.
//
// Genau das ist passiert: vier Commits an einem Tag, Version vom Vortag.
// Aufgefallen ist es nicht der CI, sondern Jonas.
//
//   node tests/werkzeug/version-pruefen.mjs <basis> <spitze>
//
// In der CI sind das die beiden Enden des Pushes. Ohne Argumente wird gegen
// den vorigen Commit geprüft.
//
// Rückgabewert 0: in Ordnung. 1: Version vergessen.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { VERSION } from '../../src/version.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const [basis = 'HEAD~1', spitze = 'HEAD'] = process.argv.slice(2);

const git = (...args) =>
    execFileSync('git', args, { cwd: WURZEL, encoding: 'utf8' }).trim();

/** Was die App ausliefert: der App-Shell aus sw.js, plus der Worker selbst. */
function ausgelieferteDateien() {
    const sw = fs.readFileSync(path.join(WURZEL, 'sw.js'), 'utf8');
    const anfang = sw.indexOf('const APP_SHELL = [');
    const ende = sw.indexOf('];', anfang);
    const liste = [...sw.slice(anfang, ende).matchAll(/'([^']+)'/g)]
        .map(m => m[1].replace(/^\.\//, ''))
        .filter(p => p && p !== '/');
    // sw.js selbst steht nicht in seiner eigenen Liste.
    return new Set([...liste, 'sw.js']);
}

let geaendert;
try {
    geaendert = git('diff', '--name-only', `${basis}..${spitze}`).split('\n').filter(Boolean);
} catch (e) {
    console.error(`Konnte ${basis}..${spitze} nicht vergleichen: ${e.message}`);
    process.exit(1);
}

const ausgeliefert = ausgelieferteDateien();
const betroffen = geaendert.filter(d => ausgeliefert.has(d));

if (!betroffen.length) {
    console.log(`${geaendert.length} Dateien geändert, keine davon wird ausgeliefert. `
        + 'Die Version darf stehen bleiben.');
    process.exit(0);
}

// Nicht "wurde version.js mitgeändert": an einem Tag mit mehreren Commits
// steht die Version schon richtig und muss nicht erneut steigen. Geprüft wird
// deshalb, ob sie aktuell IST.
//
// Verglichen wird gegen das Datum des jüngsten Commits, nicht gegen "heute".
// Beides käme sonst aus verschiedenen Uhren: ein Commit um 01:14 deutscher
// Zeit trägt in UTC noch den Vortag, und ein nachgeholter Prüflauf liefe Tage
// später. Eine Toleranz von einem Tag hätte den Fall, der diesen Wächter
// veranlasst hat, gerade durchgelassen – vier Commits am 12., Version vom 11.
const alsText = (iso) => iso.slice(0, 10).replace(/-/g, '.');
const commitTag = alsText(git('show', '-s', '--format=%cd', '--date=format-local:%Y-%m-%d', spitze));

if (VERSION >= commitTag) {
    console.log(`${betroffen.length} ausgelieferte Dateien geändert, Version ${VERSION} `
        + `passt zum Commit vom ${commitTag}.`);
    process.exit(0);
}

const zeilen = betroffen.map(d => `  ${d}`).join('\n');
console.error('::error::Ausgelieferte Dateien geändert, aber die Version steht noch auf '
    + `${VERSION}, während der Commit vom ${commitTag} ist. Setze src/version.js auf `
    + `${commitTag} und CACHE_NAME in sw.js auf opernlog-${commitTag}.`);
console.error();
console.error(`Diese ${betroffen.length} ausgelieferten Dateien haben sich geändert:`);
console.error(zeilen);
console.error();
console.error('Warum das zählt: der Cache-Name trägt die Version, und activate löscht');
console.error('jeden Cache, der anders heißt. Bleibt sie stehen, behalten installierte');
console.error('Nutzer offline ihre alte App-Shell.');
process.exit(1);
