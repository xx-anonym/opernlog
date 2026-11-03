// SMTP und Mailaufbau der Edge Function mail-senden.
//
// Ein gespielter Mailserver antwortet wie Gmail auf Port 465. Geprüft wird der
// Ablauf Befehl für Befehl, dass die Anmeldung stimmt und nirgends im Fehler
// steht, dass ein Punkt am Zeilenanfang die Nachricht nicht beendet, und dass
// ein Name mit Zeilenumbruch keine Kopfzeile einschleust.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { smtpSenden, SmtpFehler, punktieren, adresseGueltig, base64 } from '../../supabase/functions/mail-senden/smtp.js';
import { nachrichtBauen, betreffKodiert } from '../../supabase/functions/mail-senden/nachricht.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

/**
 * Ein Mailserver zum Mitlesen. antworten: je Befehl die Antwort (ohne die
 * Begrüßung, die kommt von selbst). stueckeln: Antworten byteweise liefern.
 */
function server({ antworten = {}, stueckeln = false } = {}) {
    const standard = {
        EHLO: '250-smtp.gmail.com at your service\r\n250-SIZE 35882577\r\n250-AUTH LOGIN PLAIN XOAUTH2\r\n250 SMTPUTF8\r\n',
        AUTH: '235 2.7.0 Accepted\r\n',
        MAIL: '250 2.1.0 OK\r\n',
        RCPT: '250 2.1.5 OK\r\n',
        DATA: '354 Go ahead\r\n',
        NACHRICHT: '250 2.0.0 OK 1730000000 abc.123 - gsmtp\r\n',
        QUIT: '221 2.0.0 closing connection\r\n',
        ...antworten,
    };
    const befehle = [];
    let ausgang = [enc.encode('220 smtp.gmail.com ESMTP ready\r\n')];
    let geschlossen = false;
    let inDaten = false;
    let datenPuffer = '';

    function antworte(text) {
        const bytes = enc.encode(text);
        ausgang.push(...(stueckeln ? [...bytes].map(b => Uint8Array.of(b)) : [bytes]));
    }

    return {
        befehle,
        get geschlossen() { return geschlossen; },
        verbindung: {
            async lesen() { return ausgang.length ? ausgang.shift() : null; },
            async schreiben(bytes) {
                const text = dec.decode(bytes);
                if (inDaten) {
                    datenPuffer += text;
                    if (datenPuffer.endsWith('\r\n.\r\n')) {
                        befehle.push({ befehl: 'NACHRICHT', text: datenPuffer });
                        inDaten = false;
                        antworte(standard.NACHRICHT);
                    }
                    return;
                }
                const zeile = text.replace(/\r\n$/, '');
                const name = zeile.split(/[ :]/)[0];
                befehle.push({ befehl: name, text: zeile });
                antworte(standard[name] || '500 unbekannt\r\n');
                if (name === 'DATA' && standard.DATA.startsWith('354')) inDaten = true;
            },
            schliessen() { geschlossen = true; },
        },
    };
}

const GRUND = { benutzer: 'opernlog.app@gmail.com', passwort: 'abcdefghijklmnop', von: 'opernlog.app@gmail.com', an: 'fan@example.org' };

test('der ganze Ablauf, Befehl für Befehl', async () => {
    const s = server();
    await smtpSenden(s.verbindung, { ...GRUND, nachricht: 'Subject: x\r\n\r\nHallo' });
    assert.deepEqual(s.befehle.map(b => b.befehl), ['EHLO', 'AUTH', 'MAIL', 'RCPT', 'DATA', 'NACHRICHT', 'QUIT']);
    assert.equal(s.befehle[0].text, 'EHLO opernlog.vercel.app');
    assert.equal(s.befehle[2].text, 'MAIL FROM:<opernlog.app@gmail.com>');
    assert.equal(s.befehle[3].text, 'RCPT TO:<fan@example.org>');
    assert.ok(s.geschlossen, 'Verbindung nicht geschlossen');
});

