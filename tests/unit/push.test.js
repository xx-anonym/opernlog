// Push auf diesem Gerät: kann der Browser es, und das Ein- und Ausschalten.
//
// Ohne echten Push-Dienst: der Browser wird als "umgebung" hineingereicht.
// Geprüft wird vor allem, was schiefgehen kann, ohne dass es jemand merkt –
// ein iPhone im Safari-Tab, ein altes Abo mit fremdem Schlüssel, ein Abmelden,
// das am Abo scheitert.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { pushZustand, schluesselZuBytes, pushEinschalten, pushAusschalten, pushAn, pushBeimAbmelden }
    from '../../src/push.js';

const SCHLUESSEL = 'BJjAqw6svCgTxnYuAjvx6g2GzSFlqdeBl4v-uIwfl-9597T6bg3pP02CqBV9EZsfpCVtg6PGSa2tzrekGxi3jnI';

/** Ein Browser mit Push, in dem sich alles mitverfolgen lässt. */
function browser({ erlaubnis = 'default', antwort = 'granted', aboMit = null, aboAdresse, ua = 'Mozilla/5.0 (Macintosh)', standalone = false } = {}) {
    const protokoll = { abonniert: [], abbestellt: 0, gefragt: 0 };
    let aktuell = null;
    const machAbo = (schluessel, endpoint = 'https://web.push.apple.com/QGeraet') => ({
        options: { applicationServerKey: schluessel.buffer },
        toJSON: () => ({ endpoint, keys: { p256dh: 'P'.repeat(87), auth: 'A'.repeat(22) } }),
        unsubscribe: async () => { protokoll.abbestellt++; aktuell = null; return true; },
    });
    // Ein schon vorhandenes Abo, mit diesem Schlüssel angelegt.
    if (aboMit) aktuell = machAbo(aboMit, aboAdresse);
    const pushManager = {
        getSubscription: async () => aktuell,
        subscribe: async ({ applicationServerKey, userVisibleOnly }) => {
            assert.equal(userVisibleOnly, true, 'Safari und Chrome verlangen userVisibleOnly');
            protokoll.abonniert.push(applicationServerKey);
            aktuell = machAbo(applicationServerKey);
            return aktuell;
        },
    };
    const umgebung = {
        navigator: { userAgent: ua, standalone, serviceWorker: { ready: Promise.resolve({ pushManager }) } },
        PushManager: function () {},
        Notification: {
            permission: erlaubnis,
            requestPermission: async () => { protokoll.gefragt++; umgebung.Notification.permission = antwort; return antwort; },
        },
        matchMedia: () => ({ matches: standalone }),
    };
    return { umgebung, protokoll };
}

function datenbank() {
    const db = { gespeichert: [], geloescht: [] };
    db.dienste = {
        schluessel: async () => SCHLUESSEL,
        speichern: async (a) => { db.gespeichert.push(a); },
        loeschen: async (e) => { db.geloescht.push(e); },
    };
    return db;
}

// ── Was das Gerät kann ────────────────────────────────────────────────────

test('ein iPhone im Safari-Tab soll OpernLog erst installieren', () => {
    // Safari zeigt dort weder PushManager noch Notification.
    const umgebung = { navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X)', serviceWorker: {} }, matchMedia: () => ({ matches: false }) };
    assert.equal(pushZustand(umgebung), 'installieren');
});

test('ein iPad gibt sich als Mac aus und wird trotzdem erkannt', () => {
    const umgebung = { navigator: { userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5, serviceWorker: {} }, matchMedia: () => ({ matches: false }) };
    assert.equal(pushZustand(umgebung), 'installieren');
});

test('ohne Push und ohne iPhone gibt es den Bereich gar nicht', () => {
    assert.equal(pushZustand({ navigator: { userAgent: 'Firefox', serviceWorker: {} }, matchMedia: () => ({ matches: false }) }), 'unmoeglich');
    assert.equal(pushZustand({ navigator: {} }), 'unmoeglich');
});

test('installiert auf dem iPhone ist es bereit', () => {
    const { umgebung } = browser({ ua: 'Mozilla/5.0 (iPhone)', standalone: true });
    assert.equal(pushZustand(umgebung), 'bereit');
});

test('in den Einstellungen blockiert heißt verweigert', () => {
    assert.equal(pushZustand(browser({ erlaubnis: 'denied' }).umgebung), 'verweigert');
});

test('der Schlüssel wird zu 65 Bytes, beginnend mit 0x04', () => {
    const b = schluesselZuBytes(SCHLUESSEL);
    assert.equal(b.length, 65);
    assert.equal(b[0], 4);
});

// ── Ein- und Ausschalten ─────────────────────────────────────────────────

