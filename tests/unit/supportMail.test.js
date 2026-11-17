// Der mailto-Link für Feedback und Fehler (supportMailLink in src/utils.js).
// Er öffnet das eigene Mailprogramm mit Empfänger, Betreff und den Angaben,
// nach denen sonst als Erstes gefragt wird: Version, Seite, Gerät.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { supportMailLink } from '../../src/utils.js';
import { SUPPORT_ADRESSE } from '../../src/config.js';
import { KONTAKT } from '../../src/pages/Datenschutz.js';
import { VERSION } from '../../src/version.js';

const UMGEBUNG = { location: { hash: '#/visit/abc' }, navigator: { userAgent: 'Mozilla/5.0 (iPhone)' } };

function zerlegen(link) {
    const [vorne, abfrage] = link.split('?');
    const p = new URLSearchParams(abfrage.replace(/\+/g, '%2B'));
    return { an: vorne.replace(/^mailto:/, ''), betreff: p.get('subject'), text: p.get('body') };
}

test('Feedback: an support@, mit Version, Seite und Gerät', () => {
    const m = zerlegen(supportMailLink({ umgebung: UMGEBUNG }));
    assert.equal(m.an, 'support@opernlog.de');
    assert.equal(m.betreff, 'OpernLog: Feedback');
    assert.match(m.text, new RegExp(`^Version: ${VERSION.replace(/\./g, '\\.')}$`, 'm'));
    assert.match(m.text, /^Seite: #\/visit\/abc$/m);
    assert.match(m.text, /^Gerät: Mozilla\/5\.0 \(iPhone\)$/m);
    assert.doesNotMatch(m.text, /Fehler:/);
});

test('Fehler: eigener Betreff, die Meldung steht im Text', () => {
    const m = zerlegen(supportMailLink({ fehler: 'Like konnte nicht gespeichert werden – 500 & mehr', umgebung: UMGEBUNG }));
    assert.equal(m.betreff, 'OpernLog: Fehler');
    assert.match(m.text, /^Fehler: Like konnte nicht gespeichert werden – 500 & mehr$/m);
    assert.match(m.text, /^Was hast du gerade gemacht\?/);
});

test('Sonderzeichen brechen den Link nicht auf', () => {
    // & und ? in der Meldung dürfen keinen weiteren Parameter anfangen.
    const link = supportMailLink({ fehler: 'a&cc=fremd@example.org?x', umgebung: UMGEBUNG });
    assert.doesNotMatch(link, /[&?]cc=/);
    assert.equal(zerlegen(link).an, SUPPORT_ADRESSE);
});

test('die Datenschutzseite nennt dieselbe Adresse', () => {
    assert.equal(KONTAKT, SUPPORT_ADRESSE);
});
