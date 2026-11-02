// Eine Mail als Text, so wie sie nach "DATA" über die Leitung geht (RFC 5322
// mit MIME): Kopfzeilen, dann Klartext und HTML als Alternativen.
//
// Alles Nicht-ASCII ist kodiert – der Betreff als "encoded word", die Teile
// als Base64. Damit kann auch ein Benutzername mit Umlauten oder Zeilenumbruch
// weder den Betreff zerbrechen noch eine Kopfzeile einschleusen.

import { adresseGueltig, base64 } from './smtp.js';

const ZEILE = '\r\n';

/** Base64 in Zeilen zu 76 Zeichen, wie MIME es verlangt. */
function base64Zeilen(text) {
    return base64(text).replace(/.{1,76}/g, z => z + ZEILE).trimEnd();
}

/**
 * Der Betreff als "encoded words" (RFC 2047). Jedes Wort höchstens 75 Zeichen:
 * zehn Zeichen Text sind höchstens 40 Byte UTF-8, also 56 Zeichen Base64.
 */
export function betreffKodiert(betreff) {
    const zeichen = [...String(betreff).replace(/[\r\n]+/g, ' ')];
    const woerter = [];
    for (let i = 0; i < zeichen.length; i += 10) {
        woerter.push(`=?UTF-8?B?${base64(zeichen.slice(i, i + 10).join(''))}?=`);
    }
    return woerter.join(`${ZEILE} `) || '=?UTF-8?B??=';
}

/** Datum wie in Kopfzeilen üblich: "Mon, 02 Nov 2026 22:45:00 +0000". */
function datumKopf(datum) {
    return datum.toUTCString().replace('GMT', '+0000');
}

/**
 * @param {object} o
 * @param {string} o.von        Absenderadresse
 * @param {string} [o.vonName]  Anzeigename des Absenders, nur ASCII
 * @param {string} o.an         Empfängeradresse
 * @param {string} o.betreff
 * @param {string} o.text       Klartext
 * @param {string} o.html
 * @param {string} o.id         Message-ID ohne spitze Klammern, z. B. uuid@opernlog.vercel.app
 * @param {Date}   [o.datum]
 * @param {string} [o.grenze]   Trenner der MIME-Teile (für Tests festlegbar)
 */
export function nachrichtBauen({ von, vonName = 'OpernLog', an, betreff, text, html, id, datum = new Date(), grenze }) {
    if (!adresseGueltig(von) || !adresseGueltig(an)) throw new Error('Ungültige Adresse');
    if (!/^[A-Za-z0-9 .-]+$/.test(vonName)) throw new Error('Absendername nur aus Buchstaben, Ziffern, Leerzeichen');
    if (!/^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$/.test(id || '')) throw new Error('Ungültige Message-ID');
    const trenner = grenze || `opernlog-${id.split('@')[0]}`;

    return [
        `From: ${vonName} <${von}>`,
        `To: <${an}>`,
        `Subject: ${betreffKodiert(betreff)}`,
        `Date: ${datumKopf(datum)}`,
        `Message-ID: <${id}>`,
        'MIME-Version: 1.0',
        // Automatisch verschickt: Abwesenheitsnotizen sollen nicht antworten.
        'Auto-Submitted: auto-generated',
        'X-Auto-Response-Suppress: All',
        `Content-Type: multipart/alternative; boundary="${trenner}"`,
        '',
        `--${trenner}`,
        'Content-Type: text/plain; charset=utf-8',
        'Content-Transfer-Encoding: base64',
        '',
        base64Zeilen(text),
        `--${trenner}`,
        'Content-Type: text/html; charset=utf-8',
        'Content-Transfer-Encoding: base64',
        '',
        base64Zeilen(html),
        `--${trenner}--`,
        '',
    ].join(ZEILE);
}
