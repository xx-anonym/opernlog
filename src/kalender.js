// Ein Termin aus dem Spielplan als Kalenderdatei (iCalendar, RFC 5545).
//
// Die Datei entsteht im Browser, ohne Server: Werk, Haus mit Ort und
// Koordinaten, Beginn, Ende und der Link auf die Seite des Hauses. Ohne
// bekannte Uhrzeit wird es ein ganztägiger Eintrag; ohne bekanntes Ende
// ein dreistündiger, und die Beschreibung sagt das.

// Alle Häuser im Katalog liegen in derselben Zeitzone, mit denselben
// Umstellungstagen. Die Kennung richtet sich trotzdem nach dem Land, damit
// ein Kalender in Wien nicht "Berlin" anzeigt.
const ZONE = { 'Österreich': 'Europe/Vienna', 'Schweiz': 'Europe/Zurich' };
const zoneFuer = haus => ZONE[haus?.state] || 'Europe/Berlin';

const GESCHAETZT_STUNDEN = 3;

const zwei = n => String(n).padStart(2, '0');

/** Text für ein Feld: Backslash, Semikolon, Komma und Zeilenumbruch maskiert. */
function feld(text) {
    return String(text ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/**
 * Zeilen dürfen höchstens 75 Byte lang sein; länger wird gefaltet (CRLF und
 * ein Leerzeichen). Gezählt wird in UTF-8, und ein Zeichen wird nie geteilt.
 */
function falten(zeile) {
    const kodierer = new TextEncoder();
    const teile = [];
    let aktuell = '';
    let bytes = 0;
    for (const zeichen of zeile) {
        const laenge = kodierer.encode(zeichen).length;
        const grenze = teile.length ? 74 : 75;   // Folgezeilen beginnen mit einem Leerzeichen
        if (bytes + laenge > grenze) {
            teile.push(aktuell);
            aktuell = '';
            bytes = 0;
        }
        aktuell += zeichen;
        bytes += laenge;
    }
    teile.push(aktuell);
    return teile.join('\r\n ');
}

/** "2026-12-05" und "19:30" → "20261205T193000"; Stunden über 24 gehen in den nächsten Tag. */
function ortszeit(datum, stunde, minute) {
    const [j, m, t] = datum.split('-').map(Number);
    const d = new Date(Date.UTC(j, m - 1, t, stunde, minute));
    return `${d.getUTCFullYear()}${zwei(d.getUTCMonth() + 1)}${zwei(d.getUTCDate())}T${zwei(d.getUTCHours())}${zwei(d.getUTCMinutes())}00`;
}

function tagDanach(datum) {
    const [j, m, t] = datum.split('-').map(Number);
    const d = new Date(Date.UTC(j, m - 1, t + 1));
    return `${d.getUTCFullYear()}${zwei(d.getUTCMonth() + 1)}${zwei(d.getUTCDate())}`;
}

function utcStempel(jetzt) {
    return jetzt.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function zeitzone(tzid) {
    return [
        'BEGIN:VTIMEZONE', `TZID:${tzid}`,
        'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST',
        'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
        'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET',
        'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
        'END:VTIMEZONE',
    ];
}

/**
 * @param {object} o
 * @param {{id: string, title: string, composer?: string}} o.werk
 * @param {{id: string, name: string, city?: string, state?: string, lat?: number, lon?: number}} o.haus
 * @param {string} o.datum   "2026-12-05"
 * @param {string} [o.zeit]  "19:30" oder "19:30-22:30"
 * @param {string} [o.url]   Seite des Hauses zu diesem Werk
 * @returns {string} Inhalt der .ics-Datei, Zeilenenden CRLF
 */
export function kalenderEintrag({ werk, haus, datum, zeit = null, url = '', jetzt = new Date() }) {
    const tzid = zoneFuer(haus);
    const hinweise = [];
    let zeitZeilen;
    const m = /^(\d{2}):(\d{2})(?:-(\d{2}):(\d{2}))?$/.exec(zeit || '');
    if (m) {
        const [bh, bm] = [Number(m[1]), Number(m[2])];
        let ende;
        if (m[3]) {
            let [eh, em] = [Number(m[3]), Number(m[4])];
            // Ende nach Mitternacht: am nächsten Tag
            if (eh * 60 + em <= bh * 60 + bm) eh += 24;
            ende = ortszeit(datum, eh, em);
        } else {
            ende = ortszeit(datum, bh + GESCHAETZT_STUNDEN, bm);
            hinweise.push(`Das Ende ist geschätzt (${GESCHAETZT_STUNDEN} Stunden).`);
        }
        zeitZeilen = [`DTSTART;TZID=${tzid}:${ortszeit(datum, bh, bm)}`, `DTEND;TZID=${tzid}:${ende}`];
    } else {
        zeitZeilen = [`DTSTART;VALUE=DATE:${datum.replace(/-/g, '')}`, `DTEND;VALUE=DATE:${tagDanach(datum)}`];
        hinweise.push('Die Uhrzeit steht auf der Seite des Hauses.');
    }

    const beschreibung = [
        werk.composer ? `${werk.composer}: ${werk.title}` : werk.title,
        url ? `Termine und Karten: ${url}` : '',
        ...hinweise,
        'Aus OpernLog – maßgeblich ist die Seite des Hauses.',
    ].filter(Boolean).join('\n');

    const zeilen = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//OpernLog//Spielplan//DE',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        ...(m ? zeitzone(tzid) : []),
        'BEGIN:VEVENT',
        `UID:${werk.id}-${haus.id}-${datum}@opernlog.vercel.app`,
        `DTSTAMP:${utcStempel(jetzt)}`,
        ...zeitZeilen,
        `SUMMARY:${feld(`${werk.title} – ${haus.name}`)}`,
        `LOCATION:${feld([haus.name, haus.city].filter(Boolean).join(', '))}`,
        ...(Number.isFinite(haus.lat) && Number.isFinite(haus.lon) ? [`GEO:${haus.lat};${haus.lon}`] : []),
        ...(url ? [`URL:${url}`] : []),
        `DESCRIPTION:${feld(beschreibung)}`,
        'END:VEVENT',
        'END:VCALENDAR',
    ];
    return zeilen.map(falten).join('\r\n') + '\r\n';
}

/** "tosca-semperoper-2026-12-05.ics" */
export function kalenderDateiname(werk, haus, datum) {
    return `${werk.id}-${haus.id}-${datum}.ics`;
}

/**
 * Gibt die Datei an den Browser.
 *
 * Chrome, Firefox und der Desktop laden sie herunter; ein Tipp darauf öffnet
 * den Kalender. Auf iPhone und iPad landete ein Download in "Dateien" – aus
 * der installierten App heraus oft gar nicht. Dort wird die Datei deshalb in
 * einem eigenen Fenster geöffnet: Safari erkennt text/calendar und bietet
 * "Hinzufügen" an, und die App bleibt, wo sie war.
 */
export function kalenderHerunterladen(text, dateiname, umgebung = globalThis) {
    const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
    const adresse = URL.createObjectURL(blob);
    if (istAppleMobil(umgebung)) {
        umgebung.open(adresse, '_blank');
    } else {
        const a = document.createElement('a');
        a.href = adresse;
        a.download = dateiname;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }
    setTimeout(() => URL.revokeObjectURL(adresse), 60000);
}

// iPadOS gibt sich als Mac aus; verraten wird es durch den Touchscreen.
function istAppleMobil(umgebung) {
    const nav = umgebung.navigator || {};
    return /iPhone|iPad|iPod/.test(nav.userAgent || '') || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
}
