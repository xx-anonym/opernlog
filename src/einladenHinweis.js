// "Kennst du jemanden, der auch in die Oper geht?" (Jonas, 20.11.2026, für
// mehr Reichweite).
//
// Einmal, und nur in einem guten Moment: gleich nach dem Loggen eines Abends,
// wenn im Tagebuch mindestens drei stehen. Dann steht oben im Tagebuch eine
// schlichte Zeile mit "Einladen" und "Nein danke". Ob man tippt oder nicht –
// gefragt wird nie wieder (auf diesem Gerät). "Einladen" erzeugt einen
// Einladungslink wie unter Freunde → Einladen und öffnet das Teilen-Menü.

import { escapeHTML } from './utils.js';

export const EINLADEN_AB = 3;
export const EINLADEN_GEFRAGT = 'opernlog:einladenGefragt';
export const GERADE_GELOGGT = 'opernlog:geradeGeloggt';

/** LogVisit merkt sich, dass eben ein neuer Abend in die Cloud ging. */
export function geradeGeloggtMerken(umgebung = globalThis) {
    try { umgebung.sessionStorage?.setItem(GERADE_GELOGGT, '1'); } catch { /* ohne Speicher: keine Frage */ }
}

/**
 * Ob das Tagebuch jetzt fragen soll. Liest den Merker vom Loggen und löscht
 * ihn; ist es so weit, wird zugleich vermerkt, dass gefragt wurde.
 */
export function einladenFragen({ anzahl, cloud, umgebung = globalThis }) {
    try {
        const gerade = umgebung.sessionStorage?.getItem(GERADE_GELOGGT) === '1';
        umgebung.sessionStorage?.removeItem(GERADE_GELOGGT);
        if (!gerade || !cloud || anzahl < EINLADEN_AB) return false;
        if (umgebung.localStorage?.getItem(EINLADEN_GEFRAGT)) return false;
        umgebung.localStorage?.setItem(EINLADEN_GEFRAGT, new Date().toISOString().slice(0, 10));
        return true;
    } catch {
        return false;
    }
}

/**
 * Die Zeile. einladen() erzeugt den Link und teilt ihn; was es zurückgibt
 * ('geteilt', 'kopiert', …), entscheidet über die kurze Rückmeldung.
 */
export function einladenHinweis({ einladen, melden }) {
    const el = document.createElement('div');
    el.className = 'einladen-hinweis';
    el.setAttribute('role', 'status');
    el.innerHTML = `
        <p class="einladen-hinweis__text">${escapeHTML('Kennst du jemanden, der auch in die Oper geht?')}</p>
        <div class="einladen-hinweis__knoepfe">
            <button type="button" class="btn btn--primary btn--sm" data-einladen>Einladen</button>
            <button type="button" class="btn btn--ghost btn--sm" data-weg>Nein danke</button>
        </div>`;
    el.querySelector('[data-weg]').addEventListener('click', () => el.remove());
    el.querySelector('[data-einladen]').addEventListener('click', async (e) => {
        const knopf = e.currentTarget;
        knopf.disabled = true;
        try {
            const ergebnis = await einladen();
            if (ergebnis === 'abgebrochen') { knopf.disabled = false; return; }
            melden?.(ergebnis);
            el.remove();
        } catch (err) {
            console.warn('[Einladen]', err);
            melden?.('fehlgeschlagen');
            knopf.disabled = false;
        }
    });
    return el;
}
