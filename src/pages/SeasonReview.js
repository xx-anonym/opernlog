// Saisonrückblick – der Jahresrückblick auf eine Spielzeit.
//
// Erreichbar auf drei Wegen: über den Hinweis auf der Startseite im Zeitfenster
// vom 31. Juli bis Ende August, über #/season direkt, und über das Osterei im
// eigenen Profil (Cmd+Ü).

import { store } from '../store/store.js';
import { icon } from '../components/Icon.js';
import { showToast, showError } from '../components/Toast.js';
import { escapeHTML, copyToClipboard } from '../utils.js';
import { StarRating } from '../components/StarRating.js';
import {
    buildSeasonReview,
    seasonLabel,
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
      <span class="season-card__label">${karte.label}</span>
      <span class="season-card__value${stil ? ` season-card__value--${stil}` : ''}">${karte.wert}</span>
      ${karte.zusatz ? `<span class="season-card__note">${karte.zusatz}</span>` : ''}
    `;
        if (karte.nachbau) karte.nachbau(el);
        cards.appendChild(el);
    });

    // ── Teilen ────────────────────────────────────────────────────────
    const shareBtn = page.querySelector('#shareBtn');
    const imageBtn = page.querySelector('#imageBtn');

    shareBtn.addEventListener('click', async () => {
        shareBtn.disabled = true;
        try {
            const ergebnis = await teilen(review);
            if (ergebnis === 'kopiert') showToast('In die Zwischenablage kopiert');
            else if (ergebnis === 'fehlgeschlagen') showError('Teilen hat nicht geklappt.');
        } finally {
            shareBtn.disabled = false;
        }
    });

    imageBtn.addEventListener('click', async () => {
        imageBtn.disabled = true;
        try {
            const leinwand = await zeichneKarte(review);
            const url = leinwand.toDataURL('image/png');
            const a = document.createElement('a');
            a.href = url;
            a.download = `opernlog-saison-${review.label.replace('/', '-')}.png`;
            a.click();
            showToast('Bild gespeichert');
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
        label: 'Abende in der Oper',
        wert: zahl(r.visitCount),
        zusatz: `${zahl(r.operaCount)} ${r.operaCount === 1 ? 'Werk' : 'Werke'} · `
            + `${zahl(r.houseCount)} ${r.houseCount === 1 ? 'Haus' : 'Häuser'} · `
            + `${zahl(r.cityCount)} ${r.cityCount === 1 ? 'Stadt' : 'Städte'}`,
    });

    if (r.topHouse?.house) {
        liste.push({
            label: 'Dein Stammhaus',
            wert: r.topHouse.house.name,
            zusatz: `${r.topHouse.anzahl} ${r.topHouse.anzahl === 1 ? 'Abend' : 'Abende'} · ${r.topHouse.house.city}`,
        });
    }

    if (r.topComposer) {
        liste.push({
            label: 'Komponist der Saison',
            wert: r.topComposer.wert,
            zusatz: `${r.topComposer.anzahl} ${r.topComposer.anzahl === 1 ? 'Abend' : 'Abende'}`,
        });
    }

    if (r.topConductor) {
        liste.push({
            label: 'Dirigent der Saison',
            wert: r.topConductor.wert,
            zusatz: `${r.topConductor.anzahl} ${r.topConductor.anzahl === 1 ? 'Abend' : 'Abende'} am Pult`,
        });
    }

    if (r.bestVisit?.opera) {
        liste.push({
            groesse: 'gross',
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
        label: 'Dein Schnitt',
        wert: r.avgRating.toFixed(1).replace('.', ','),
        zusatz: 'von 5 Sternen',
    });

    if (r.travelKm > 0) {
        liste.push({
            label: 'Zwischen den Häusern',
            wert: `${zahl(r.travelKm)} km`,
            zusatz: 'Luftlinie, in der Reihenfolge deiner Abende',
        });
    }

    if (r.newHouses.length) {
        liste.push({
            groesse: r.newHouses.length > 2 ? 'gross' : 'normal',
            label: r.newHouses.length === 1 ? 'Neu entdeckt' : `Neu entdeckt (${r.newHouses.length})`,
            wert: r.newHouses.map(h => h.name).join(', '),
            zusatz: 'zum ersten Mal in deinem Tagebuch',
        });
    }

    if (r.repeats.length) {
        liste.push({
            groesse: 'gross',
            label: 'Wiedersehen',
            wert: r.repeats.map(w => `${w.opera.title} (${w.anzahl}×)`).join(', '),
            zusatz: 'mehr als einmal in einer Spielzeit',
        });
    }

    if (r.topMonth) {
        liste.push({
            label: 'Dein dichtester Monat',
            wert: r.topMonth.name,
            zusatz: `${r.topMonth.anzahl} ${r.topMonth.anzahl === 1 ? 'Abend' : 'Abende'}`,
        });
    }

    if (r.topWeekday) {
        liste.push({
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
 * Teilt den Rückblick – möglichst als Bild, sonst als Text, sonst über die
 * Zwischenablage. Jede Stufe kann ausfallen: das Teilen-Menü gibt es nur in
 * sicheren Kontexten und nicht in jedem Browser, das Teilen von Dateien noch
 * seltener. Bricht jemand das Menü ab, ist das kein Fehler.
 */
async function teilen(r) {
    const text = shareText(r);
    const titel = `Meine Opernsaison ${r.label}`;

    let datei = null;
    try {
        const leinwand = await zeichneKarte(r);
        const blob = await new Promise(res => leinwand.toBlob(res, 'image/png'));
        if (blob) {
            datei = new File([blob], `opernlog-saison-${r.label.replace('/', '-')}.png`,
                { type: 'image/png' });
        }
    } catch (e) {
        console.warn('[Saisonrückblick] Bild für das Teilen fehlgeschlagen', e);
    }

    if (datei && navigator.canShare?.({ files: [datei] })) {
        try {
            await navigator.share({ files: [datei], title: titel, text });
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
