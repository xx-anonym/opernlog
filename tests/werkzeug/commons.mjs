// Gemeinsames für die Werkzeuge rund um die Bilder aus Wikimedia Commons.

import crypto from 'node:crypto';

const KENNUNG = 'OpernLog-Katalogpflege/1.0 (https://opernlog.vercel.app; Katalogpflege)';

/**
 * Adresse eines Commons-Bildes aus seinem Dateinamen.
 *
 * Der Ablageort ergibt sich aus dem MD5 des Dateinamens mit Unterstrichen:
 * .../commons/thumb/<h[0]>/<h[0..1]>/<Name>/<Breite>px-<Name>. Die Adresse
 * lässt sich damit aus dem Namen allein berechnen – geprüft an allen 100
 * vorhandenen thumb-Adressen des Katalogs, alle exakt rekonstruiert.
 */
export function commonsThumb(dateiname, breite = 1280) {
    const n = String(dateiname).replace(/^File:/i, '').replace(/ /g, '_');
    const h = crypto.createHash('md5').update(n).digest('hex');
    // Klammern und Apostroph kodiert der Katalog aus, encodeURIComponent nicht.
    const e = encodeURIComponent(n)
        .replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/'/g, '%27');
    return `https://upload.wikimedia.org/wikipedia/commons/thumb/${h[0]}/${h.slice(0, 2)}/${e}/${breite}px-${e}`;
}

/**
 * Eine Anfrage nach draußen – gedrosselt und mit Wiederholung bei 429.
 *
 * Wikimedia drosselt: 175 Anfragen kurz hintereinander von einem
 * GitHub-Rechner beantwortete es geschlossen mit 429. Deshalb hier ein
 * Mindestabstand und Nachsicht, wenn es trotzdem zu viel wird.
 */
let naechsteFreigabe = 0;
const ABSTAND = 350;      // ms zwischen zwei Anfragen

export async function holen(url, { methode = 'HEAD', versuche = 4 } = {}) {
    for (let versuch = 0; ; versuch++) {
        const wartezeit = Math.max(0, naechsteFreigabe - Date.now());
        if (wartezeit) await new Promise(r => setTimeout(r, wartezeit));
        naechsteFreigabe = Date.now() + ABSTAND;

        let antwort;
        try {
            antwort = await fetch(url, {
                method: methode,
                redirect: 'follow',
                headers: { 'User-Agent': KENNUNG, 'Accept-Language': 'de' },
                signal: AbortSignal.timeout(25000),
            });
        } catch (e) {
            if (versuch >= versuche - 1) return { status: 0, ok: false, fehler: String(e.message || e).slice(0, 80) };
            await new Promise(r => setTimeout(r, 1500 * 2 ** versuch));
            continue;
        }

        if (antwort.status === 429 && versuch < versuche - 1) {
            const nach = Number(antwort.headers.get('retry-after')) || 0;
            await new Promise(r => setTimeout(r, Math.max(nach * 1000, 2000 * 2 ** versuch)));
            continue;
        }
        return { status: antwort.status, ok: antwort.ok, antwort };
    }
}
