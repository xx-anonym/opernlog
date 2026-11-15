// Die Stimmen-Walze der Story im Saisonrückblick (src/pages/SeasonReview.js,
// Folie "Meistgehörte Stimmen"). Aussehen und Zeitablauf: style.css,
// .story-walze.

import { escapeHTML } from '../utils.js';

/** Wie lange die Walze läuft, bis sie steht (Sekunden), und ab wann. */
const WALZE_DAUER = 2.6;
const WALZE_START = 0.5;
/** Höchstens so viele Namen blitzen vorher auf – bei langen Spielzeiten eine Auswahl. */
const WALZE_HOECHSTENS = 24;

/** Fester Zufall aus einem Text, damit dieselbe Spielzeit dieselbe Walze zeigt. */
function zufallAus(text) {
    let h = 2166136261;
    for (const z of text) h = Math.imul(h ^ z.codePointAt(0), 16777619);
    return () => {
        h = Math.imul(h ^ (h >>> 15), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        return ((h ^= h >>> 16) >>> 0) / 4294967296;
    };
}

/**
 * Für "Meistgehörte Stimmen" (Jonas, 15.11.2026: "sehr leer"): alle Stimmen
 * der Spielzeit blitzen nacheinander auf, erst schnell, dann langsamer, bis
 * die Walze beim meistgehörten Namen stehen bleibt.
 *
 * Wie viele Namen durchlaufen, hängt davon ab, wie viele man gehört hat:
 * bei vielen eine Auswahl von höchstens WALZE_HOECHSTENS, jeder einmal; bei
 * wenigen läuft die Liste mehrmals durch, damit es trotzdem nach Walze
 * aussieht (höchstens viermal, bis etwa zwölf Namen); ein einzelner
 * anderer Name kommt nur einmal. Bei vielen Namen dauert sie bis
 * WALZE_DAUER, bei wenigen kürzer. Ohne andere Namen gibt es keine Walze,
 * nur den Namen.
 *
 * Alle Namen liegen übereinander in derselben Zelle; jeder ist nur in
 * seinem Zeitfenster zu sehen (style.css: .story-walze). So dürfen lange
 * Namen umbrechen, und der letzte steht genau dort, wo sonst der Wert steht.
 *
 * @param {string[]} namen  alle Stimmen der Spielzeit
 * @param {string} ziel     die meistgehörte
 * @returns {string} HTML, maskiert – oder '' ohne andere Namen
 */
export function stimmenWalze(namen, ziel) {
    const andere = [...new Set(namen)].filter(n => n && n !== ziel);
    if (!andere.length) return '';
    const zufall = zufallAus(`${ziel}|${andere.join('|')}`);
    const gemischt = andere
        .map(n => ({ n, z: zufall() }))
        .sort((a, b) => a.z - b.z)
        .map(x => x.n);

    let folge;
    if (gemischt.length >= WALZE_HOECHSTENS - 1) {
        folge = gemischt.slice(0, WALZE_HOECHSTENS - 1);
    } else if (gemischt.length === 1) {
        // Ein einzelner anderer Name mehrmals hintereinander sähe aus wie
        // ein stehender – er kommt einmal.
        folge = gemischt;
    } else {
        const laenge = Math.max(gemischt.length, Math.min(12, gemischt.length * 4));
        folge = Array.from({ length: laenge }, (_, i) => gemischt[i % gemischt.length]);
    }
    folge.push(ziel);

    // Zeitfenster: jedes etwas länger als das vorige (geometrisch, vom
    // ersten zum letzten etwa achtmal so lang), zusammen höchstens
    // WALZE_DAUER – bei wenigen Namen kürzer, sonst stünde jeder ewig.
    const fenster = folge.length - 1;
    const wachstum = fenster > 1 ? 8 ** (1 / (fenster - 1)) : 1;
    const roh = Array.from({ length: fenster }, (_, i) => wachstum ** i);
    const summe = roh.reduce((a, b) => a + b, 0);
    const dauer = Math.min(WALZE_DAUER, 0.35 + 0.2 * fenster);
    const laengen = roh.map(x => x * dauer / summe);
    const beginne = [WALZE_START];
    laengen.forEach((l, i) => beginne.push(beginne[i] + l));
    const anzahl = folge.length;
    const beginn = i => beginne[i];
    const namenHtml = folge.map((name, i) => {
        const letzter = i === anzahl - 1;
        const stil = letzter
            ? `--beginn: ${beginn(i).toFixed(3)}s`
            : `--beginn: ${beginn(i).toFixed(3)}s; --dauer: ${laengen[i].toFixed(3)}s`;
        return `<span class="story-walze__name${letzter ? ' story-walze__name--ziel' : ''}" style="${stil}"${letzter ? '' : ' aria-hidden="true"'}>${escapeHTML(name)}</span>`;
    }).join('');
    return `<span class="story-walze" data-namen="${anzahl}">${namenHtml}</span>`;
}
