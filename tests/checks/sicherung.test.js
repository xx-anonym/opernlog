// Die Sicherung (.github/workflows/sicherung.yml) enthält fremde Daten:
// E-Mail-Adressen, Passwort-Hashes, IP-Adressen. Das Repo ist öffentlich.
// Ein unbedachter Handgriff am Workflow – ein Artefakt "zum Nachsehen", ein
// Auslöser für Pull Requests, das Hochladen vor dem Verschlüsseln – und die
// Daten lägen offen. Diese Prüfungen halten das fest.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workflow = fs.readFileSync(path.join(WURZEL, '.github/workflows/sicherung.yml'), 'utf8');
// Ohne Kommentare: dort darf von Artefakten und Pull Requests die Rede sein.
const befehle = workflow.split('\n').filter(z => !z.trim().startsWith('#')).join('\n');

test('die Sicherung startet nur nach Zeitplan oder von Hand', () => {
    const block = befehle.match(/^on:\n((?:[ \t]+.*\n|\n)*)/m);
    assert.ok(block, 'on: nicht gefunden');
    const ausloeser = [...block[1].matchAll(/^ {2}([a-z_]+):/gm)].map(m => m[1]);
    assert.deepEqual(ausloeser.sort(), ['schedule', 'workflow_dispatch'],
        'Mit anderen Auslösern (pull_request, push …) kämen fremde Änderungen an die Geheimnisse');
});

test('die Sicherung lädt nichts als Artefakt hoch – bei einem öffentlichen Repo kann das jeder laden', () => {
    assert.doesNotMatch(befehle, /upload-artifact|actions\/cache/);
});

test('nach Drive geht nur die verschlüsselte Datei', () => {
    const verschluesseln = befehle.indexOf('| age -r "$AGE_EMPFAENGER" -o "$datei"');
    const hochladen = befehle.indexOf('rclone copy "$DATEI"');
    assert.ok(verschluesseln > 0, 'Verschlüsseln mit age nicht gefunden');
    assert.ok(hochladen > verschluesseln, 'Hochgeladen wird vor dem Verschlüsseln');
    assert.match(befehle, /datei="opernlog-[^"]*\.age"/, 'Die hochgeladene Datei ist nicht die mit age verschlüsselte');
    assert.equal(befehle.match(/rclone (copy|copyto|sync|move)/g)?.length, 1, 'Ein weiterer Upload nach Drive');
});