test('AUTH PLAIN: Benutzer und Passwort, durch Nullbytes getrennt', async () => {
    const s = server();
    await smtpSenden(s.verbindung, { ...GRUND, nachricht: 'x' });
    const [, , kodiert] = s.befehle[1].text.split(' ');
    assert.equal(Buffer.from(kodiert, 'base64').toString('utf8'), '\0opernlog.app@gmail.com\0abcdefghijklmnop');
});

test('Antworten, die in Einzelbytes ankommen, werden richtig zusammengesetzt', async () => {
    const s = server({ stueckeln: true, antworten: { EHLO: '250-grüße aus Zürich\r\n250 OK\r\n' } });
    await smtpSenden(s.verbindung, { ...GRUND, nachricht: 'x' });
    assert.equal(s.befehle.at(-1).befehl, 'QUIT');
});

test('ein Punkt am Zeilenanfang beendet die Nachricht nicht', async () => {
    assert.equal(punktieren('a\n.\nb\r\n..c'), 'a\r\n..\r\nb\r\n...c');
    const s = server();
    await smtpSenden(s.verbindung, { ...GRUND, nachricht: 'Subject: x\r\n\r\nZeile\r\n.\r\nnoch da' });
    const daten = s.befehle.find(b => b.befehl === 'NACHRICHT').text;
    assert.ok(daten.includes('\r\n..\r\nnoch da'), daten);
    assert.ok(daten.endsWith('noch da\r\n.\r\n'));
});

test('abgelehnte Anmeldung: Fehler mit Schritt und Code, ohne Passwort, Verbindung zu', async () => {
    const s = server({ antworten: { AUTH: '535-5.7.8 Username and Password not accepted.\r\n535 5.7.8 BadCredentials\r\n' } });
    await assert.rejects(
        () => smtpSenden(s.verbindung, { ...GRUND, nachricht: 'x' }),
        (e) => {
            assert.ok(e instanceof SmtpFehler);
            assert.equal(e.schritt, 'Anmeldung');
            assert.equal(e.code, 535);
            assert.ok(!e.message.includes(GRUND.passwort) && !e.message.includes(base64(`\0${GRUND.benutzer}\0${GRUND.passwort}`)));
            return true;
        });
    assert.deepEqual(s.befehle.map(b => b.befehl), ['EHLO', 'AUTH'], 'nach der Ablehnung weitergemacht');
    assert.ok(s.geschlossen);
});

test('abgelehnter Empfänger bricht vor dem Text ab', async () => {
    const s = server({ antworten: { RCPT: '550 5.1.1 The email account that you tried to reach does not exist\r\n' } });
    await assert.rejects(() => smtpSenden(s.verbindung, { ...GRUND, nachricht: 'x' }), { name: 'SmtpFehler', code: 550 });
    assert.ok(!s.befehle.some(b => b.befehl === 'DATA'));
});

test('Verbindung reißt ab: verständlicher Fehler statt Hängen', async () => {
    const s = server();
    s.verbindung.lesen = async () => null;
    await assert.rejects(() => smtpSenden(s.verbindung, { ...GRUND, nachricht: 'x' }), /geschlossen/);
});

test('Adressen, mit denen sich ein Befehl einschleusen ließe, werden abgelehnt', async () => {
    for (const an of ['a@b.de>\r\nRCPT TO:<c@d.de', 'a b@c.de', '<a@b.de>', 'kein-at.de', '', null]) {
        assert.equal(adresseGueltig(an), false, String(an));
        const s = server();
        await assert.rejects(() => smtpSenden(s.verbindung, { ...GRUND, an, nachricht: 'x' }), /Empfänger/);
        assert.deepEqual(s.befehle, [], 'trotz ungültiger Adresse geschrieben');
    }
    assert.ok(adresseGueltig('jonasschilberg+mueller@gmail.com'));
});

// ── Aufbau der Mail ───────────────────────────────────────────────────────

