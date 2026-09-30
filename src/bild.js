// Fotos für die Andenken vorbereiten, bevor sie das Gerät verlassen:
// verkleinern und als JPEG neu schreiben.
//
// Neu schreiben heißt: nur die Bildpunkte gehen mit. Was eine Kamera sonst
// in die Datei legt – Aufnahmeort, Uhrzeit, Gerät –, fällt dabei weg. Das
// ist Absicht; ein Foto vom Schlussapplaus soll nicht verraten, wo man wohnt,
// falls es zu Hause entstanden ist.

export const HOECHSTENS = 1600;

/** Zielgröße: die längere Seite höchstens `max`, nie größer als das Original. */
export function zielGroesse(breite, hoehe, max = HOECHSTENS) {
    const faktor = Math.min(1, max / Math.max(breite, hoehe));
    return {
        breite: Math.max(1, Math.round(breite * faktor)),
        hoehe: Math.max(1, Math.round(hoehe * faktor)),
    };
}

/** Das Bild dekodiert und nach seiner EXIF-Ausrichtung gedreht. */
async function lesen(datei) {
    if (typeof createImageBitmap === 'function') {
        try {
            const bild = await createImageBitmap(datei, { imageOrientation: 'from-image' });
            return { bild, breite: bild.width, hoehe: bild.height, freigeben: () => bild.close?.() };
        } catch { /* weiter mit dem Rückfall */ }
    }
    // Rückfall über ein <img>: Browser drehen dabei ebenfalls nach EXIF.
    const url = URL.createObjectURL(datei);
    const bild = new Image();
    bild.src = url;
    try {
        await bild.decode();
    } catch {
        URL.revokeObjectURL(url);
        throw Object.assign(new Error('Bild nicht lesbar'), {
            userMessage: 'Dieses Bildformat kann dein Browser nicht öffnen – versuch es als JPEG oder PNG.',
        });
    }
    return { bild, breite: bild.naturalWidth, hoehe: bild.naturalHeight, freigeben: () => URL.revokeObjectURL(url) };
}

/**
 * Ein Foto aus einem Dateifeld, verkleinert als JPEG ohne Metadaten.
 * @returns {Promise<{blob: Blob, breite: number, hoehe: number}>}
 */
export async function fotoVorbereiten(datei, { max = HOECHSTENS, qualitaet = 0.82 } = {}) {
    const quelle = await lesen(datei);
    try {
        const { breite, hoehe } = zielGroesse(quelle.breite, quelle.hoehe, max);
        const leinwand = document.createElement('canvas');
        leinwand.width = breite;
        leinwand.height = hoehe;
        leinwand.getContext('2d').drawImage(quelle.bild, 0, 0, breite, hoehe);
        const blob = await new Promise((ok, fehl) => leinwand.toBlob(
            b => (b ? ok(b) : fehl(new Error('JPEG erzeugen fehlgeschlagen'))), 'image/jpeg', qualitaet));
        return { blob, breite, hoehe };
    } finally {
        quelle.freigeben();
    }
}
