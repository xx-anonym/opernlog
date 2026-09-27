// Geplante Besuche: Abende, die man sich aus dem Spielplan vorgemerkt hat.
//
// Ein Plan ist { id, operaId, houseId, datum, zeit }. Die Startseite zeigt
// die kommenden; ist ein Abend vorbei und noch nicht geloggt, fragt sie, wie
// er war. Gespeichert werden Pläne privat (geplante_besuche), siehe
// supabase/migrations/geplante_besuche_migration.sql.

const WOCHENTAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/** Aus "2026-11-14" ein Datum um die Mittagszeit – keine Zeitzone verschiebt den Tag. */
const tag = iso => new Date(`${iso}T12:00:00`);
const tageZwischen = (von, bis) => Math.round((tag(bis) - tag(von)) / 86400000);

/** Die kommenden Pläne, der nächste zuerst. Heute zählt dazu. */
export function kommendePlaene(plaene, heute) {
    return (plaene || []).filter(p => p.datum >= heute)
        .sort((a, b) => a.datum.localeCompare(b.datum) || String(a.zeit || '').localeCompare(String(b.zeit || '')));
}

/** Gibt es zu diesem Plan schon einen geloggten Abend – gleiches Werk, Haus, Datum? */
export function erledigt(plan, besuche) {
    return (besuche || []).some(v => v.operaId === plan.operaId && v.houseId === plan.houseId && v.date === plan.datum);
}

/** Vorbei und noch nicht geloggt – der jüngste zuerst. */
export function offenePlaene(plaene, besuche, heute) {
    return (plaene || []).filter(p => p.datum < heute && !erledigt(p, besuche))
        .sort((a, b) => b.datum.localeCompare(a.datum));
}

/** Der Plan, den ein gerade geloggter Abend erfüllt, falls es einen gibt. */
export function planZuBesuch(plaene, besuch) {
    return (plaene || []).find(p => p.operaId === besuch.operaId && p.houseId === besuch.houseId && p.datum === besuch.date) || null;
}

/**
 * Wann, in Worten, für "Wie war …?" und "Demnächst":
 * "heute", "gestern", "morgen", "am Samstag" (innerhalb einer Woche), sonst
 * "am 14. November".
 */
export function wannText(datum, heute) {
    const d = tageZwischen(heute, datum);
    if (d === 0) return 'heute';
    if (d === -1) return 'gestern';
    if (d === 1) return 'morgen';
    const t = tag(datum);
    if (Math.abs(d) < 7) return `am ${WOCHENTAGE[t.getDay()]}`;
    return `am ${t.getDate()}. ${MONATE[t.getMonth()]}`;
}
