// "Meine Daten herunterladen": alles, was OpernLog zu einem Konto speichert,
// als eine Datei.
//
// Wer ein Konto hat, darf seine Daten in einem gängigen, maschinenlesbaren
// Format mitnehmen (Art. 20 DSGVO). JSON, weil die Daten verschachtelt sind –
// ein Abend hat eine Besetzung, eine Liste ihre Einträge – und eine Tabelle
// das nur verlustreich abbilden könnte.
//
// Die Zeilen kommen so, wie sie in der Datenbank stehen
// (sb.meineDatenCloud()). Dazu schreibt diese Datei, was ohne die App
// unverständlich wäre: den Titel eines Werks neben seiner Kennung, den Namen
// eines Freundes neben seiner Id. Weggelassen wird nichts außer den
// Schlüsseln der Push-Abos; die sind Technik des Browsers, keine Angaben
// über die Person, und gehören nicht in eine Datei, die herumliegen kann.

export const DATEI_TYP = 'application/json';

/** opernlog-daten-2026-09-27.json – nach dem lokalen Datum, nicht nach UTC. */
export function exportDateiname(jetzt = new Date()) {
    const zwei = n => String(n).padStart(2, '0');
    return `opernlog-daten-${jetzt.getFullYear()}-${zwei(jetzt.getMonth() + 1)}-${zwei(jetzt.getDate())}.json`;
}

/**
 * @param {object} roh      Ergebnis von sb.meineDatenCloud()
 * @param {object} kontext  werke, haeuser (die Katalog-Arrays), version,
 *                          jetzt, ausstehend (noch nicht übertragene Abende)
 * @returns {object} was als JSON in die Datei geht
 */
export function datenExport(roh, { werke = [], haeuser = [], version = '', jetzt = new Date(), ausstehend = [] } = {}) {
    const werkTitel = id => werke.find(w => w.id === id)?.title ?? null;
    const hausName = id => haeuser.find(h => h.id === id)?.name ?? null;
    const personen = new Map((roh.personen ?? []).map(p => [p.id, p.username]));
    const person = id => ({ id, name: personen.get(id) ?? null });

    const ergebnis = {
        ueber: {
            app: 'OpernLog',
            adresse: 'https://opernlog.vercel.app',
            version,
            erstellt: jetzt.toISOString(),
            inhalt: 'Alles, was OpernLog zu deinem Konto speichert. Kennungen wie "tosca" oder '
                + '"wiener-staatsoper" sind die Einträge aus dem Katalog der App; ihr Name steht jeweils daneben.',
        },
        konto: roh.konto ?? null,
        profil: roh.profil ?? null,
        abende: (roh.abende ?? []).map(v => ({
            ...v,
            werk: werkTitel(v.opera_id),
            haus: hausName(v.house_id),
        })),
        listen: (roh.listen ?? []).map(l => ({
            ...l,
            eintraege: (l.items ?? []).map(id => ({ id, name: werkTitel(id) ?? hausName(id) })),
        })),
        schon_gesehen: (roh.gesehen ?? []).map(g => ({ ...g, werk: werkTitel(g.opera_id) })),
        kommentare: roh.kommentare ?? [],
        gefaellt_mir: roh.likes ?? [],
        freunde: {
            du_folgst: (roh.ichFolge ?? []).map(f => ({ ...person(f.following_id), seit: f.created_at })),
            folgen_dir: (roh.folgenMir ?? []).map(f => ({ ...person(f.follower_id), seit: f.created_at })),
        },
        freundschaftsanfragen: (roh.anfragen ?? []).map(a => ({
            ...a,
            von: person(a.sender_id).name,
            an: person(a.receiver_id).name,
        })),
        einladungslinks: roh.einladungen ?? [],
        vorschlaege: roh.vorschlaege ?? [],
        // null: die Liste ließ sich nicht laden – nicht dasselbe wie keine.
        passkeys: roh.passkeys ?? null,
        mitteilungen_geraete: (roh.pushAbos ?? []).map(({ p256dh, auth, ...rest }) => rest),
    };

    // Abende, die ohne Netz geloggt wurden und nur auf diesem Gerät liegen.
    // Sie stehen (noch) nicht in der Datenbank, gehören aber genauso dazu.
    if (ausstehend.length) ergebnis.noch_nicht_uebertragen = ausstehend;

    // Nur für Admins: was sie am Katalog angelegt oder zugeschnitten haben.
    const katalog = roh.katalog ?? {};
    if (Object.values(katalog).some(zeilen => zeilen?.length)) ergebnis.katalog_von_dir = katalog;

    return ergebnis;
}
