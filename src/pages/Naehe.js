// "In der Nähe": was an den Häusern im Katalog demnächst läuft.
//
// Die Termine aus src/data/spielplan.js, jeder Abend einzeln und nach Datum,
// im gewählten Umkreis um den eigenen Standort. Die Wunschliste und die
// Werkseite zeigen dieselben Daten je Werk; hier geht es andersherum: nicht
// "wo läuft Tosca?", sondern "was läuft hier?".

import { icon } from '../components/Icon.js';
import { showToast, showError } from '../components/Toast.js';
import { escapeHTML, getCachedPosition, requestPosition, standortHinweis } from '../utils.js';
import { operas } from '../data/operas.js';
import { store } from '../store/store.js';
import {
    abendeInDerNaehe, heuteIso, tagePlus, terminMitWochentag, zeitText,
    UMKREIS_STUFEN, naechsteStufe, umkreisNachZoom,
} from '../data/spielplanAbfrage.js';
import { spielplanQuelle } from '../components/SpielplanBlock.js';
import { HouseMap } from '../components/HouseMap.js';
import { operaHouses } from '../data/operaHouses.js';
import { kalenderEintrag, kalenderDateiname, kalenderHerunterladen } from '../kalender.js';

export { UMKREIS_STUFEN };
const ZEITRAEUME = [
    { tage: 7, text: 'Nächste 7 Tage' },
    { tage: 30, text: 'Nächste 30 Tage' },
    { tage: 90, text: 'Nächste 3 Monate' },
    { tage: null, text: 'Ganze Spielzeit' },
];
// So viele Abende stehen sofort da; der Rest auf Wunsch.
const SICHTBAR = 60;

const MERKER = 'opernlog_naehe';

/** Ein Gerät mit Fingern statt Maus – für den Hinweis unter der Karte. */
const beruehrbar = () => !!globalThis.matchMedia?.('(pointer: coarse)')?.matches;

function gemerkt() {
    try { return JSON.parse(localStorage.getItem(MERKER)) || {}; } catch { return {}; }
}

function merken({ umkreis, tage, nurWunschliste, karte }) {
    try {
        localStorage.setItem(MERKER, JSON.stringify({ umkreis, tage, nurWunschliste, karte }));
    } catch { /* nur Bequemlichkeit */ }
}

