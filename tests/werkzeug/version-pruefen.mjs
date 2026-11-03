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

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Was die App ausliefert: der App-Shell aus sw.js, plus der Worker selbst. */
export function ausgelieferteDateien(sw) {
    const anfang = sw.indexOf('const APP_SHELL = [');
    const ende = sw.indexOf('];', anfang);
    const liste = [...sw.slice(anfang, ende).matchAll(/'([^']+)'/g)]
        .map(m => m[1].replace(/^\.\//, ''))
        .filter(p => p && p !== '/');
    // sw.js selbst steht nicht in seiner eigenen Liste.
    return new Set([...liste, 'sw.js']);
}

/** Die Version aus dem Text von src/version.js, oder '' ohne. */
export function versionAus(text) {
    return /VERSION\s*=\s*'([^']+)'/.exec(text || '')?.[1] || '';
}

/**
 * Das Urteil, ohne git: in Ordnung, wenn keine ausgelieferte Datei geändert
 * wurde, oder wenn die Version in diesem Push gestiegen ist, oder wenn sie
 * schon so aktuell ist wie der Commit.
 *
 * Gestiegen reicht, auch wenn das Datum dahinter zurückliegt: ein Zweig, der
 * am 2. die Version auf den 2. setzt und am 3. gemergt wird, gibt dem Cache
 * trotzdem einen neuen Namen – genau darauf kommt es an. So fiel der Merge
 * von #11 durch, obwohl er die Version von 2026.10.31 auf 2026.11.02 hob.
 *
 * Nicht gestiegen, dann gilt das Datum: an einem Tag mit mehreren Pushes
 * steht die Version schon richtig und muss nicht erneut steigen. Steht sie
 * dagegen auf einem Tag vor dem Commit, ist der Cache-Name derselbe wie
 * vorher – der Fall, der diesen Wächter veranlasst hat (vier Commits am 12.,
 * Version vom 11., keiner hob sie). Auch zwei Zweige, die beide denselben Tag
 * eintragen, fallen so auf: beim zweiten Merge steigt nichts mehr.
 *
 * Verglichen wird gegen das Datum des jüngsten Commits, nicht gegen "heute".
 * Beides käme sonst aus verschiedenen Uhren: ein Commit um 01:14 deutscher
 * Zeit trägt in UTC noch den Vortag, und ein nachgeholter Prüflauf liefe Tage
 * später.
 *
 * Versionen sind JJJJ.MM.TT; als Text verglichen ordnen sie sich wie Daten.
 */
export function urteil({ geaendert, ausgeliefert, vorher, jetzt, commitTag }) {
    const betroffen = geaendert.filter(d => ausgeliefert.has(d));
    if (!betroffen.length) return { ok: true, grund: 'nichts ausgeliefert', betroffen };
    if (jetzt > vorher) return { ok: true, grund: 'erhöht', betroffen };
    if (jetzt >= commitTag) return { ok: true, grund: 'aktuell', betroffen };
    return { ok: false, grund: 'vergessen', betroffen };
}

function pruefen(basis, spitze) {
    const git = (...args) =>
        execFileSync('git', args, { cwd: WURZEL, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    // Eine Datei, die es in dem Commit nicht gibt, ist leer.
    const datei = (rev, pfad) => { try { return git('show', `${rev}:${pfad}`); } catch { return ''; } };

    let geaendert;
    try {
        geaendert = git('diff', '--name-only', `${basis}..${spitze}`).split('\n').filter(Boolean);
    } catch (e) {
        console.error(`Konnte ${basis}..${spitze} nicht vergleichen: ${e.message}`);
        return 1;
    }

    const alsText = (iso) => iso.slice(0, 10).replace(/-/g, '.');
    const vorher = versionAus(datei(basis, 'src/version.js'));
    const jetzt = versionAus(datei(spitze, 'src/version.js'));
    const commitTag = alsText(git('show', '-s', '--format=%cd', '--date=format-local:%Y-%m-%d', spitze));
    const u = urteil({
        geaendert, ausgeliefert: ausgelieferteDateien(datei(spitze, 'sw.js')), vorher, jetzt, commitTag,
    });

    if (u.grund === 'nichts ausgeliefert') {
        console.log(`${geaendert.length} Dateien geändert, keine davon wird ausgeliefert. `
            + 'Die Version darf stehen bleiben.');
        return 0;
    }
    if (u.grund === 'erhöht') {
        console.log(`${u.betroffen.length} ausgelieferte Dateien geändert, Version von ${vorher} `
            + `auf ${jetzt} erhöht.`);
        return 0;
    }
    if (u.grund === 'aktuell') {
        console.log(`${u.betroffen.length} ausgelieferte Dateien geändert, Version ${jetzt} `
            + `passt zum Commit vom ${commitTag}.`);
        return 0;
    }

    const zeilen = u.betroffen.map(d => `  ${d}`).join('\n');
    console.error('::error::Ausgelieferte Dateien geändert, aber die Version steht noch auf '
        + `${jetzt}, während der Commit vom ${commitTag} ist. Setze src/version.js auf `
        + `${commitTag} und CACHE_NAME in sw.js auf opernlog-${commitTag}.`);
    console.error();
    console.error(`Diese ${u.betroffen.length} ausgelieferten Dateien haben sich geändert:`);
    console.error(zeilen);
    console.error();
    console.error('Warum das zählt: der Cache-Name trägt die Version, und activate löscht');
    console.error('jeden Cache, der anders heißt. Bleibt sie stehen, behalten installierte');
    console.error('Nutzer offline ihre alte App-Shell.');
    return 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const [basis = 'HEAD~1', spitze = 'HEAD'] = process.argv.slice(2);
    process.exit(pruefen(basis, spitze));
}
