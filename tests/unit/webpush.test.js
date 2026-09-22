// Web Push: Verschlüsselung und Absenderausweis.
//
// Beides lässt sich hier vollständig prüfen, ohne Apple oder Google: die
// Verschlüsselung gegen das Rechenbeispiel aus RFC 8291, Anhang A, Byte für
// Byte – und zusätzlich rückwärts mit dem crypto-Modul von Node, also mit
// einer zweiten, unabhängigen Umsetzung. Der VAPID-Kopf wird ebenfalls mit
// Node nachgeprüft.
//
// Stimmt hier etwas nicht, kommt auf dem Gerät schlicht nichts an. Der
// Push-Dienst verwirft falsch verschlüsselte Nachrichten ohne Rückmeldung an
// uns, und der Browser zeigt nichts an.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import nodeCrypto from 'node:crypto';

import { b64u, vonB64u, verschluesseln, vapidKopf, vapidSchluesselErzeugen, senden, PUSH_DIENSTE }
    from '../../supabase/functions/push-senden/webpush.js';

// RFC 8291, Anhang A.
const RFC = {
    klartext: 'When I grow up, I want to be a watermelon',
    asPrivat: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
    asOeffentlich: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
    uaPrivat: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
    uaOeffentlich: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
    auth: 'BTBZMqHH6r4Tts7J_aSIgg',
    salt: 'DGv6ra1nlYgDCS1FRnbzlw',
    ergebnis: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

const te = new TextEncoder();

/** Entschlüsselt wie ein Browser – mit node:crypto statt WebCrypto. */
function entschluesseln(rumpf, uaPrivat, uaOeffentlich, auth) {
    const salt = rumpf.subarray(0, 16);
    const idLaenge = rumpf[20];
    const asOeffentlich = rumpf.subarray(21, 21 + idLaenge);
    const geheim = rumpf.subarray(21 + idLaenge);

    const ecdh = nodeCrypto.createECDH('prime256v1');
    ecdh.setPrivateKey(Buffer.from(vonB64u(uaPrivat)));
    const gemeinsam = ecdh.computeSecret(Buffer.from(asOeffentlich));

    const info = Buffer.concat([Buffer.from('WebPush: info\0'), Buffer.from(vonB64u(uaOeffentlich)), Buffer.from(asOeffentlich)]);
    const ikm = Buffer.from(nodeCrypto.hkdfSync('sha256', gemeinsam, Buffer.from(vonB64u(auth)), info, 32));
    const cek = Buffer.from(nodeCrypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
    const nonce = Buffer.from(nodeCrypto.hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));

    const d = nodeCrypto.createDecipheriv('aes-128-gcm', cek, nonce);
    d.setAuthTag(Buffer.from(geheim.subarray(geheim.length - 16)));
    const klar = Buffer.concat([d.update(Buffer.from(geheim.subarray(0, geheim.length - 16))), d.final()]);
    assert.equal(klar[klar.length - 1], 2, 'das Trennzeichen für den letzten Datensatz fehlt');
    return klar.subarray(0, klar.length - 1).toString('utf8');
}

test('Verschlüsselung trifft das Beispiel aus RFC 8291 Byte für Byte', async () => {
    const rumpf = await verschluesseln(te.encode(RFC.klartext),
        { p256dh: RFC.uaOeffentlich, auth: RFC.auth },
        { asPrivat: RFC.asPrivat, asOeffentlich: RFC.asOeffentlich, salt: RFC.salt });
    assert.equal(b64u(rumpf), RFC.ergebnis);
});

test('eine unabhängige Umsetzung kann die Nachricht wieder lesen', async () => {
    // Mit frischen, zufälligen Schlüsseln – so, wie es im Betrieb läuft.
    const browser = nodeCrypto.createECDH('prime256v1');
    browser.generateKeys();
    const uaOeffentlich = b64u(browser.getPublicKey());
    const uaPrivat = b64u(browser.getPrivateKey());
    const auth = b64u(nodeCrypto.randomBytes(16));

    const nachricht = JSON.stringify({ titel: 'Neuer Kommentar', text: 'Äußerst gelungen – Brava! 🎭' });
    const rumpf = await verschluesseln(te.encode(nachricht), { p256dh: uaOeffentlich, auth });
    assert.equal(entschluesseln(rumpf, uaPrivat, uaOeffentlich, auth), nachricht);
});

test('jede Nachricht bekommt eigenes Salz und eigenen Schlüssel', async () => {
    const abo = { p256dh: RFC.uaOeffentlich, auth: RFC.auth };
    const a = await verschluesseln(te.encode('x'), abo);
    const b = await verschluesseln(te.encode('x'), abo);
    assert.notDeepEqual(a.subarray(0, 16), b.subarray(0, 16), 'Salz wiederholt sich');
    assert.notDeepEqual(a.subarray(21, 86), b.subarray(21, 86), 'Serverschlüssel wiederholt sich');
});

test('der VAPID-Kopf ist ein gültiges ES256-JWT für den Push-Dienst', async () => {
    const vapid = await vapidSchluesselErzeugen();
    const kopf = await vapidKopf('https://web.push.apple.com/QGuQyavXutnMXJaG1', vapid, 'https://opernlog.vercel.app', 1_800_000_000);

    const m = kopf.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/);
    assert.ok(m, `Form des Kopfes: ${kopf}`);
    const [, k, i, s, oeffentlich] = m;
    assert.equal(oeffentlich, vapid.oeffentlich);
    assert.deepEqual(JSON.parse(Buffer.from(vonB64u(k)).toString()), { typ: 'JWT', alg: 'ES256' });
    assert.deepEqual(JSON.parse(Buffer.from(vonB64u(i)).toString()), {
        aud: 'https://web.push.apple.com', exp: 1_800_000_000 + 12 * 3600, sub: 'https://opernlog.vercel.app',
    });

    // Mit node:crypto nachprüfen: die Signatur passt zum öffentlichen Schlüssel.
    const pub = nodeCrypto.createPublicKey({ key: { ...JSON.parse(vapid.privatJwk), d: undefined }, format: 'jwk' });
    assert.ok(nodeCrypto.verify('sha256', Buffer.from(`${k}.${i}`), { key: pub, dsaEncoding: 'ieee-p1363' },
        Buffer.from(vonB64u(s))), 'die Signatur ist ungültig');
    assert.equal(vonB64u(vapid.oeffentlich).length, 65);
});

