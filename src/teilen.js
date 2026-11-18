// Teilen mit Bild: gemeinsam für den Saisonrückblick und einzelne Abende.

import { copyToClipboard } from './utils.js';

/** Eine Leinwand als PNG-Datei, wie navigator.share() sie annimmt. */
export async function alsPng(leinwand, name) {
    const blob = await new Promise(res => leinwand.toBlob(res, 'image/png'));
    if (!blob) throw new Error('Leinwand ließ sich nicht in ein Bild wandeln');
    return { blob, name, file: new File([blob], name, { type: 'image/png' }) };
}

/**
 * Teilt möglichst als Bild, sonst als Text, sonst über die Zwischenablage.
 * Jede Stufe kann ausfallen: das Teilen-Menü gibt es nur in sicheren
 * Kontexten und nicht in jedem Browser, das Teilen von Dateien noch
 * seltener. Bricht jemand das Menü ab, ist das kein Fehler.
 *
 * Ein Link steht im Text, nicht im Feld url: mit Datei und url zusammen
 * lassen manche Ziele eins von beiden fallen (WhatsApp nimmt den Text als
 * Bildunterschrift, iOS teilt sonst Bild und Link getrennt).
 *
 * @returns {Promise<'geteilt'|'abgebrochen'|'kopiert'|'fehlgeschlagen'>}
 */
export async function teilenMitBild({ datei, titel, text, protokoll = 'Teilen' }) {
    if (datei && navigator.canShare?.({ files: [datei.file] })) {
        try {
            await navigator.share({ files: [datei.file], title: titel, text });
            return 'geteilt';
        } catch (e) {
            if (e?.name === 'AbortError') return 'abgebrochen';
            console.warn(`[${protokoll}] Teilen mit Bild fehlgeschlagen`, e);
        }
    }

    if (navigator.share) {
        try {
            await navigator.share({ title: titel, text });
            return 'geteilt';
        } catch (e) {
            if (e?.name === 'AbortError') return 'abgebrochen';
            console.warn(`[${protokoll}] Teilen fehlgeschlagen`, e);
        }
    }

    return await copyToClipboard(text) ? 'kopiert' : 'fehlgeschlagen';
}

/**
 * Einen Link teilen: ohne Bild, damit WhatsApp, iMessage und Co. die
 * Vorschau der Seite zeigen (api/abend.mjs, api/rueckblick.mjs). Ohne
 * Teilen-Menü landet der Link in der Zwischenablage.
 *
 * @returns {Promise<'geteilt'|'abgebrochen'|'kopiert'|'fehlgeschlagen'>}
 */
export async function teilenLink({ titel, url, protokoll = 'Teilen' }) {
    if (navigator.share) {
        try {
            await navigator.share({ title: titel, url });
            return 'geteilt';
        } catch (e) {
            if (e?.name === 'AbortError') return 'abgebrochen';
            console.warn(`[${protokoll}] Link teilen fehlgeschlagen`, e);
        }
    }
    return await copyToClipboard(url) ? 'kopiert' : 'fehlgeschlagen';
}

/** Ids aus der Datenbank sind UUIDs; lokale Einträge (ohne Konto) nicht. */
export const istCloudId = id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id ?? ''));