export function NaehePage() {
    const page = document.createElement('div');
    page.className = 'page page--naehe';

    let position = getCachedPosition();
    const vorher = gemerkt();
    const wahl = {
        // Ohne Standort gibt es keinen Umkreis; dann alle Häuser.
        umkreis: vorher.umkreis === null ? null
            : Number.isFinite(vorher.umkreis) ? naechsteStufe(vorher.umkreis) : 100,
        // Wohin der Schieber zurückkehrt, wenn "Alle Häuser" wieder aus ist.
        letzterUmkreis: Number.isFinite(vorher.umkreis) ? naechsteStufe(vorher.umkreis) : 100,
        tage: ZEITRAEUME.some(z => z.tage === vorher.tage) ? vorher.tage : 30,
        nurWunschliste: !!vorher.nurWunschliste,
        karte: vorher.karte !== false,
        // Ein Haus, auf der Karte angetippt. Nicht gemerkt: beim nächsten
        // Besuch soll wieder alles dastehen.
        haus: null,
    };
    let alleZeigen = false;

    const wunschliste = () => new Set(store.getWishlist()?.items || []);

    page.innerHTML = `
      <div class="page-header">
        <h1 class="page-header__title">${icon('pin')}In der Nähe</h1>
        <p class="page-header__subtitle">Was an den Häusern im Katalog demnächst läuft</p>
      </div>
      <div class="filters naehe-filter">
        <div class="naehe-umkreis">
          <div class="naehe-umkreis__kopf">
            <label for="naeheUmkreis">Umkreis</label>
            <span class="naehe-umkreis__wert" id="naeheUmkreisWert"></span>
          </div>
          <div class="naehe-umkreis__zeile">
            <input type="range" class="naehe-umkreis__schieber" id="naeheUmkreis" min="0" max="${UMKREIS_STUFEN.length - 1}" step="1" />
            <button type="button" class="btn btn--sm btn--outline naehe-umkreis__alle" id="naeheAlle" aria-pressed="false">Alle Häuser</button>
          </div>
        </div>
        <div class="filter-row">
          <select class="select" id="naeheZeitraum" aria-label="Zeitraum">
            ${ZEITRAEUME.map(z => `<option value="${z.tage ?? 'alle'}">${z.text}</option>`).join('')}
          </select>
        </div>
        <label class="naehe-filter__wunsch" id="naeheWunschZeile" hidden>
          <input type="checkbox" id="naeheNurWunschliste" /> Nur Werke von meiner Wunschliste
        </label>
        <p class="naehe-standort" id="naeheStandort"></p>
      </div>
      <details class="naehe-karte" id="naeheKarte"${wahl.karte ? ' open' : ''}>
        <summary class="naehe-karte__schalter">${icon('pin', { className: 'icon--meta' })}Karte</summary>
        <div id="naeheKarteInhalt"></div>
      </details>
      <div id="naeheListe"></div>
    `;

    const umkreisWahl = page.querySelector('#naeheUmkreis');
    const zeitraumWahl = page.querySelector('#naeheZeitraum');
    const wunschWahl = page.querySelector('#naeheNurWunschliste');
    const alleKnopf = page.querySelector('#naeheAlle');
    const umkreisWert = page.querySelector('#naeheUmkreisWert');
    // km: was gerade zu sehen sein soll – während einer Zoom-Geste die
    // Vorschau, sonst die Wahl.
    function umkreisAnzeigen(km = wahl.umkreis) {
        const alle = km === null;
        umkreisWahl.value = String(UMKREIS_STUFEN.indexOf(alle ? wahl.letzterUmkreis : km));
        const text = !position ? 'ohne Standort alle Häuser' : alle ? 'alle Häuser' : `bis ${km} km`;
        umkreisWert.textContent = text;
        umkreisWahl.setAttribute('aria-valuetext', text);
        alleKnopf.setAttribute('aria-pressed', String(alle));
        alleKnopf.classList.toggle('naehe-umkreis__alle--an', alle);
        page.querySelector('.naehe-umkreis').classList.toggle('naehe-umkreis--alle', alle || !position);
    }
    zeitraumWahl.value = wahl.tage === null ? 'alle' : String(wahl.tage);
    wunschWahl.checked = wahl.nurWunschliste;
    // Die Wahl gibt es nur, wenn es eine Wunschliste mit Werken gibt.
    page.querySelector('#naeheWunschZeile').hidden = wunschliste().size === 0;

    function standortZeile() {
        const zeile = page.querySelector('#naeheStandort');
        if (position) {
            zeile.innerHTML = `${icon('pin', { className: 'icon--meta' })}Entfernungen ab deinem Standort.`;
            return;
        }
        zeile.innerHTML = `${icon('pin', { className: 'icon--meta' })}Ohne Standort stehen alle Häuser da.
          <button type="button" class="btn btn--sm btn--outline" id="naeheStandortFragen">Standort verwenden</button>`;
        zeile.querySelector('#naeheStandortFragen').addEventListener('click', async () => {
            // Ausdrücklich gewünscht: auch nach einer früheren Ablehnung
            // fragen, und etwas länger warten – ein Mac ortet über WLAN.
            const knopf = zeile.querySelector('#naeheStandortFragen');
            knopf.disabled = true;
            const neu = await requestPosition({ nachfragen: true, timeout: 15000 });
            knopf.disabled = false;
            if (!neu) {
                showError(standortHinweis());
                return;
            }
            position = neu;
            zeichnen();
        });
    }

    function zeichnen() {
        standortZeile();
        umkreisWahl.disabled = !position;
        alleKnopf.disabled = !position;
        umkreisAnzeigen();
        const heute = heuteIso();
        let abende = abendeInDerNaehe({
            heute,
            bis: wahl.tage === null ? null : tagePlus(heute, wahl.tage - 1),
            position,
            radiusKm: position ? wahl.umkreis : null,
            werke: wahl.nurWunschliste ? wunschliste() : null,
        }).filter(a => operas.some(o => o.id === a.werk));

        // Die Karte zeigt alle Häuser mit Abenden in der Auswahl; ein
        // angetipptes Haus schränkt die Liste darunter ein.
        const jeHaus = new Map();
        abende.forEach(a => jeHaus.set(a.haus.id, (jeHaus.get(a.haus.id) || 0) + 1));
        if (wahl.haus && !jeHaus.has(wahl.haus)) wahl.haus = null;
        karteZeichnen(jeHaus);
        if (wahl.haus) abende = abende.filter(a => a.haus.id === wahl.haus);

        const liste = page.querySelector('#naeheListe');
        if (!abende.length) {
            liste.innerHTML = `
              <div class="empty-state">
                <p>In diesem Umkreis und Zeitraum steht nichts im Spielplan.</p>
                <p class="text-muted">Ein größerer Umkreis oder ein längerer Zeitraum findet mehr.</p>
              </div>`;
            liste.appendChild(spielplanQuelle());
            return;
        }

        const gezeigt = alleZeigen ? abende : abende.slice(0, SICHTBAR);
        const merkliste = wunschliste();
        const tage = new Map();
        for (const a of gezeigt) {
            if (!tage.has(a.datum)) tage.set(a.datum, []);
            tage.get(a.datum).push(a);
        }

        const gewaehlt = wahl.haus && operaHouses.find(h => h.id === wahl.haus);
        liste.innerHTML = `
          ${gewaehlt ? `
            <p class="naehe-hausfilter">Nur ${escapeHTML(gewaehlt.name)}
              <button type="button" class="btn btn--sm btn--outline" id="naeheAlleHaeuser">Alle Häuser</button></p>` : ''}
          <p class="naehe-anzahl">${abende.length} ${abende.length === 1 ? 'Abend' : 'Abende'}</p>
          ${[...tage].map(([datum, zeilen]) => `
            <section class="naehe-tag">
              <h2 class="naehe-tag__datum">${terminMitWochentag(datum, heute)}</h2>
              ${zeilen.map(a => abendZeile(a, merkliste.has(a.werk))).join('')}
            </section>`).join('')}
          ${gezeigt.length < abende.length ? `
            <button type="button" class="btn btn--outline naehe-mehr" id="naeheMehr">
              ${abende.length - gezeigt.length} weitere Abende zeigen
            </button>` : ''}`;
        liste.appendChild(spielplanQuelle());

        liste.querySelector('#naeheMehr')?.addEventListener('click', () => {
            alleZeigen = true;
            zeichnen();
        });
        liste.querySelector('#naeheAlleHaeuser')?.addEventListener('click', () => {
            wahl.haus = null;
            zeichnen();
        });
    }

    function karteZeichnen(jeHaus) {
        const abendeText = n => `${n} ${n === 1 ? 'Abend' : 'Abende'}`;
        page.querySelector('#naeheKarteInhalt').replaceChildren(HouseMap(new Set(jeHaus.keys()), operaHouses, {
            legende: ['mit Abenden', 'ohne'],
            zaehler: n => `${n} ${n === 1 ? 'Haus' : 'Häuser'} mit Abenden`,
            hinweis: n => !n ? 'Im gewählten Zeitraum steht hier nichts.'
                : position && beruehrbar() ? 'Mit zwei Fingern zoomen ändert den Umkreis. Punkt antippen: nur dieses Haus.'
                : 'Punkt antippen: nur dieses Haus',
            punktText: h => `${h.name} – ${h.city}${jeHaus.has(h.id) ? ` · ${abendeText(jeHaus.get(h.id))}` : ''}`,
            position,
            radiusKm: position ? wahl.umkreis : null,
            // Häuser mit mehr Abenden bekommen größere Punkte.
            gewicht: jeHaus,
            beiKlick: (id, mitAbenden) => {
                if (!mitAbenden) return;
                wahl.haus = wahl.haus === id ? null : id;
                alleZeigen = false;
                zeichnen();
                page.querySelector('#naeheListe').scrollIntoView({ behavior: 'smooth', block: 'start' });
            },
        }));
    }

    // Ein Zuhörer für alle Kalenderknöpfe der Liste.
    page.querySelector('#naeheListe').addEventListener('click', (e) => {
        const knopf = e.target.closest('.naehe-abend__kalender');
        if (!knopf) return;
        const { werk: werkId, haus: hausId, datum } = knopf.dataset;
        const abend = abendeInDerNaehe({ heute: datum, bis: datum })
            .find(a => a.werk === werkId && a.haus.id === hausId);
        const werk = operas.find(o => o.id === werkId);
        if (!abend || !werk) return;
        kalenderHerunterladen(
            kalenderEintrag({ werk, haus: abend.haus, datum, zeit: abend.zeit, url: abend.url }),
            kalenderDateiname(werk, abend.haus, datum));
        showToast('Kalendereintrag erstellt');
    });

    // Beim Ziehen gleich neu zeichnen, aber höchstens einmal je Bild.
    let bild = 0;
    umkreisWahl.addEventListener('input', () => {
        wahl.umkreis = wahl.letzterUmkreis = UMKREIS_STUFEN[Number(umkreisWahl.value)];
        alleZeigen = false;
        umkreisAnzeigen();
        cancelAnimationFrame(bild);
        bild = requestAnimationFrame(zeichnen);
    });
    umkreisWahl.addEventListener('change', () => merken(wahl));
    function umkreisSetzen(km) {
        wahl.umkreis = km;
        if (km !== null) wahl.letzterUmkreis = km;
        merken(wahl);
        alleZeigen = false;
        zeichnen();
    }

    alleKnopf.addEventListener('click', () => {
        umkreisSetzen(wahl.umkreis === null ? wahl.letzterUmkreis : null);
    });

    // ── Zoomen auf der Karte ändert den Umkreis ─────────────────────────
    //
    // Mit zwei Fingern auf dem Handy, mit dem Trackpad am Rechner (Chrome
    // meldet das als Mausrad mit Strg, Safari als eigene Geste). Während der
    // Geste wird die Karte nur vergrößert und der Wert oben mitgeführt; neu
    // gezeichnet wird erst am Ende. Ein Neuzeichnen mittendrin nähme den
    // Fingern das Element weg, auf dem sie liegen.
    const karteInhalt = page.querySelector('#naeheKarteInhalt');
    let geste = null;   // { km, vorschau }

    function gesteBeginnen() {
        geste = { km: wahl.umkreis, vorschau: wahl.umkreis };
    }
    function gesteZeigen(faktor) {
        geste.vorschau = umkreisNachZoom(geste.km, faktor);
        const svg = karteInhalt.querySelector('.housemap__svg');
        if (svg) svg.style.transform = `scale(${Math.max(0.3, Math.min(faktor, 4)).toFixed(3)})`;
        umkreisAnzeigen(geste.vorschau);
    }
    function gesteBeenden() {
        const g = geste;
        geste = null;
        if (!g) return;
        if (g.vorschau !== wahl.umkreis) {
            umkreisSetzen(g.vorschau);
        } else {
            const svg = karteInhalt.querySelector('.housemap__svg');
            if (svg) svg.style.transform = '';
            umkreisAnzeigen();
        }
    }

    // Zwei Finger
    const finger = new Map();
    let startAbstand = 0;
    const abstand = () => {
        const [a, b] = [...finger.values()];
        return Math.hypot(a.x - b.x, a.y - b.y);
    };
    karteInhalt.addEventListener('pointerdown', (e) => {
        if (e.pointerType !== 'touch' || !position) return;
        finger.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (finger.size === 2) {
            startAbstand = abstand();
            gesteBeginnen();
        }
    });
    karteInhalt.addEventListener('pointermove', (e) => {
        if (!finger.has(e.pointerId)) return;
        finger.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (!geste || finger.size !== 2 || !startAbstand) return;
        e.preventDefault();
        gesteZeigen(abstand() / startAbstand);
    });
    const fingerWeg = (e) => {
        if (!finger.delete(e.pointerId)) return;
        if (finger.size < 2 && geste) gesteBeenden();
    };
    karteInhalt.addEventListener('pointerup', fingerWeg);
    karteInhalt.addEventListener('pointercancel', fingerWeg);

    // Trackpad (Chrome, Firefox): Mausrad mit Strg. Ende, wenn eine Weile nichts kommt.
    let radFaktor = 1;
    let radUhr = 0;
    karteInhalt.addEventListener('wheel', (e) => {
        if (!e.ctrlKey || !position) return;
        e.preventDefault();
        if (!geste) { gesteBeginnen(); radFaktor = 1; }
        radFaktor *= Math.exp(-e.deltaY * 0.01);
        gesteZeigen(radFaktor);
        clearTimeout(radUhr);
        radUhr = setTimeout(gesteBeenden, 300);
    }, { passive: false });

    // Safari: eigene Gesten-Ereignisse, am Mac vom Trackpad, auf dem iPhone
    // zusätzlich zu den Fingern. Dort nur verhindern, dass die ganze Seite
    // zoomt – die Finger erledigen es schon.
    karteInhalt.addEventListener('gesturestart', (e) => {
        e.preventDefault();
        if (finger.size || !position) return;
        gesteBeginnen();
    });
    karteInhalt.addEventListener('gesturechange', (e) => {
        e.preventDefault();
        if (finger.size || !geste || !e.scale) return;
        gesteZeigen(e.scale);
    });
    karteInhalt.addEventListener('gestureend', (e) => {
        e.preventDefault();
        if (!finger.size) gesteBeenden();
    });
    zeitraumWahl.addEventListener('change', () => {
        wahl.tage = zeitraumWahl.value === 'alle' ? null : Number(zeitraumWahl.value);
        merken(wahl);
        alleZeigen = false;
        zeichnen();
    });
    page.querySelector('#naeheKarte').addEventListener('toggle', (e) => {
        wahl.karte = e.target.open;
        merken(wahl);
    });
    wunschWahl.addEventListener('change', () => {
        wahl.nurWunschliste = wunschWahl.checked;
        merken(wahl);
        alleZeigen = false;
        zeichnen();
    });

    zeichnen();

    // Frischer Standort: fragt nicht, wenn er verweigert wurde. Kaum bewegt:
    // nicht neu zeichnen – sonst wäre ein "weitere zeigen" wieder zu.
    requestPosition().then(neu => {
        if (!neu || !page.isConnected) return;
        const war = position;
        position = neu;
        if (!war || Math.abs(war.lat - neu.lat) + Math.abs(war.lon - neu.lon) > 0.01) zeichnen();
    });

    return page;
}

