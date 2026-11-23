// Die Platzhalter einer Mail und was hineinkommt – ohne Deno, damit die
// Tests es mit Node prüfen können (tests/unit/mailFelder.test.js).
//
// Eine Vorlage (vorlage.js) trägt Platzhalter wie %%NAME%% oder %%ABENDE%%.
// felderFuer() rechnet aus den Daten der Datenbank die Werte aus,
// einsetzen() setzt sie ein – im HTML maskiert, im Klartext nicht.

import { KATALOG } from './katalog.js';

/** Für HTML: Benutzernamen und Titel dürfen kein Markup einschleusen. */
export function maskieren(text) {
    return String(text).replace(/[&<>"']/g, z => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[z]));
}

/**
 * Setzt jeden %%SCHLUESSEL%% aus `felder` ein. Ein Platzhalter ohne Wert
 * bleibt nicht stehen, sondern wird leer – eine Mail mit "%%HAUS%%" darin
 * wäre schlimmer als eine Lücke.
 */
export function einsetzen(text, felder, { html = false } = {}) {
    return String(text).replace(/%%([A-Z_]+)%%/g, (_, k) => {
        const wert = felder[k] ?? '';
        return html ? maskieren(wert) : String(wert);
    });
}

const zahlwort = (n, eins, mehr) => (Number(n) === 1 ? eins : mehr);

/** 4.5 → "★★★★½"; ohne Bewertung leer. */
export function sterne(wert) {
    const n = Math.round(Number(wert) * 2) / 2;
    if (!(n > 0)) return '';
    return '★'.repeat(Math.floor(n)) + (n % 1 ? '½' : '');
}

/** "2026-10-03" → "3. Oktober 2026" */
export function datumLang(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return '';
    const monate = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
    return `${Number(m[3])}. ${monate[Number(m[2]) - 1]} ${m[1]}`;
}

const werkTitel = (id, ersatz) => KATALOG.werke[id] || ersatz || 'Ein Opernabend';
const hausName = (id, ersatz) => KATALOG.haeuser[id] || ersatz || '';

/**
 * Die Werte für eine Mail.
 * @param {string} art      'anfrage', 'erinnerung' oder 'saison'
 * @param {object} daten    Antwort der Datenbankfunktion (mail_*_daten)
 * @returns {Record<string, string>}
 */
export function felderFuer(art, daten) {
    const name = String(daten?.name || (art === 'anfrage' ? 'Jemand' : 'Opernfan')).slice(0, 60);
    if (art !== 'saison') return { NAME: name };

    const abende = Number(daten.abende) || 0;
    const haeuser = Number(daten.haeuser) || 0;
    const werke = Number(daten.werke) || 0;
    const erstmals = Number(daten.erstmals) || 0;
    const abend = daten.abend || {};
    const haus = daten.haus || {};
    const ort = [hausName(abend.haus, abend.haus_name), datumLang(abend.datum)].filter(Boolean).join(' · ');
    return {
        NAME: name,
        SAISON: String(daten.saison || ''),
        ABENDE: String(abende),
        ABENDE_WORT: zahlwort(abende, 'Abend', 'Abende'),
        HAEUSER: String(haeuser),
        HAEUSER_WORT: zahlwort(haeuser, 'Haus', 'Häuser'),
        WERKE: String(werke),
        WERKE_WORT: zahlwort(werke, 'Werk', 'Werke'),
        // Nur wenn es welche gab – "davon 0 zum ersten Mal" klingt nach Tadel.
        ERSTMALS: erstmals === 0 ? ''
            : erstmals === werke ? (werke === 1 ? 'Zum ersten Mal gesehen.' : 'Alle zum ersten Mal gesehen.')
                : `Davon ${erstmals} zum ersten Mal gesehen.`,
        ABEND_WERK: werkTitel(abend.werk, abend.werk_titel),
        ABEND_ORT: ort,
        ABEND_STERNE: sterne(abend.sterne),
        HAUS: hausName(haus.haus, haus.haus_name) || 'deinem Lieblingshaus',
        HAUS_ABENDE: `${Number(haus.abende) || 0} ${zahlwort(haus.abende, 'Abend', 'Abende')}`,
    };
}
