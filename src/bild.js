// Fotos für die Andenken vorbereiten, bevor sie das Gerät verlassen:
// verkleinern und als JPEG neu schreiben.
//
// Neu schreiben heißt: nur die Bildpunkte gehen mit. Was eine Kamera sonst
// in die Datei legt – Aufnahmeort, Uhrzeit, Gerät –, fällt dabei weg. Das
// ist Absicht; ein Foto vom Schlussapplaus soll nicht verraten, wo man wohnt,
// falls es zu Hause entstanden ist.

export const HOECHSTENS = 1600;
// Die Vorschau für Feed und Mosaik. 720 px genügen für eine Kachel auch auf
// scharfen Bildschirmen und wiegen etwa ein Siebtel des Fotos – das schont
// den Datenverkehr beim Blättern und das Kontingent bei Supabase.
export const VORSCHAU = 720;

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

function alsJpeg(bild, breite, hoehe, qualitaet) {
    const leinwand = document.createElement('canvas');
    leinwand.width = breite;
    leinwand.height = hoehe;
    leinwand.getContext('2d').drawImage(bild, 0, 0, breite, hoehe);
    return new Promise((ok, fehl) => leinwand.toBlob(
        b => (b ? ok(b) : fehl(new Error('JPEG erzeugen fehlgeschlagen'))), 'image/jpeg', qualitaet));
}

/**
 * Ein Foto aus einem Dateifeld, verkleinert als JPEG ohne Metadaten, dazu
 * die Vorschau. Beide aus demselben dekodierten Bild.
 * @returns {Promise<{blob: Blob, breite: number, hoehe: number, vorschau: Blob}>}
 */
export async function fotoVorbereiten(datei, { max = HOECHSTENS, qualitaet = 0.82 } = {}) {
    const quelle = await lesen(datei);
    try {
        const { breite, hoehe } = zielGroesse(quelle.breite, quelle.hoehe, max);
        const blob = await alsJpeg(quelle.bild, breite, hoehe, qualitaet);
        const klein = zielGroesse(quelle.breite, quelle.hoehe, VORSCHAU);
        const vorschau = await alsJpeg(quelle.bild, klein.breite, klein.hoehe, 0.78);
        return { blob, breite, hoehe, vorschau };
    } finally {
        quelle.freigeben();
    }
}