const decodeWords = (kopf) => kopf.split(/\r\n /).map(w => {
    const m = w.match(/^=\?UTF-8\?B\?([^?]*)\?=$/);
    assert.ok(m, `kein encoded word: ${w}`);
    return Buffer.from(m[1], 'base64').toString('utf8');
}).join('');

test('Betreff mit Umlauten: kurze kodierte Wörter, verlustfrei zurück', () => {
    const betreff = 'Sängerin Grüße möchte mit dir befreundet sein – ♪ Tosca, Rosenkavalier & Co.';
    const kodiert = betreffKodiert(betreff);
    for (const wort of kodiert.split('\r\n ')) assert.ok(wort.length <= 75, wort);
    assert.equal(decodeWords(kodiert), betreff);
});

function teile(nachricht) {
    const ende = nachricht.indexOf('\r\n\r\n');
    const kopf = nachricht.slice(0, ende);
    const rumpf = nachricht.slice(ende + 4);
    const grenze = kopf.match(/boundary="([^"]+)"/)[1];
    const stuecke = rumpf.split(`--${grenze}`).slice(1, -1).map(t => {
        const t2 = t.replace(/^\r\n/, '');
        const k = t2.slice(0, t2.indexOf('\r\n\r\n'));
        const inhalt = t2.slice(t2.indexOf('\r\n\r\n') + 4);
        return { kopf: k, text: Buffer.from(inhalt.replace(/\r\n/g, ''), 'base64').toString('utf8') };
    });
    return { kopf, rumpf, grenze, stuecke };
}

const NACHRICHT = {
    von: 'opernlog.app@gmail.com', an: 'fan@example.org', betreff: 'Anna möchte mit dir befreundet sein',
    text: 'Anna möchte auf OpernLog mit dir befreundet sein.', html: '<p>Anna möchte – mit dir</p>',
    id: '0f0e-abc@opernlog.vercel.app', datum: new Date(Date.UTC(2026, 10, 2, 22, 45)),
};

test('Kopfzeilen, Klartext und HTML als Alternativen', () => {
    const { kopf, rumpf, stuecke } = teile(nachrichtBauen(NACHRICHT));
    assert.match(kopf, /^From: OpernLog <opernlog\.app@gmail\.com>$/m);
    assert.match(kopf, /^To: <fan@example\.org>$/m);
    assert.match(kopf, /^Date: Mon, 02 Nov 2026 22:45:00 \+0000$/m);
    assert.match(kopf, /^Message-ID: <0f0e-abc@opernlog\.vercel\.app>$/m);
    assert.match(kopf, /^Auto-Submitted: auto-generated$/m);
    assert.equal(decodeWords(kopf.match(/^Subject: ([\s\S]*?)\r\n(?=[A-Z])/m)[1]), NACHRICHT.betreff);
    assert.deepEqual(stuecke.map(s => s.kopf.split('\r\n')[0]), ['Content-Type: text/plain; charset=utf-8', 'Content-Type: text/html; charset=utf-8']);
    assert.equal(stuecke[0].text, NACHRICHT.text);
    assert.equal(stuecke[1].text, NACHRICHT.html);
    for (const zeile of rumpf.split('\r\n')) assert.ok(zeile.length <= 76, zeile);
});

test('ein Name mit Zeilenumbruch schleust keine Kopfzeile ein', () => {
    const boese = nachrichtBauen({ ...NACHRICHT, betreff: 'Anna\r\nBcc: alle@example.org\r\n möchte' });
    const { kopf } = teile(boese);
    assert.ok(!/^Bcc:/mi.test(kopf), kopf);
});

test('ungültige Adressen oder Message-ID lassen sich gar nicht erst bauen', () => {
    assert.throws(() => nachrichtBauen({ ...NACHRICHT, an: 'a@b.de\r\nBcc: x@y.de' }), /Adresse/);
    assert.throws(() => nachrichtBauen({ ...NACHRICHT, id: 'a b@c' }), /Message-ID/);
    assert.throws(() => nachrichtBauen({ ...NACHRICHT, vonName: 'Opern\r\nLog' }), /Absendername/);
});
