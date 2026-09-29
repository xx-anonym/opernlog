// Fehler, die im Browser niemand abfängt, landen in der Tabelle
// fehlerprotokoll (supabase/migrations/fehlerprotokoll_migration.sql).
//
// Bisher erfuhr man von ihnen nur, wenn Jonas sie selbst bemerkte – gerade
// von denen, die nur auf dem iPhone oder nur in der installierten App
// auftreten. Gemeldet werden nicht abgefangene Fehler und abgelehnte
// Promises ohne Behandlung; was die App selbst abfängt und anzeigt, nicht.
//
// Ohne Personenbezug: von der Adresse bleibt nur die Seite ("#/profile/<id>"
// wird "profile"), dazu Version, Meldung, Stelle im Code, Browserkennung und
// ob jemand angemeldet war. Je Seitenaufruf höchstens fünf verschiedene
// Fehler, jeder nur einmal – eine Schleife, die denselben Fehler tausendmal
// wirft, schreibt eine Zeile.

import { VERSION } from './version.js';

export const HOECHSTENS = 5;

// Kein Fehler der App: Meldungen, die Browser und Erweiterungen erzeugen.
const RAUSCHEN = [
    /ResizeObserver loop/i,
    /^Script error\.?$/i,            // fremdes Skript, der Browser verrät nichts
    /(chrome|moz|safari(-web)?)-extension:\/\//i,
];

const kuerzen = (text, n) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Die Seite ohne Kennungen: "#/opera/tosca?x" → "opera", leer → "home". */
export function seiteAus(hash) {
    return kuerzen((hash || '#/').replace(/^#\/?/, '').split(/[/?]/)[0], 40) || 'home';
}

/** Datei:Zeile:Spalte, ohne die Adresse der Seite davor. */
export function stelleAus(datei, zeile, spalte, herkunft = '') {
    if (!datei) return '';
    const pfad = herkunft && datei.startsWith(herkunft) ? datei.slice(herkunft.length) : datei;
    return kuerzen([pfad, zeile, spalte].filter(x => x !== undefined && x !== null && x !== '').join(':'), 300);
}

/** Die Zeile für die Tabelle, oder null, wenn es kein Fehler der App ist. */
export function fehlerEintrag({ meldung, stelle = '', hash = '', geraet = '', angemeldet = false }) {
    const text = kuerzen(meldung, 500);
    if (!text || RAUSCHEN.some(m => m.test(text) || m.test(stelle))) return null;
    return {
        version: kuerzen(VERSION, 20),
        seite: seiteAus(hash),
        meldung: text,
        stelle: kuerzen(stelle, 300),
        geraet: kuerzen(geraet, 300),
        angemeldet: !!angemeldet,
    };
}

/**
 * Hängt sich an die Fehler des Fensters.
 * @param {object} o
 * @param {(eintrag: object) => Promise<unknown>} o.senden  schreibt die Zeile
 * @param {() => boolean} [o.angemeldet]
 * @param {Window} [o.umgebung]
 */
export function fehlerprotokollEinrichten({ senden, angemeldet = () => false, umgebung = globalThis }) {
    const gesehen = new Set();
    const herkunft = umgebung.location?.origin || '';

    const melden = (meldung, stelle) => {
        try {
            const eintrag = fehlerEintrag({
                meldung, stelle,
                hash: umgebung.location?.hash,
                geraet: umgebung.navigator?.userAgent,
                angemeldet: angemeldet(),
            });
            if (!eintrag) return;
            const schluessel = `${eintrag.meldung}|${eintrag.stelle}`;
            if (gesehen.has(schluessel) || gesehen.size >= HOECHSTENS) return;
            gesehen.add(schluessel);
            // Scheitert das Melden (offline, Dienst gestört), bleibt es still:
            // ein Fehler beim Melden eines Fehlers soll keinen neuen melden.
            Promise.resolve().then(() => senden(eintrag)).catch(() => {});
        } catch { /* siehe oben */ }
    };

    umgebung.addEventListener('error', (e) => {
        melden(e.message || e.error?.message, stelleAus(e.filename, e.lineno, e.colno, herkunft));
    });
    umgebung.addEventListener('unhandledrejection', (e) => {
        const grund = e.reason;
        const meldung = grund?.message || (typeof grund === 'string' ? grund : JSON.stringify(grund ?? null));
        // Erste Zeile des Stapels mit einer Datei darin: dort ist es passiert.
        const zeile = String(grund?.stack || '').split('\n').find(z => /\.js:\d+/.test(z)) || '';
        const stelle = (zeile.match(/([^\s()@]+\.js):(\d+):(\d+)/) || []).slice(1);
        melden(meldung, stelle.length ? stelleAus(stelle[0], stelle[1], stelle[2], herkunft) : '');
    });

    // Was das Stück in index.html vor dem Start gemerkt hat, geht jetzt den
    // üblichen Weg; von hier an meldet es selbst nichts mehr.
    umgebung.__fehlerprotokollAktiv = true;
    for (const f of umgebung.__fruehFehler || []) melden(f.meldung, f.stelle);
}