test('einschalten fragt, abonniert mit unserem Schlüssel und legt das Abo ab', async () => {
    const b = browser();
    const db = datenbank();
    assert.equal(await pushEinschalten({ schluessel: SCHLUESSEL, umgebung: b.umgebung, dienste: db.dienste }), 'an');
    assert.equal(b.protokoll.gefragt, 1);
    assert.deepEqual([...b.protokoll.abonniert[0]], [...schluesselZuBytes(SCHLUESSEL)]);
    assert.equal(db.gespeichert.length, 1);
    assert.equal(db.gespeichert[0].endpoint, 'https://web.push.apple.com/QGeraet');
    assert.equal(db.gespeichert[0].p256dh.length, 87);
});

test('wer die Erlaubnis verweigert, bekommt kein Abo', async () => {
    const b = browser({ antwort: 'denied' });
    const db = datenbank();
    assert.equal(await pushEinschalten({ schluessel: SCHLUESSEL, umgebung: b.umgebung, dienste: db.dienste }), 'verweigert');
    assert.deepEqual(b.protokoll.abonniert, []);
    assert.deepEqual(db.gespeichert, []);
});

test('wer die Frage wegwischt, bleibt bei aus', async () => {
    const b = browser({ antwort: 'default' });
    const db = datenbank();
    assert.equal(await pushEinschalten({ schluessel: SCHLUESSEL, umgebung: b.umgebung, dienste: db.dienste }), 'aus');
    assert.deepEqual(db.gespeichert, []);
});

test('ein altes Abo mit fremdem Schlüssel wird ersetzt', async () => {
    // Sonst nähme der Push-Dienst keine einzige Mitteilung dafür an.
    const b = browser({ erlaubnis: 'granted', aboMit: new Uint8Array(65).fill(7), aboAdresse: 'https://web.push.apple.com/QAlt' });
    const db = datenbank();
    await pushEinschalten({ schluessel: SCHLUESSEL, umgebung: b.umgebung, dienste: db.dienste });
    assert.equal(b.protokoll.abbestellt, 1, 'das alte Abo blieb stehen');
    assert.equal(b.protokoll.abonniert.length, 1);
});

test('ein passendes Abo wird weiterbenutzt', async () => {
    const b = browser({ erlaubnis: 'granted', aboMit: schluesselZuBytes(SCHLUESSEL) });
    const db = datenbank();
    await pushEinschalten({ schluessel: SCHLUESSEL, umgebung: b.umgebung, dienste: db.dienste });
    assert.equal(b.protokoll.abbestellt, 0);
    assert.equal(b.protokoll.abonniert.length, 0);
    assert.equal(db.gespeichert.length, 1, 'das Abo muss trotzdem in die Datenbank');
});

test('ohne vorab geholten Schlüssel wird er beim Einschalten geholt', async () => {
    const b = browser();
    const db = datenbank();
    assert.equal(await pushEinschalten({ umgebung: b.umgebung, dienste: db.dienste }), 'an');
    assert.equal(b.protokoll.abonniert.length, 1);
});

test('ausschalten entfernt das Abo aus Datenbank und Browser', async () => {
    const b = browser({ erlaubnis: 'granted', aboMit: schluesselZuBytes(SCHLUESSEL) });
    const db = datenbank();
    await pushAusschalten({ umgebung: b.umgebung, dienste: db.dienste });
    assert.deepEqual(db.geloescht, ['https://web.push.apple.com/QGeraet']);
    assert.equal(b.protokoll.abbestellt, 1);
});

test('ist das Abo im Browser da, legt pushAn es erneut ab', async () => {
    // Es kann in der Datenbank fehlen: ein anderes Konto war auf dem Gerät
    // angemeldet, oder der Push-Dienst hat es einmal verworfen.
    const b = browser({ erlaubnis: 'granted', aboMit: schluesselZuBytes(SCHLUESSEL) });
    const db = datenbank();
    assert.equal(await pushAn({ umgebung: b.umgebung, dienste: db.dienste }), true);
    assert.equal(db.gespeichert.length, 1);
    assert.equal(await pushAn({ umgebung: browser().umgebung, dienste: db.dienste }), false, 'ohne Erlaubnis ist nichts an');
});

test('beim Abmelden verschwindet das Abo – und ein Fehler hält das Abmelden nicht auf', async () => {
    const b = browser({ erlaubnis: 'granted', aboMit: schluesselZuBytes(SCHLUESSEL) });
    const db = datenbank();
    await pushBeimAbmelden({ umgebung: b.umgebung, dienste: db.dienste });
    assert.equal(db.geloescht.length, 1);

    const kaputt = browser({ erlaubnis: 'granted', aboMit: schluesselZuBytes(SCHLUESSEL) });
    await assert.doesNotReject(pushBeimAbmelden({ umgebung: kaputt.umgebung,
        dienste: { loeschen: async () => { throw new Error('Netz weg'); } } }));
    // Ohne Push im Browser passiert gar nichts.
    await assert.doesNotReject(pushBeimAbmelden({ umgebung: { navigator: {} } }));
});
