// Texte zu einem Werk: Handlung je Akt, bekannte Stellen, "Gut zu wissen",
// Dauer und ein kurzer Anriss (seit 19.11.2026, für mehr Reichweite über
// Google). Je Werk eine Datei daten/werke/<id>.json.
//
// Zwei Leser:
//   - tests/werkzeug/seiten-erzeugen.mjs baut daraus die Seite /oper/<id>/
//     für Suchmaschinen (Steckbrief, Anriss, Handlung, bekannte Stellen, Wissenswertes);
//   - die Werkseite der App (src/pages/OperaDetail.js) lädt die Datei erst
//     beim Öffnen und zeigt alles hinter einer zugeklappten Zeile
//     "Handlung, Musik & Wissenswertes" vor den Reviews (Jonas: Variante A).
//
// "Bekannte Stellen" statt "Arien" (Jonas, 19.11.2026): darunter stehen auch
// Duette, Chöre, Ensembles und Orchesterstücke.
//
// Die Texte sind selbst geschrieben, nicht aus der Wikipedia übernommen
// (deren Lizenz verlangt Namensnennung und gleiche Lizenz). Werke ohne Datei
// zeigen nichts davon.
//
// Werke, die der Admin in der App anlegt, bringen ihren Text seit 19.11.2026
// in der Spalte catalog_operas.werk_text mit (Formular: KatalogFormular.js).
// Er hat dieselbe Form und wird gleich geprüft; im Katalog heißt er
// werk.werkText. Steht er dort, gilt er, sonst die Datei.
//
// Form einer Datei:
//   {
//     "dauer": "ca. 2 Std.",                 reine Spieldauer, ohne Pausen
//                                            (angezeigt als "ca. 2 Std. ohne Pausen" –
//                                            Angaben der Häuser rechnen die Pausen meist ein)
//     "anriss": "…",                         ohne das Ende zu verraten
//     "urauffuehrung": { "datum": "1900-01-14", "ort": "Teatro Costanzi, Rom" },
//     "akte": [{ "titel": "1. Akt", "ort": "…", "text": "…" }],
//     "stellen": [{ "titel": "Vissi d'arte", "wer": "Tosca", "akt": "2. Akt", "was": "…" }],
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
    if (!Array.isArray(t.stellen)) f.push('stellen fehlen');
    else t.stellen.forEach((a, i) => {
        text(a.titel, `stellen[${i}].titel`, 80);
        text(a.wer, `stellen[${i}].wer`, 60);
        text(a.akt, `stellen[${i}].akt`, 30);
        if (a.was !== undefined) text(a.was, `stellen[${i}].was`, GRENZEN.was);
        if (a.zitat !== undefined && typeof a.zitat !== 'boolean') f.push(`stellen[${i}].zitat ist kein Wahrheitswert`);
    });
    if (!Array.isArray(t.wissen)) f.push('wissen fehlt');
    else t.wissen.forEach((w, i) => text(w, `wissen[${i}]`, GRENZEN.wissen));
    const bekannt = new Set(['dauer', 'anriss', 'urauffuehrung', 'akte', 'stellen', 'wissen']);
    for (const k of Object.keys(t)) if (!bekannt.has(k)) f.push(`unbekanntes Feld ${k}`);
    return f;
}

/** Prolog, Vorspiel und Epilog zählt der Katalog mal mit, mal nicht. */
const RAHMEN = /^(Prolog|Vorspiel|Epilog)$/;

/** Ob die Abschnitte der Handlung zur Zahl der Akte im Katalog passen. */
export function aktePassen(t, acts) {
    if (!acts || !Array.isArray(t?.akte)) return true;
    return t.akte.length === Number(acts) || t.akte.filter(a => !RAHMEN.test(a.titel)).length === Number(acts);
}

