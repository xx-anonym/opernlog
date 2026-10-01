// Hinweis für Admins oben auf der Startseite, wenn der Speicher bei Supabase
// fast voll ist. Die Rechnung steht in src/data/speicher.js, die Zahlen
// liefert speicher_belegt() (supabase/migrations/speicher_belegt_migration.sql),
// die nur Admins aufrufen dürfen. Alle anderen sehen nichts, und für sie
// geht auch keine Abfrage hinaus.

import { icon } from './Icon.js';
import { store } from '../store/store.js';
import { escapeHTML } from '../utils.js';
import { isSupabaseConfigured } from '../config.js';
import { speicherWarnungen } from '../data/speicher.js';
import * as sb from '../store/supabase.js';

// Die Startseite entsteht bei jedem Wechsel dorthin neu; eine Abfrage je
// Viertelstunde genügt.
const FRISCH_MS = 15 * 60 * 1000;
let zuletzt = null;   // { zeit, wert: Promise }

/** Setzt den Hinweis an den Anfang von `page`, falls ein Speicher fast voll ist. */
export async function speicherHinweis(page) {
    if (!store.isCloud || store.isOffline || !isSupabaseConfigured()) return;
    if (!(await sb.istAdmin())) return;
    if (!zuletzt || Date.now() - zuletzt.zeit > FRISCH_MS) {
        zuletzt = { zeit: Date.now(), wert: sb.getSpeicherBelegtCloud() };
    }
    let belegt;
    try {
        belegt = await zuletzt.wert;
    } catch (e) {
        zuletzt = null;
        console.warn('[Speicher] prüfen', e);
        return;
    }
    const warnungen = speicherWarnungen(belegt);
    if (!warnungen.length) return;
    const el = document.createElement('div');
    el.className = 'speicher-hinweis';
    el.setAttribute('role', 'status');
    el.innerHTML = warnungen.map(w => `<p class="speicher-hinweis__zeile">${icon('alert')}${escapeHTML(w.text)}</p>`).join('');
    page.prepend(el);
}