/** Eine Zeile: Uhrzeit, Werk, Haus, Entfernung, Kalender. */
function abendZeile(a, aufWunschliste) {
    const werk = operas.find(o => o.id === a.werk);
    const zeit = zeitText(a.zeit);
    // Nur https wird ein Link: die Adressen stammen von fremden Seiten.
    const haus = /^https:\/\//i.test(a.url)
        ? `<a class="naehe-abend__haus" href="${escapeHTML(a.url)}" target="_blank" rel="noopener">${escapeHTML(a.haus.name)}</a>`
        : `<span class="naehe-abend__haus">${escapeHTML(a.haus.name)}</span>`;
    return `
      <div class="naehe-abend">
        <span class="naehe-abend__zeit">${zeit ? escapeHTML(zeit.slice(0, 5)) : '–'}</span>
        <div class="naehe-abend__was">
          <a class="naehe-abend__werk" href="#/opera/${escapeHTML(a.werk)}">${aufWunschliste
            ? `<span class="naehe-abend__stern" title="Auf deiner Wunschliste">${icon('star', { filled: true })}</span>` : ''}${escapeHTML(werk.title)}</a>
          <span class="naehe-abend__wo">${haus} · ${escapeHTML(a.haus.city || '')}${a.km !== null ? ` · ${a.km} km` : ''}</span>
        </div>
        <button type="button" class="naehe-abend__kalender" data-werk="${escapeHTML(a.werk)}" data-haus="${escapeHTML(a.haus.id)}" data-datum="${a.datum}"
          title="In den Kalender" aria-label="${escapeHTML(`In den Kalender: ${werk.title}, ${a.haus.name}`)}">${icon('calendar')}</button>
      </div>`;
}