test('verschickt wird nur an bekannte Push-Dienste', async () => {
    for (const gut of ['https://fcm.googleapis.com/fcm/send/abc', 'https://web.push.apple.com/QGuQ',
        'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://wns2-par02p.notify.windows.com/w/?token=x']) {
        assert.match(gut, PUSH_DIENSTE, gut);
    }
    for (const schlecht of ['http://fcm.googleapis.com/x', 'https://evil.example/fcm.googleapis.com/',
        'https://push.apple.com.evil.example/x', 'https://gqdblqymteclmdlushox.supabase.co/rest/v1/']) {
        assert.doesNotMatch(schlecht, PUSH_DIENSTE, schlecht);
    }
    const vapid = await vapidSchluesselErzeugen();
    let angerufen = false;
    await assert.rejects(senden({ endpoint: 'https://evil.example/', p256dh: RFC.uaOeffentlich, auth: RFC.auth },
        { titel: 'x' }, vapid, 'https://opernlog.vercel.app', async () => { angerufen = true; }));
    assert.equal(angerufen, false);
});

test('senden setzt die Köpfe, die jeder Push-Dienst verlangt', async () => {
    const vapid = await vapidSchluesselErzeugen();
    let anfrage;
    const status = await senden({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: RFC.uaOeffentlich, auth: RFC.auth },
        { titel: 'Hallo' }, vapid, 'https://opernlog.vercel.app',
        async (url, o) => { anfrage = { url, ...o }; return { status: 201 }; });
    assert.equal(status, 201);
    assert.equal(anfrage.method, 'POST');
    assert.equal(anfrage.headers['Content-Encoding'], 'aes128gcm');
    assert.match(anfrage.headers.Authorization, /^vapid t=.+, k=/);
    assert.equal(anfrage.headers.TTL, '86400');
    assert.ok(anfrage.body.length > 86 + 16, 'der Rumpf ist zu kurz für Kopf und Tag');
});
