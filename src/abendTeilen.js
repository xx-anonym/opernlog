// Einen einzelnen Abend teilen (seit 18.11.2026): das Bild aus
// src/components/Teilbild.js, dazu ein kurzer Text mit Link.
//
// Der Link führt direkt auf den Abend: opernlog.de/abend/<id> (api/abend.mjs).
// Die Seite entsteht auf dem Server, hat eine Linkvorschau mit Werk, Haus und
// Sternen, ist ohne Konto lesbar, und wer angemeldet ist, landet gleich in
// der App beim Eintrag. Ein Link auf #/visit/… zeigte in WhatsApp nur die
// Startseite und verlangte eine Anmeldung.
//
// Ohne Konto liegen die Abende nur im Gerät; dann führt der Link auf die
// Seite des Werks (tests/werkzeug/seiten-erzeugen.mjs).

import { NEUE_ADRESSE } from './umzug.js';
import { abendDatum } from './components/Teilbild.js';
import { istCloudId } from './teilen.js';

/**
 * Seiten entstehen für alle Werke, die beim letzten Lauf von
 * seiten-erzeugen bekannt waren. Ein Werk, das seitdem in der Datenbank
 * angelegt wurde, hat noch keine – dann die Startseite statt eines 404.
 * Werke aus der Datenbank, die vor dem Lauf schon da waren, verlieren so ihre
 * eigene Seite im Link; das ist der kleinere Fehler.
 */
export function abendLink(opera) {
    if (!opera?.id || opera.ausDatenbank) return `${NEUE_ADRESSE}/`;
    return `${NEUE_ADRESSE}/oper/${encodeURIComponent(opera.id)}/`;
}

/** opernlog.de/abend/<id> – nur für Abende, die in der Datenbank stehen. */
export function abendDirektlink(visit) {
    return istCloudId(visit?.id) && !visit.ausstehend ? `${NEUE_ADRESSE}/abend/${visit.id}` : null;
}

/** "4 von 5 Sternen", "3,5 von 5 Sternen"; ohne Bewertung leer. */
export function sterneSatz(note) {
    const n = Math.min(5, Math.max(0, Math.round((Number(note) || 0) * 2) / 2));
    if (!n) return '';
    return `${String(n).replace('.', ',')} von 5 ${n === 1 ? 'Stern' : 'Sternen'}`;
}

/** Was das Bild zeigt, als Daten für zeichneAbendbild(). */
export function abendbildDaten(visit, opera, house) {
    return {
        titel: opera?.title || 'Oper',
        komponist: opera?.composer || '',
        haus: house?.name || '',
        stadt: house?.city || '',
        datum: visit.date || visit.created_at || '',
        sterne: Number(visit.rating) || 0,
        review: visit.review || '',
        dirigent: String(visit.conductor ?? '').trim(),
        regie: String(visit.director ?? '').trim(),
    };
}

/** Der Text zum Bild – und der ganze Inhalt, wo nur Text geteilt werden kann. */
export function abendText(visit, opera, house) {
    const kopf = opera ? `${opera.title}${opera.composer ? ` von ${opera.composer}` : ''}` : 'Ein Abend in der Oper';
    const zeile = [house?.name, abendDatum(visit.date || visit.created_at), sterneSatz(visit.rating)].filter(Boolean).join(' · ');
    return [kopf, zeile, '', abendDirektlink(visit) || abendLink(opera)].filter((z, i) => z || i === 2).join('\n');
}

export const abendDateiname = (visit, opera) =>
    `opernlog-${(opera?.id || 'abend').replace(/[^a-z0-9-]/gi, '')}-${String(visit.date || '').slice(0, 10) || 'abend'}.png`;
