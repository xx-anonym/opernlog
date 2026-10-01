// Bildnachweise in der App: klein unten rechts im Kopf von Werk- und
// Hausseite, nur wo die Lizenz eine Namensnennung verlangt (Jonas,
// 1.10.2026: "unauffällig"); alle zusammen unter #/bildnachweise.
//
// Die Angaben stehen in src/data/bildnachweise.js (erzeugt von
// tests/werkzeug/bildnachweise-holen.mjs). Fehlt ein Bild dort – ein Werk,
// das der Admin gerade erst angelegt hat –, fragt die App Commons selbst,
// einmal je Datei. Die Bilder lädt der Browser ohnehin von Wikimedia.

import { BILDNACHWEISE } from '../data/bildnachweise.js';
import { dateinameAus, urheberText, nachweisZeile } from '../data/bildnachweisRegeln.js';

const geholt = new Map();   // Dateiname -> Promise<Nachweis|null>

async function vonCommons(datei) {
    try {
        const r = await fetch('https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*'
            + '&prop=imageinfo&iiprop=extmetadata|url&iiextmetadatafilter=Artist|LicenseShortName|LicenseUrl|AttributionRequired'
            + `&titles=${encodeURIComponent(`File:${datei}`)}`);
        if (!r.ok) return null;
        const info = Object.values((await r.json())?.query?.pages || {})[0]?.imageinfo?.[0];
        if (!info) return null;
        const m = info.extmetadata || {};
        const wert = k => String(m[k]?.value ?? '').trim();
        return {
            urheber: urheberText(wert('Artist')),
            lizenz: wert('LicenseShortName').replace(/<[^>]+>/g, '') || 'unbekannt',
            lizenzUrl: wert('LicenseUrl') || null,
            seite: info.descriptionurl,
            pflicht: wert('AttributionRequired') === 'true',
        };
    } catch {
        return null;
    }
}

/** Der Nachweis zu einer Bildadresse – aus der Datei, sonst von Commons. */
export function nachweisFuer(adresse) {
    const datei = dateinameAus(adresse);
    if (!datei) return Promise.resolve(null);
    if (BILDNACHWEISE[datei]) return Promise.resolve(BILDNACHWEISE[datei]);
    if (!geholt.has(datei)) geholt.set(datei, vonCommons(datei));
    return geholt.get(datei);
}

/** Die Seite der Datei auf Commons, auch ohne Nachweis. */
export function commonsSeite(adresse) {
    const datei = dateinameAus(adresse);
    return datei ? `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(datei)}` : null;
}

/** Setzt die Zeile in den Kopf, wenn die Lizenz sie verlangt. */
export function bildnachweisImKopf(kopf, adresse) {
    if (!kopf || !adresse) return;
    nachweisFuer(adresse).then((n) => {
        if (!n?.pflicht) return;
        const a = document.createElement('a');
        a.className = 'bildnachweis';
        a.href = n.seite || commonsSeite(adresse);
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        // Wird es eng, kürzt sich der Name, nie die Lizenz.
        const wer = nachweisZeile({ ...n, lizenz: '' });
        const teil = (klasse, text) => Object.assign(document.createElement('span'), { className: klasse, textContent: text });
        if (n.lizenz && wer !== 'Bild: Wikimedia Commons') a.append(teil('bildnachweis__wer', wer), teil('bildnachweis__lizenz', `\u00a0· ${n.lizenz}`));
        else a.append(teil('bildnachweis__wer', nachweisZeile(n)));
        a.title = `${nachweisZeile(n)} – Wikimedia Commons`;
        kopf.appendChild(a);
    });
}
