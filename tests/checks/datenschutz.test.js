// Die Datenschutzerklärung (src/pages/Datenschutz.js) muss beschreiben, was
// die App tut. Eine Prüfung kann das nicht ganz – aber sie merkt, wenn die
// App einen fremden Dienst anspricht, den die Seite nicht nennt, und wenn
// die Kontaktadresse fehlt.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { KONTAKT } from '../../src/pages/Datenschutz.js';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const seite = fs.readFileSync(path.join(WURZEL, 'src/pages/Datenschutz.js'), 'utf8');

test('die Datenschutzseite nennt eine Kontaktadresse', () => {
    assert.match(KONTAKT, /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i, 'KONTAKT in src/pages/Datenschutz.js fehlt');
});

test('jeder fremde Dienst, den die App im Browser anspricht, steht auf der Seite', () => {
    // Die Dienste für die grobe Ortung über die IP-Adresse.
    const utils = fs.readFileSync(path.join(WURZEL, 'src/utils.js'), 'utf8');
    const block = utils.match(/const IP_SERVICES = \[([\s\S]*?)\];/);
    assert.ok(block, 'IP_SERVICES nicht gefunden');
    const hosts = [...block[1].matchAll(/https:\/\/([^/'"]+)/g)].map(m => m[1].replace(/^(get|www|api)\./, ''));
    assert.ok(hosts.length > 0);
    for (const host of hosts) assert.ok(seite.includes(host), `${host} fehlt auf der Datenschutzseite`);

    // Dauerhaft angesprochen: Hosting, Datenbank, Bilder, Google-Anmeldung, Push, Passwortprüfung.
    for (const name of ['Vercel', 'Supabase', 'Wikimedia', 'Google', 'Push-Dienste', 'Have I Been Pwned']) {
        assert.ok(seite.includes(name), `${name} fehlt auf der Datenschutzseite`);
    }
});
