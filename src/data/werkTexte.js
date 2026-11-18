// Texte zu einem Werk: Handlung je Akt, bekannte Arien, "Gut zu wissen",
// Dauer und ein kurzer Anriss (seit 19.11.2026, für mehr Reichweite über
// Google). Je Werk eine Datei daten/werke/<id>.json.
//
// Zwei Leser:
//   - tests/werkzeug/seiten-erzeugen.mjs baut daraus die Seite /oper/<id>/
//     für Suchmaschinen (Steckbrief, Anriss, Handlung, Arien, Wissenswertes);
//   - die Werkseite der App (src/pages/OperaDetail.js) lädt die Datei erst
//     beim Öffnen und zeigt alles hinter einer zugeklappten Zeile
//     "Handlung, Arien & Wissenswertes" vor den Reviews (Jonas: Variante A).
//
// Die Texte sind selbst geschrieben, nicht aus der Wikipedia übernommen
// (deren Lizenz verlangt Namensnennung und gleiche Lizenz). Werke ohne Datei
// zeigen nichts davon – auch die aus der Datenbank.
//
// Form einer Datei:
//   {
//     "dauer": "ca. 2 Std.",                 Musik ohne Pausen
//     "anriss": "…",                         ohne das Ende zu verraten
//     "urauffuehrung": { "datum": "1900-01-14", "ort": "Teatro Costanzi, Rom" },
//     "akte": [{ "titel": "1. Akt", "ort": "…", "text": "…" }],
//     "arien": [{ "titel": "Vissi d'arte", "wer": "Tosca", "akt": "2. Akt", "was": "…" }],
//     "wissen": ["…"]
//   }

export const WERKTEXT_ORDNER = 'daten/werke';

const GRENZEN = { anriss: 400, akttext: 600, was: 160, wissen: 220 };

/** Was an einem Werktext nicht stimmt – leer heißt: in Ordnung. */
export function werkTextFehler(t) {
    const f = [];
    const text = (wert, name, max) => {
        if (typeof wert !== 'string' || !wert.trim()) f.push(`${name} fehlt`);
        else if (wert.length > max) f.push(`${name} länger als ${max} Zeichen`);
        else if (/[<>]/.test(wert)) f.push(`${name} enthält < oder >`);
    };
    if (!t || typeof t !== 'object') return ['kein Objekt'];
    text(t.dauer, 'dauer', 30);
    text(t.anriss, 'anriss', GRENZEN.anriss);
    if (t.urauffuehrung) {
        if (!/^\d{4}(-\d{2}-\d{2})?$/.test(t.urauffuehrung.datum || '')) f.push('urauffuehrung.datum ist kein Datum');
        text(t.urauffuehrung.ort, 'urauffuehrung.ort', 80);
    }
    if (!Array.isArray(t.akte) || !t.akte.length) f.push('akte fehlen');
    else t.akte.forEach((a, i) => {
        text(a.titel, `akte[${i}].titel`, 40);
        if (a.ort !== undefined) text(a.ort, `akte[${i}].ort`, 80);
        text(a.text, `akte[${i}].text`, GRENZEN.akttext);
    });
    if (!Array.isArray(t.arien)) f.push('arien fehlen');
    else t.arien.forEach((a, i) => {
        text(a.titel, `arien[${i}].titel`, 80);
        text(a.wer, `arien[${i}].wer`, 60);
        text(a.akt, `arien[${i}].akt`, 30);
        if (a.was !== undefined) text(a.was, `arien[${i}].was`, GRENZEN.was);
    });
    if (!Array.isArray(t.wissen)) f.push('wissen fehlt');
    else t.wissen.forEach((w, i) => text(w, `wissen[${i}]`, GRENZEN.wissen));
    const bekannt = new Set(['dauer', 'anriss', 'urauffuehrung', 'akte', 'arien', 'wissen']);
    for (const k of Object.keys(t)) if (!bekannt.has(k)) f.push(`unbekanntes Feld ${k}`);
    return f;
}

const geladen = new Map();

/**
 * Den Text zu einem Werk holen, oder null (keine Datei, kein Netz, kaputt).
 * Je Werk nur einmal – auch der Fehlschlag wird gemerkt, bis die Seite neu lädt.
 */
export function ladeWerkText(id, { abruf = (...a) => fetch(...a) } = {}) {
    if (!id) return Promise.resolve(null);
    if (!geladen.has(id)) {
        geladen.set(id, (async () => {
            try {
                const r = await abruf(`./${WERKTEXT_ORDNER}/${encodeURIComponent(id)}.json`);
                if (!r.ok) return null;
                const t = await r.json();
                if (werkTextFehler(t).length) {
                    console.warn('[Werktext] fehlerhaft', id, werkTextFehler(t));
                    return null;
                }
                return t;
            } catch {
                geladen.delete(id);   // ohne Netz: beim nächsten Öffnen noch einmal
                return null;
            }
        })());
    }
    return geladen.get(id);
}

/** "„Vissi d’arte“" – Arientitel immer in deutschen Anführungszeichen. */
export const arieZitat = titel => `„${titel}“`;
