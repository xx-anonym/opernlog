// Soll oben der Hinweis stehen, OpernLog auf den Home-Bildschirm zu legen?
//
// Auf dem Handy im Browser, ja – immer. Erst installiert gibt es auf dem
// iPhone Mitteilungen, und die App nutzt den ganzen Bildschirm statt der
// halben Höhe zwischen Adress- und Werkzeugleiste. Installiert oder am Rechner
// steht er nicht da.

/**
 * @returns {null|'ios'|'android'} welcher Weg zum Installieren beschrieben wird
 */
export function installHinweisArt(umgebung = globalThis) {
    const nav = umgebung.navigator || {};
    const ua = nav.userAgent || '';
    const installiert = nav.standalone === true
        || !!umgebung.matchMedia?.('(display-mode: standalone)')?.matches;
    if (installiert) return null;

    // iPadOS gibt sich als Mac aus; verraten wird es durch den Touchscreen.
    if (/iPhone|iPad|iPod/.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1)) return 'ios';
    if (/Android/.test(ua)) return 'android';
    return null;
}
