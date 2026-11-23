// Dirigat, Regie und Besetzung, wie das Haus sie für einen Abend angibt
// (Beta, seit 23.11.2026). Gelesen von tests/werkzeug/besetzung-lesen.mjs
// nach daten/besetzung/<haus>.json – Oper Leipzig, Semperoper, Komische Oper,
// Staatsoper, Deutsche Oper Berlin, Oper Frankfurt und Hamburgische
// Staatsoper, die das je Vorstellung veröffentlichen.
//
// "Besuch loggen" lädt die Datei erst, wenn Haus, Werk und Datum gewählt
// sind, und schlägt daraus vor wie aus den Einträgen anderer Besucher
// (mitwirkendeVorschlag in besetzung.js) – als Knopf, nie von selbst.

import { besetzungsZeile } from './besetzung.js';

export const HAEUSER_MIT_BESETZUNG = ['oper-leipzig', 'semperoper', 'komische-oper-berlin', 'staatsoper-berlin', 'deutsche-oper-berlin', 'oper-frankfurt', 'hamburgische-staatsoper'];
export const BESETZUNG_ORDNER = 'daten/besetzung';

const geladen = new Map();

/** Die Datei eines Hauses, oder null (kein solches Haus, kein Netz, kaputt). */
export function ladeHausBesetzung(hausId, { abruf = (...a) => fetch(...a) } = {}) {
    if (!HAEUSER_MIT_BESETZUNG.includes(hausId)) return Promise.resolve(null);
    if (!geladen.has(hausId)) {
        geladen.set(hausId, (async () => {
            try {
                const r = await abruf(`./${BESETZUNG_ORDNER}/${encodeURIComponent(hausId)}.json`);
                if (!r.ok) return null;
                const d = await r.json();
                return d && typeof d.abende === 'object' ? d : null;
            } catch {
                geladen.delete(hausId);   // ohne Netz: beim nächsten Mal noch einmal
                return null;
            }
        })());
    }
    return geladen.get(hausId);
}

/**
 * Der Abend in der Form eines Besuchs ({ conductor, director, castList }),
 * wie ihn mitwirkendeVorschlag erwartet – oder null.
 */
export function hausAbend(daten, werkId, datum) {
    const a = daten?.abende?.[`${werkId}|${datum}`];
    if (!a) return null;
    const besetzung = Array.isArray(a.besetzung) ? a.besetzung.filter(p => p?.name) : [];
    const eintrag = {
        conductor: String(a.dirigent || ''),
        director: String(a.regie || ''),
        castList: besetzung.map(p => besetzungsZeile({ name: String(p.name), rolle: String(p.rolle || '') })).join('\n'),
    };
    return eintrag.conductor || eintrag.director || eintrag.castList ? eintrag : null;
}

/** Für "Besuch loggen": was das Haus für diesen Abend angibt, oder null. */
export async function hausMitwirkende({ houseId, operaId, date }, optionen) {
    const daten = await ladeHausBesetzung(houseId, optionen);
    return hausAbend(daten, operaId, date);
}
