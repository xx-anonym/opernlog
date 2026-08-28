// Saisonrückblick – der Jahresrückblick auf eine Spielzeit.
//
// Erreichbar auf drei Wegen: über den Hinweis auf der Startseite im Zeitfenster
// vom 31. Juli bis Ende August, über #/season direkt, und über das Osterei im
// eigenen Profil (Cmd+Ü).

import { store } from '../store/store.js';
import * as sb from '../store/supabase.js';
import { isSupabaseConfigured } from '../config.js';
import { icon } from '../components/Icon.js';
import { showToast, showError } from '../components/Toast.js';
import { escapeHTML, copyToClipboard } from '../utils.js';
import { StarRating } from '../components/StarRating.js';
import {
    buildSeasonReview,
    seasonLabel,
    seasonRange,
    lastCompletedSeasonStartYear,
    seasonsWithVisits,
} from '../data/season.js';

const MONATE_KURZ = ['Jan.', 'Feb.', 'März', 'April', 'Mai', 'Juni',
    'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'];

function datum(wert) {
    const m = String(wert || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '';
    return `${Number(m[3])}. ${MONATE_KURZ[Number(m[2]) - 1]} ${m[1]}`;
}

function zahl(n) {
    return new Intl.NumberFormat('de-DE').format(n);
}

/**
 * @param {string} param  Anfangsjahr aus der Adresse (#/season/2025), leer =
 *                        zuletzt abgeschlossene Spielzeit
 */
export function SeasonReviewPage(param) {
    const page = document.createElement('div');
    page.className = 'page page--season';

    const alleBesuche = store.getVisitsByUser('user-me') || [];

    // Gewünschte Spielzeit bestimmen. Ohne Angabe die zuletzt abgeschlossene –
    // und wenn in der nichts steht, die jüngste, in der überhaupt etwas steht.
    // Ein leerer Rückblick ist zwar ehrlich, aber niemand hat etwas davon.
    let startYear = Number.parseInt(param, 10);
    let ausweichend = false;
    if (!Number.isFinite(startYear)) {
        startYear = lastCompletedSeasonStartYear();
        const vorhanden = seasonsWithVisits(alleBesuche);
        if (!vorhanden.includes(startYear) && vorhanden.length) {
            startYear = vorhanden[0];
            ausweichend = true;
        }
    }

    const review = buildSeasonReview(alleBesuche, startYear);

    if (review.leer) {
        page.innerHTML = `
      <div class="season__hero season__hero--empty">
        <span class="season__kicker">Saisonrückblick</span>
        <h1 class="season__title">${seasonLabel(startYear)}</h1>
      </div>
      <div class="empty-state">
        <h3>Diese Spielzeit ist leer geblieben</h3>
        <p>In der Saison ${seasonLabel(startYear)} ist kein Besuch geloggt.</p>
        <a href="#/diary" class="btn btn--primary">Zum Tagebuch</a>
      </div>
    `;
        return page;
    }

    page.innerHTML = `
    <div class="season__hero">
      <span class="season__kicker">${ausweichend ? 'Dein letzter Rückblick' : 'Saisonrückblick'}</span>
      <h1 class="season__title">${review.label}</h1>
      <p class="season__lead">
        ${datum(review.firstVisit.date)} bis ${datum(review.lastVisit.date)}
      </p>
    </div>

    <div class="season__cards" id="seasonCards"></div>

    <div class="season__actions">
      <button class="btn btn--accent btn--lg" id="shareBtn">
        ${icon('link')}Rückblick teilen
      </button>
      <button class="btn btn--outline" id="imageBtn">
        ${icon('note')}Bild speichern
      </button>
    </div>

    <p class="season__foot">
      Eine Spielzeit läuft vom 1. August bis zum 31. Juli.
    </p>
  `;

    const cards = page.querySelector('#seasonCards');
    karten(review).forEach((karte, i) => {
        const el = document.createElement('div');
        el.className = `season-card season-card--${karte.groesse || 'normal'} fade-in`;
        el.style.animationDelay = `${Math.min(i, 9) * 60}ms`;
        // Aufzählungen bekommen kleinere Schrift als Namen: drei Hausnamen in
        // der Größe eines Komponistennamens erschlagen sonst die ganze Seite.
        const stil = karte.stil || (karte.wert.length > 40 ? 'liste' : '');
        el.innerHTML = `
      <span class="season-card__label">${karte.symbol ? icon(karte.symbol, { className: 'icon--meta' }) : ''}${karte.label}</span>
      <span class="season-card__value${stil ? ` season-card__value--${stil}` : ''}">${karte.wert}</span>
      ${karte.zusatz ? `<span class="season-card__note">${karte.zusatz}</span>` : ''}
    `;
        if (karte.nachbau) karte.nachbau(el);
        cards.appendChild(el);
    });

    // ── Vergleich mit den anderen ─────────────────────────────────────
    // Braucht das Netz, deshalb steht zuerst ein Platzhalter an zweiter
    // Stelle. Kommt nichts Brauchbares zurück – kein Konto, kein Netz, zu
    // wenige andere –, verschwindet er wieder, statt eine leere Kachel
    // stehen zu lassen.
    const vergleichKarte = document.createElement('div');
    vergleichKarte.className = 'season-card season-card--laedt';
    vergleichKarte.innerHTML = `
      <span class="season-card__label">${icon('users', { className: 'icon--meta' })}Im Vergleich</span>
      <span class="season-card__value season-card__value--liste">wird geladen …</span>
    `;
    cards.insertBefore(vergleichKarte, cards.children[1] || null);

    ladeVergleich(review).then((inhalt) => {
        if (!page.isConnected) return;
        if (!inhalt) { vergleichKarte.remove(); return; }
        vergleichKarte.classList.remove('season-card--laedt');
        vergleichKarte.innerHTML = `
      <span class="season-card__label">${icon('users', { className: 'icon--meta' })}${escapeHTML(inhalt.label)}</span>
      <span class="season-card__value">${escapeHTML(inhalt.wert)}</span>
      <span class="season-card__note">${escapeHTML(inhalt.zusatz)}</span>
    `;
    });

    // ── Teilen und Sichern ────────────────────────────────────────────
    const shareBtn = page.querySelector('#shareBtn');
    const imageBtn = page.querySelector('#imageBtn');

    // Das Bild wird schon beim Aufbau der Seite gezeichnet, nicht erst beim
    // Klick. Safari verlangt, dass navigator.share() innerhalb der
    // Nutzergeste aufgerufen wird; liegt das Bild fertig vor, kann zwischen
    // Klick und Aufruf nichts mehr dazwischenkommen. Gezeichnet wird nur
    // einmal, beide Knöpfe teilen sich dasselbe Ergebnis.
    let bildVersprechen = null;
    function bild() {
        if (!bildVersprechen) {
            bildVersprechen = zeichneKarte(review).then(leinwand => alsDatei(leinwand, review));
        }
        return bildVersprechen;
    }
    bild().catch(e => console.warn('[Saisonrückblick] Bild vorbereiten', e));

    shareBtn.addEventListener('click', async () => {
        shareBtn.disabled = true;
        try {
            const datei = await bild().catch(() => null);
            const ergebnis = await teilen(review, datei);
            if (ergebnis === 'kopiert') showToast('In die Zwischenablage kopiert');
            else if (ergebnis === 'fehlgeschlagen') showError('Teilen hat nicht geklappt.');
        } finally {
            shareBtn.disabled = false;
        }
    });

    imageBtn.addEventListener('click', async () => {
        imageBtn.disabled = true;
        try {
            const datei = await bild();
            const ergebnis = await sichern(review, datei);
            // Gemeldet wird nur, was tatsächlich passiert ist. Vorher stand
            // hier ausnahmslos "Bild gespeichert" – auch auf dem iPhone, wo
            // gar nichts gespeichert wurde.
            if (ergebnis === 'geladen') showToast('Bild wird heruntergeladen');
            else if (ergebnis === 'geoeffnet') showToast('Zum Sichern das Bild lange antippen');
            else if (ergebnis === 'blockiert') showError('Der Browser hat das Fenster blockiert.');
            else if (ergebnis === 'fehlgeschlagen') showError('Das Bild konnte nicht gesichert werden.');
        } catch (e) {
            console.error('[Saisonrückblick] Bild', e);
            showError('Das Bild konnte nicht erzeugt werden.');
        } finally {
            imageBtn.disabled = false;
        }
    });

    return page;
}

// ── Die einzelnen Kacheln ─────────────────────────────────────────────
// Nur was Inhalt hat, wird gebaut: wer keine Dirigenten einträgt, bekommt
// keine leere Kachel „Dirigent der Saison“ vorgesetzt.
function karten(r) {
    const liste = [];

    liste.push({
        groesse: 'gross',
        stil: 'zahl',
        symbol: 'seat',
        label: 'Abende in der Oper',
        wert: zahl(r.visitCount),
        zusatz: `${zahl(r.operaCount)} ${r.operaCount === 1 ? 'Werk' : 'Werke'} · `
            + `${zahl(r.houseCount)} ${r.houseCount === 1 ? 'Haus' : 'Häuser'} · `
            + `${zahl(r.cityCount)} ${r.cityCount === 1 ? 'Stadt' : 'Städte'}`,
    });

    if (r.topHouse?.house) {
        liste.push({
            symbol: 'building',
            label: 'Dein Stammhaus',
            wert: r.topHouse.house.name,
            zusatz: `${r.topHouse.anzahl} ${r.topHouse.anzahl === 1 ? 'Abend' : 'Abende'} · ${r.topHouse.house.city}`,
        });
    }

    if (r.topComposer) {
        liste.push({
            symbol: 'bookOpen',
            label: 'Komponist der Saison',
            wert: r.topComposer.wert,
            zusatz: `${r.topComposer.anzahl} ${r.topComposer.anzahl === 1 ? 'Abend' : 'Abende'}`,
        });
    }

    if (r.topConductor) {
        liste.push({
            symbol: 'music',
            label: 'Dirigent der Saison',
            wert: r.topConductor.wert,
            zusatz: `${r.topConductor.anzahl} ${r.topConductor.anzahl === 1 ? 'Abend' : 'Abende'} am Pult`,
        });
    }

    if (r.bestVisit?.opera) {
        liste.push({
            groesse: 'gross',
            symbol: 'heart',
            label: 'Der Abend der Saison',
            wert: r.bestVisit.opera.title,
            zusatz: [r.bestVisit.house?.name, datum(r.bestVisit.visit.date)].filter(Boolean).join(' · '),
            nachbau: (el) => {
                const box = document.createElement('div');
                box.className = 'season-card__stars';
                box.appendChild(StarRating(Number(r.bestVisit.visit.rating), false, null, 'sm'));
                el.appendChild(box);
            },
        });
    }

    liste.push({
        symbol: 'star',
        label: 'Dein Schnitt',
        wert: r.avgRating.toFixed(1).replace('.', ','),
        zusatz: 'von 5 Sternen',
    });

    if (r.travelKm > 0) {
        liste.push({
            symbol: 'globe',
            label: 'Zwischen den Häusern',
            wert: `${zahl(r.travelKm)} km`,
            zusatz: 'Luftlinie, in der Reihenfolge deiner Abende',
        });
    }

    if (r.newHouses.length) {
        liste.push({
            groesse: r.newHouses.length > 2 ? 'gross' : 'normal',
            symbol: 'pin',
            label: r.newHouses.length === 1 ? 'Neu entdeckt' : `Neu entdeckt (${r.newHouses.length})`,
            wert: r.newHouses.map(h => h.name).join(', '),
            zusatz: 'zum ersten Mal in deinem Tagebuch',
        });
    }

    if (r.repeats.length) {
        liste.push({
            groesse: 'gross',
            symbol: 'layers',
            label: 'Wiedersehen',
            wert: r.repeats.map(w => `${w.opera.title} (${w.anzahl}×)`).join(', '),
            zusatz: 'mehr als einmal in einer Spielzeit',
        });
    }

    if (r.topMonth) {
        liste.push({
            symbol: 'trending',
            label: 'Dein dichtester Monat',
            wert: r.topMonth.name,
            zusatz: `${r.topMonth.anzahl} ${r.topMonth.anzahl === 1 ? 'Abend' : 'Abende'}`,
        });
    }

    if (r.topWeekday) {
        liste.push({
            symbol: 'calendar',
            label: 'Dein Opernabend',
            wert: r.topWeekday.wert,
            zusatz: `${r.topWeekday.anzahl}× in dieser Spielzeit`,
        });
    }

    // Beschriftungen kommen aus dem Datenkatalog und aus Freitextfeldern des
    // Nutzers (Dirigent). Beides landet in innerHTML, also beides maskieren.
    return liste.map(k => ({
        ...k,
        label: escapeHTML(k.label),
        wert: escapeHTML(k.wert),
        zusatz: k.zusatz ? escapeHTML(k.zusatz) : '',
    }));
}

/**
 * Wie der eigene Saisonertrag neben dem der anderen dasteht.
 *
 * Verglichen wird nur mit Leuten, die in derselben Spielzeit überhaupt etwas
 * geloggt haben. Unter drei anderen ergibt der Prozentsatz keinen Sinn – bei
 * einem Gegenüber ist er zwangsläufig 0 oder 100 –, dann bleibt die Kachel
 * weg. Ebenso am unteren Ende: „mehr gesehen als 0 %“ ist kein Satz, den
 * jemand in seinem Rückblick lesen will.
 */
async function ladeVergleich(r) {
    if (!store.isCloud || !isSupabaseConfigured()) return null;
    const ich = store.getCurrentUser()?.id;

    try {
        const { from, to } = seasonRange(r.startYear);
        const zaehler = await sb.getSeasonVisitCounts(isoDatum(from), isoDatum(to));

        const andere = [...zaehler.entries()]
            .filter(([id]) => id && id !== ich)
            .map(([, anzahl]) => anzahl);
        if (andere.length < 3) return null;

        const wenigerAlsIch = andere.filter(n => n < r.visitCount).length;
        const prozent = Math.round((wenigerAlsIch / andere.length) * 100);

        if (prozent >= 100) {
            return {
                label: 'Im Vergleich',
                wert: 'Spitzenreiter',
                zusatz: 'Niemand hat in dieser Spielzeit mehr Abende geloggt',
            };
        }
        if (prozent < 1) return null;

        return {
            label: 'Mehr gesehen als',
            wert: `${prozent} %`,
            zusatz: `der ${andere.length} anderen, die in dieser Spielzeit geloggt haben`,
        };
    } catch (e) {
        console.warn('[Saisonrückblick] Vergleich nicht möglich', e);
        return null;
    }
}

// toISOString() verschiebt um die Zeitzone und kann einen Tag zurückrutschen –
// genau am Saisonrand entscheidet das über die Zuordnung.
function isoDatum(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        + `-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Text zum Teilen ───────────────────────────────────────────────────
function shareText(r) {
    const zeilen = [
        `Meine Opernsaison ${r.label}`,
        '',
        `${r.visitCount} ${r.visitCount === 1 ? 'Abend' : 'Abende'} · ${r.operaCount} Werke · ${r.houseCount} Häuser`,
    ];
    if (r.topHouse?.house) zeilen.push(`Stammhaus: ${r.topHouse.house.name}`);
    if (r.topComposer) zeilen.push(`Komponist der Saison: ${r.topComposer.wert}`);
    if (r.topConductor) zeilen.push(`Dirigent der Saison: ${r.topConductor.wert}`);
    if (r.bestVisit?.opera) zeilen.push(`Bester Abend: ${r.bestVisit.opera.title}`);
    if (r.travelKm > 0) zeilen.push(`${zahl(r.travelKm)} km zwischen den Häusern`);
    zeilen.push('', 'geloggt mit OpernLog');
    return zeilen.join('\n');
}

/**
 * iOS erkennen. Nicht aus Vorliebe für Browserweichen, sondern weil das
 * Herunterladen dort nachweislich nicht funktioniert (siehe sichern()) und
 * sich das mit keiner Eigenschaftsprüfung feststellen lässt: das
 * download-Attribut existiert auf iOS, es tut nur nichts.
 *
 * iPadOS meldet sich seit Version 13 als Macintosh – übrig bleibt als
 * Unterscheidung die Zahl der Berührungspunkte.
 */
function istIOS() {
    const ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua)
        || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** Leinwand zu Blob und File, beides wird gebraucht. */
async function alsDatei(leinwand, r) {
    const blob = await new Promise(res => leinwand.toBlob(res, 'image/png'));
    if (!blob) throw new Error('Leinwand ließ sich nicht in ein Bild wandeln');
    const name = `opernlog-saison-${r.label.replace('/', '-')}.png`;
    return { blob, name, file: new File([blob], name, { type: 'image/png' }) };
}

/**
 * Sichert das Bild – auf jedem System auf dem Weg, der dort funktioniert.
 *
 * Auf dem iPhone lädt ein <a download> weder eine data:- noch eine
 * blob:-Adresse herunter: in der installierten App passiert gar nichts, im
 * Browser fragt Safari nach und bricht danach still ab. Dort führt nur das
 * Teilen-Blatt zum Ziel, das "Bilder sichern" anbietet. Fehlt auch das
 * (ältere iOS-Versionen können keine Dateien teilen), bleibt das Bild in
 * einem neuen Tab, wo man es lange antippen und sichern kann.
 *
 * Überall sonst ist der Download der bessere Weg, und er funktioniert dort
 * auch – deshalb keine Umstellung für alle.
 */
async function sichern(r, datei) {
    if (!datei) return 'fehlgeschlagen';

    if (istIOS()) {
        if (navigator.canShare?.({ files: [datei.file] })) {
            try {
                await navigator.share({ files: [datei.file], title: `Meine Opernsaison ${r.label}` });
                return 'geteilt';
            } catch (e) {
                if (e?.name === 'AbortError') return 'abgebrochen';
                console.warn('[Saisonrückblick] Sichern über das Teilen-Blatt fehlgeschlagen', e);
            }
        }

        const url = URL.createObjectURL(datei.blob);
        const fenster = window.open(url, '_blank');
        if (!fenster) {
            URL.revokeObjectURL(url);
            return 'blockiert';
        }
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        return 'geoeffnet';
    }

    // Objekt- statt Datenadresse: eine data:-Adresse dieses Bildes ist rund
    // anderthalb Megabyte lang, und daran scheitern manche Browser.
    const url = URL.createObjectURL(datei.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = datei.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Erst freigeben, wenn der Browser den Download angestoßen hat.
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return 'geladen';
}

/**
 * Teilt den Rückblick – möglichst als Bild, sonst als Text, sonst über die
 * Zwischenablage. Jede Stufe kann ausfallen: das Teilen-Menü gibt es nur in
 * sicheren Kontexten und nicht in jedem Browser, das Teilen von Dateien noch
 * seltener. Bricht jemand das Menü ab, ist das kein Fehler.
 */
async function teilen(r, datei) {
    const text = shareText(r);
    const titel = `Meine Opernsaison ${r.label}`;

    if (datei && navigator.canShare?.({ files: [datei.file] })) {
        try {
            await navigator.share({ files: [datei.file], title: titel, text });
            return 'geteilt';
        } catch (e) {
            if (e?.name === 'AbortError') return 'abgebrochen';
            console.warn('[Saisonrückblick] Teilen mit Bild fehlgeschlagen', e);
        }
    }

    if (navigator.share) {
        try {
            await navigator.share({ title: titel, text });
            return 'geteilt';
        } catch (e) {
            if (e?.name === 'AbortError') return 'abgebrochen';
            console.warn('[Saisonrückblick] Teilen fehlgeschlagen', e);
        }
    }

    return await copyToClipboard(text) ? 'kopiert' : 'fehlgeschlagen';
}

// ── Das Bild ──────────────────────────────────────────────────────────
// 1080x1920 – das Hochformat, das Instagram- und WhatsApp-Status
// ungeschnitten zeigen. Die Höhe ist reichlich bemessen, damit auch sechs
// Zeilen samt Fußnote hineinpassen; ein erster Entwurf mit 1350 lief unten
// über und schob die Fußnote in die letzte Zeile.
async function zeichneKarte(r) {
    const B = 1080, H = 1920, RAND = 80;
    const c = document.createElement('canvas');
    c.width = B; c.height = H;
    const g = c.getContext('2d');

    // Ohne das Warten zeichnet Chrome die Überschrift in der Ersatzschrift,
    // weil Playfair Display beim ersten Aufruf noch nicht geladen ist.
    try { await document.fonts.ready; } catch (e) { /* dann eben ohne */ }

    const verlauf = g.createLinearGradient(0, 0, B, H);
    verlauf.addColorStop(0, '#1a1f26');
    verlauf.addColorStop(0.55, '#14181c');
    verlauf.addColorStop(1, '#2a1015');
    g.fillStyle = verlauf;
    g.fillRect(0, 0, B, H);

    g.fillStyle = '#c9a84c';
    g.font = '600 32px "DM Sans", sans-serif';
    g.fillText('OPERNLOG', RAND, 150);

    g.fillStyle = '#9ab';
    g.font = '400 38px "DM Sans", sans-serif';
    g.fillText('Saisonrückblick', RAND, 265);

    g.fillStyle = '#f0e6d2';
    g.font = '700 130px "Playfair Display", Georgia, serif';
    g.fillText(r.label, RAND, 400);

    g.fillStyle = '#b22d40';
    g.fillRect(RAND, 455, 150, 7);

    g.fillStyle = '#f0e6d2';
    g.font = '700 220px "Playfair Display", Georgia, serif';
    g.fillText(String(r.visitCount), RAND, 700);
    const breite = g.measureText(String(r.visitCount)).width;
    g.fillStyle = '#9ab';
    g.font = '400 46px "DM Sans", sans-serif';
    g.fillText(r.visitCount === 1 ? 'Abend' : 'Abende', RAND + breite + 26, 700);

    const zeilen = [
        [`${r.operaCount} ${r.operaCount === 1 ? 'Werk' : 'Werke'} in `
            + `${r.houseCount} ${r.houseCount === 1 ? 'Haus' : 'Häusern'}`, null],
        r.topHouse?.house ? ['Stammhaus', r.topHouse.house.name] : null,
        r.topComposer ? ['Komponist der Saison', r.topComposer.wert] : null,
        r.topConductor ? ['Dirigent der Saison', r.topConductor.wert] : null,
        r.bestVisit?.opera ? ['Bester Abend', r.bestVisit.opera.title] : null,
        r.travelKm > 0 ? ['Zwischen den Häusern', `${zahl(r.travelKm)} km`] : null,
    ].filter(Boolean);

    const untergrenze = H - 170;   // darunter beginnt die Fußzeile
    let y = 850;
    for (const [label, wert] of zeilen) {
        const hoehe = wert === null ? 110 : 150;
        if (y + hoehe > untergrenze) break;   // lieber weglassen als überlaufen

        if (wert === null) {
            g.fillStyle = '#e0e0e0';
            g.font = '400 48px "DM Sans", sans-serif';
            g.fillText(kuerze(g, label, B - 2 * RAND), RAND, y);
        } else {
            g.fillStyle = '#678';
            g.font = '600 28px "DM Sans", sans-serif';
            g.fillText(label.toUpperCase(), RAND, y);
            g.fillStyle = '#e0e0e0';
            g.font = '400 52px "DM Sans", sans-serif';
            g.fillText(kuerze(g, wert, B - 2 * RAND), RAND, y + 62);
        }
        y += hoehe;
    }

    g.fillStyle = '#678';
    g.font = '400 30px "DM Sans", sans-serif';
    g.fillText('opernlog.vercel.app', RAND, H - 80);

    return c;
}

// Zu lange Namen abschneiden, statt sie über den Rand laufen zu lassen.
function kuerze(g, text, maxBreite) {
    if (g.measureText(text).width <= maxBreite) return text;
    let s = text;
    while (s.length > 1 && g.measureText(s + '…').width > maxBreite) s = s.slice(0, -1);
    return s + '…';
}