/** Der Text, der im Katalogeintrag selbst steht (Werke aus der Datenbank), wenn er taugt. */
export function eigenerWerkText(werk) {
    const t = werk?.werkText;
    return t && !werkTextFehler(t).length ? t : null;
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

/**
 * "„Vissi d’arte“" – Titel bekannter Stellen in deutschen Anführungszeichen.
 * Bezeichnungen wie "Intermezzo" oder "Polonaise" sind kein Zitat aus dem
 * Text; sie tragen in der Datei "zitat": false und bleiben ohne Zeichen.
 */
export const stelleZitat = (titel, zitat = true) => (zitat === false ? titel : `„${titel}“`);

// ── Aus dem Formular ────────────────────────────────────────────────────
// Der Admin schreibt Handlung, bekannte Stellen und Wissenswertes als Text,
// in derselben Form, in der die Seite sie zeigt. Hier wird daraus das Objekt.

const leer = (s) => !String(s ?? '').trim();
const zeilen = (s) => String(s ?? '').split('\n').map(z => z.trim()).filter(Boolean);

/**
 * Handlung: ein Abschnitt je Absatz. Die erste Zeile ist die Überschrift,
 * "1. Akt · Ort" oder nur "1. Akt", der Rest der Text.
 */
export function akteAusText(text) {
    return String(text ?? '').split(/\n\s*\n/).map(b => b.trim()).filter(Boolean).map(block => {
        const [kopf, ...rest] = block.split('\n');
        const [titel, ...ort] = kopf.split(/\s+·\s+/);
        const a = { titel: titel.trim() };
        if (ort.length) a.ort = ort.join(' · ').trim();
        a.text = rest.join(' ').replace(/\s+/g, ' ').trim();
        return a;
    });
}

/**
 * Bekannte Stellen: eine je Zeile, "„Titel“ – Wer, Akt: was dort geschieht".
 * In Anführungszeichen ist der Titel ein Zitat aus dem Text, ohne eine
 * Bezeichnung wie "Ouvertüre". Was sich so nicht lesen lässt, kommt als
 * Zeilennummer in fehler zurück.
 */
export function stellenAusText(text) {
    const stellen = [], fehler = [];
    zeilen(text).forEach((zeile, i) => {
        const strich = zeile.match(/\s[–—-]\s/);
        if (!strich) { fehler.push(i + 1); return; }
        let titel = zeile.slice(0, strich.index).trim();
        const rest = zeile.slice(strich.index + strich[0].length);
        const doppelpunkt = rest.indexOf(': ');
        const vorn = doppelpunkt === -1 ? rest : rest.slice(0, doppelpunkt);
        const was = doppelpunkt === -1 ? '' : rest.slice(doppelpunkt + 2).trim();
        const komma = vorn.lastIndexOf(', ');
        if (komma === -1) { fehler.push(i + 1); return; }
        const zitat = /^[„“"»«‚'].*[“”"«»‘']$/.test(titel);
        if (zitat) titel = titel.slice(1, -1).trim();
        const s = { titel };
        if (!zitat) s.zitat = false;
        s.wer = vorn.slice(0, komma).trim();
        s.akt = vorn.slice(komma + 2).trim();
        if (was) s.was = was;
        stellen.push(s);
    });
    return { stellen, fehler };
}

/** Die Felder des Formulars als Werktext – oder null, wenn alle leer sind. */
export function werkTextAusFormular({ dauer, uaDatum, uaOrt, anriss, handlung, stellen, wissen }) {
    if ([dauer, uaDatum, uaOrt, anriss, handlung, stellen, wissen].every(leer)) return { text: null, fehler: [] };
    const gelesen = stellenAusText(stellen);
    const t = { dauer: String(dauer ?? '').trim(), anriss: String(anriss ?? '').trim() };
    if (!leer(uaDatum) || !leer(uaOrt)) t.urauffuehrung = { datum: String(uaDatum ?? '').trim(), ort: String(uaOrt ?? '').trim() };
    t.akte = akteAusText(handlung);
    t.stellen = gelesen.stellen;
    t.wissen = zeilen(wissen);
    const fehler = gelesen.fehler.map(n => `Bekannte Stellen, Zeile ${n}: bitte als „Titel“ – Wer, Akt: Beschreibung`);
    return { text: t, fehler };
}

/** Die Meldungen von werkTextFehler in den Worten des Formulars. */
export function werkTextFehlerLesbar(liste) {
    const nr = (i) => Number(i) + 1;
    return liste.map(f => f
        .replace(/^dauer/, 'Dauer')
        .replace(/^anriss/, 'Kurz gesagt')
        .replace(/^urauffuehrung\.datum ist kein Datum/, 'Uraufführung: Datum bitte als JJJJ-MM-TT oder nur das Jahr')
        .replace(/^urauffuehrung\.ort/, 'Uraufführung: Ort')
        .replace(/^akte fehlen/, 'Handlung fehlt')
        .replace(/^akte\[(\d+)\]\.titel/, (_, i) => `Handlung, Abschnitt ${nr(i)}: Überschrift`)
        .replace(/^akte\[(\d+)\]\.ort/, (_, i) => `Handlung, Abschnitt ${nr(i)}: Ort`)
        .replace(/^akte\[(\d+)\]\.text/, (_, i) => `Handlung, Abschnitt ${nr(i)}: Text`)
        .replace(/^stellen\[(\d+)\]\.(\w+)/, (_, i, feld) => `Bekannte Stellen, Zeile ${nr(i)}: ${{ titel: 'Titel', wer: 'Wer', akt: 'Akt', was: 'Beschreibung' }[feld] ?? feld}`)
        .replace(/^wissen\[(\d+)\]/, (_, i) => `Gut zu wissen, Zeile ${nr(i)}`)
        .replace(/ länger als (\d+) Zeichen$/, ' ist länger als $1 Zeichen'));
}
