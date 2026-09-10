// Das Formular, mit dem der Admin ein Werk oder ein Haus vollständig selbst
// in den Katalog schreibt – mit allen Feldern, die auch die 121 Werke und 92
// Häuser aus dem Repo führen.
//
// Wer kein Admin ist, sieht es nie: die Seiten fragen vorher istAdmin(). Das
// ist aber nur Höflichkeit. Verbindlich ist die Regel in der Datenbank, die
// jedes INSERT ablehnt, das nicht aus einem Konto in der Tabelle admins kommt.
// Ein aufgebohrtes Formular käme also keinen Schritt weiter.
//
// Geprüft wird gegen dieselben Regeln, die tests/checks/katalog.test.js an den
// Katalog im Repo anlegt – siehe src/data/katalogRegeln.js. Der Admin sieht
// den Mangel vor dem Speichern; was trotzdem durchrutscht, findet der
// tägliche Prüflauf über die Datenbank.

import { operas } from '../data/operas.js';
import { operaHouses } from '../data/operaHouses.js';
import { composers } from '../data/composers.js';
import { uebernehmen } from '../data/katalogZusatz.js';
import { pruefeWerk, pruefeHaus, pruefeKomponist, idVorschlag, thumbAdresse, BILD_BREITE } from '../data/katalogRegeln.js';
import { addKatalogWerk, addKatalogHaus, addKatalogKomponist } from '../store/supabase.js';
import { escapeHTML } from '../utils.js';

/** Die Länderauswahl beim Haus: was im Katalog schon vorkommt. */
const LAENDER_AUSWAHL = () => [...new Set(operaHouses.map(h => h.state))].sort((a, b) => a.localeCompare(b, 'de'));

const feld = ({ id, label, typ = 'text', hinweis = '', wert = '', schritt = '' }) => `
    <div class="form-group">
        <label class="form-label" for="${id}">${escapeHTML(label)}</label>
        <input class="input" type="${typ}" id="${id}" value="${escapeHTML(String(wert))}"
               ${schritt ? `step="${schritt}"` : ''} />
        ${hinweis ? `<p class="form-hint">${hinweis}</p>` : ''}
    </div>`;

const textfeld = ({ id, label, hinweis = '' }) => `
    <div class="form-group">
        <label class="form-label" for="${id}">${escapeHTML(label)}</label>
        <textarea class="input" id="${id}" rows="3"></textarea>
        ${hinweis ? `<p class="form-hint">${hinweis}</p>` : ''}
    </div>`;

const auswahl = ({ id, label, optionen, hinweis = '' }) => `
    <div class="form-group">
        <label class="form-label" for="${id}">${escapeHTML(label)}</label>
        <select class="input" id="${id}">${optionen}</select>
        ${hinweis ? `<p class="form-hint">${hinweis}</p>` : ''}
    </div>`;

// Der Hinweis steht an jedem Bildfeld: es ist die Regel, an der beim Anlegen
// am ehesten etwas schiefgeht, und die Begründung ist nicht offensichtlich.
const BILD_HINWEIS = 'Adresse von upload.wikimedia.org einfügen, gern die des Originals – '
    + `sie wird beim Verlassen des Feldes auf die ${BILD_BREITE}px-Fassung umgerechnet. `
    + 'Größere Fassungen blähen die Liste auf, fremde Hosts fehlen offline.';

/** Die Felder eines Werks. */
function werkFelder() {
    const bekannte = [...composers].sort((a, b) => a.name.localeCompare(b.name, 'de'));
    return `
        ${feld({ id: 'kfTitle', label: 'Titel' })}
        ${auswahl({
            id: 'kfComposer',
            label: 'Komponist',
            optionen: '<option value="">– bitte wählen –</option>'
                + bekannte.map(c => `<option value="${escapeHTML(c.name)}">${escapeHTML(c.name)}</option>`).join('')
                + '<option value="__neu">… steht noch nicht im Katalog</option>',
            hinweis: 'Über diesen Namen findet die Werkseite das Komponistenprofil. '
                + 'Er muss zeichengleich sein, deshalb die Auswahl statt eines Textfelds.',
        })}
        <div id="kfKomponistNeu" hidden>
            <div class="form-hint" style="margin-bottom:.75rem">
                Neuer Komponist – daraus entsteht zugleich seine Profilseite.
            </div>
            ${feld({ id: 'kfKompName', label: 'Name' })}
            ${feld({ id: 'kfKompKurz', label: 'Kurzfassung', hinweis: 'Eine Zeile, z.&nbsp;B. „italienischer Opernkomponist (1801–1835)“.' })}
            ${textfeld({ id: 'kfKompBio', label: 'Biografie', hinweis: 'Muss auf einem Satzzeichen enden – der Text wird bei 320 Zeichen geschnitten.' })}
            ${feld({ id: 'kfKompWikipedia', label: 'Wikipedia-Artikel', hinweis: 'Pflicht: die Biografie stammt von dort und steht unter CC BY-SA.' })}
            ${feld({ id: 'kfKompBild', label: 'Porträt (optional)', hinweis: BILD_HINWEIS })}
            ${feld({ id: 'kfKompLizenz', label: 'Lizenz des Porträts', hinweis: 'z.&nbsp;B. „Public domain“ oder „CC BY-SA 4.0“.' })}
            ${feld({ id: 'kfKompUrheber', label: 'Urheber des Porträts', hinweis: 'Nur bei CC-BY-Lizenzen Pflicht.' })}
            ${feld({ id: 'kfKompId', label: 'Id des Komponisten' })}
        </div>
        ${feld({ id: 'kfYear', label: 'Entstehungsjahr', typ: 'number' })}
        ${feld({ id: 'kfLanguage', label: 'Sprache' })}
        ${feld({ id: 'kfActs', label: 'Akte', typ: 'number' })}
        ${feld({ id: 'kfGenre', label: 'Gattung', hinweis: 'z.&nbsp;B. „Singspiel“, „Opera buffa“, „Musikdrama“.' })}
        ${feld({ id: 'kfLibrettist', label: 'Librettist' })}
        ${textfeld({ id: 'kfDescription', label: 'Beschreibung' })}
        ${feld({ id: 'kfImage', label: 'Bild', hinweis: BILD_HINWEIS })}
        ${feld({ id: 'kfId', label: 'Id', hinweis: 'Steht in der Adresse der Werkseite. Wird aus dem Titel vorgeschlagen.' })}`;
}

/** Die Felder eines Hauses. */
function hausFelder() {
    return `
        ${feld({ id: 'kfName', label: 'Name' })}
        ${feld({ id: 'kfCity', label: 'Stadt' })}
        ${auswahl({
            id: 'kfState',
            label: 'Bundesland oder Land',
            optionen: LAENDER_AUSWAHL().map(s => `<option value="${escapeHTML(s)}">${escapeHTML(s)}</option>`).join(''),
        })}
        ${feld({ id: 'kfLat', label: 'Breite', typ: 'number', schritt: 'any', hinweis: 'Dezimalgrad, z.&nbsp;B. 48.1397. Wird gegen die Umrisse des gewählten Landes geprüft.' })}
        ${feld({ id: 'kfLon', label: 'Länge', typ: 'number', schritt: 'any', hinweis: 'Dezimalgrad, z.&nbsp;B. 11.5794.' })}
        ${feld({ id: 'kfCapacity', label: 'Plätze', typ: 'number' })}
        ${feld({ id: 'kfFounded', label: 'Gegründet', typ: 'number' })}
        ${textfeld({ id: 'kfDescription', label: 'Beschreibung' })}
        ${feld({ id: 'kfColor', label: 'Farbe', typ: 'color', wert: '#1a3a5c', hinweis: 'Rückfallebene, wenn das Bild fehlt oder offline nicht da ist.' })}
        ${feld({ id: 'kfImageUrl', label: 'Bild', hinweis: BILD_HINWEIS })}
        ${feld({ id: 'kfId', label: 'Id', hinweis: 'Steht in der Adresse der Hausseite. Wird aus dem Namen vorgeschlagen.' })}`;
}

/**
 * Baut das Modal.
 *
 * @param art      'werk' oder 'haus'
 * @param fertig   wird nach erfolgreichem Anlegen gerufen, damit die Seite neu zeichnet
 * @param dienste  nur für Tests: die drei Speicherfunktionen austauschbar
 */
export function katalogModal(art, fertig, dienste = {}) {
    const speichereWerk = dienste.addKatalogWerk ?? addKatalogWerk;
    const speichereHaus = dienste.addKatalogHaus ?? addKatalogHaus;
    const speichereKomponist = dienste.addKatalogKomponist ?? addKatalogKomponist;

    const werk = art === 'werk';
    const modal = document.createElement('div');
    modal.className = 'modal modal--active';
    modal.innerHTML = `
        <div class="modal__overlay"></div>
        <div class="modal__content" style="max-height:85vh;overflow-y:auto">
            <h2 class="modal__title">${werk ? 'Werk' : 'Haus'} zum Katalog hinzufügen</h2>
            <p class="form-hint" style="margin-bottom:1.25rem">
                Der Eintrag steht sofort für alle im Katalog.
            </p>
            <form id="kfForm" novalidate>
                ${werk ? werkFelder() : hausFelder()}
                <div id="kfMaengel" class="auth-error" style="display:none"></div>
                <div class="modal__actions" style="margin-top:1.5rem">
                    <button type="button" class="btn btn--secondary close-modal">Abbrechen</button>
                    <button type="submit" class="btn btn--primary" id="kfSenden">Hinzufügen</button>
                </div>
            </form>
        </div>`;

    const q = (wahl) => modal.querySelector(wahl);
    const wert = (id) => q('#' + id)?.value.trim() ?? '';

    // ── Id-Vorschlag, solange niemand von Hand eingegriffen hat ───────────
    const quelle = werk ? '#kfTitle' : '#kfName';
    let idVonHand = false;
    q('#kfId').addEventListener('input', () => { idVonHand = true; });
    q(quelle).addEventListener('input', () => {
        if (!idVonHand) q('#kfId').value = idVorschlag(q(quelle).value);
    });

    // ── Komponist: bekannter oder neuer ───────────────────────────────────
    if (werk) {
        const auswahlfeld = q('#kfComposer');
        const block = q('#kfKomponistNeu');
        let kompIdVonHand = false;
        q('#kfKompId').addEventListener('input', () => { kompIdVonHand = true; });
        q('#kfKompName').addEventListener('input', () => {
            if (!kompIdVonHand) q('#kfKompId').value = idVorschlag(q('#kfKompName').value);
        });
        auswahlfeld.addEventListener('change', () => {
            block.hidden = auswahlfeld.value !== '__neu';
        });
    }

    // Die Adresse eines Vorschaubilds steht auf Commons nirgends: sie wird aus
    // der des Originals abgeleitet. Wer das nicht weiß, sucht vergeblich und
    // fügt am Ende die Originaladresse ein – die dann als Mangel zurückkommt,
    // ohne zu sagen, wie man es besser macht. Also rechnet das Formular selbst
    // um, sobald das Feld verlassen wird.
    for (const id of ['kfImage', 'kfImageUrl', 'kfKompBild']) {
        const eingabe = q('#' + id);
        if (!eingabe) continue;
        eingabe.addEventListener('change', () => {
            const umgerechnet = thumbAdresse(eingabe.value);
            if (umgerechnet === eingabe.value.trim()) return;
            eingabe.value = umgerechnet;
            const hinweis = eingabe.parentElement.querySelector('.form-hint');
            if (hinweis) {
                hinweis.textContent = `Auf die ${BILD_BREITE}px-Fassung umgerechnet.`;
                hinweis.style.color = 'var(--accent)';
            }
        });
    }

    function zeigeMaengel(maengel) {
        const kasten = q('#kfMaengel');
        if (!maengel.length) { kasten.style.display = 'none'; return; }
        kasten.innerHTML = maengel.map(m => `<div>• ${escapeHTML(m)}</div>`).join('');
        kasten.style.display = 'block';
        kasten.scrollIntoView({ block: 'nearest' });
    }

    /** Was in den Feldern steht, als Katalogeintrag. */
    function ausFormular() {
        if (!werk) {
            return {
                id: wert('kfId'), name: wert('kfName'), city: wert('kfCity'),
                state: wert('kfState'), lat: wert('kfLat'), lon: wert('kfLon'),
                capacity: wert('kfCapacity'), founded: wert('kfFounded'),
                description: wert('kfDescription'), color: wert('kfColor'),
                imageUrl: wert('kfImageUrl'),
            };
        }
        const auswahlWert = q('#kfComposer').value;
        const neuerKomponist = auswahlWert === '__neu' ? {
            id: wert('kfKompId'), name: wert('kfKompName'), kurz: wert('kfKompKurz'),
            bio: wert('kfKompBio'), wikipedia: wert('kfKompWikipedia'),
            bild: wert('kfKompBild'), bildLizenz: wert('kfKompLizenz'),
            bildUrheber: wert('kfKompUrheber'),
        } : null;

        return {
            werk: {
                id: wert('kfId'), title: wert('kfTitle'),
                composer: neuerKomponist ? neuerKomponist.name : auswahlWert,
                yearComposed: wert('kfYear'), language: wert('kfLanguage'),
                acts: wert('kfActs'), genre: wert('kfGenre'),
                librettist: wert('kfLibrettist'), description: wert('kfDescription'),
                image: wert('kfImage'),
            },
            neuerKomponist,
        };
    }

    q('#kfForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const knopf = q('#kfSenden');
        zeigeMaengel([]);

        const eingabe = ausFormular();
        let maengel;
        let neuerKomponist = null;

        if (werk) {
            neuerKomponist = eingabe.neuerKomponist;
            // Der neue Komponist wird für die Werkprüfung schon mitgezählt –
            // sonst meldete sie "kein Komponistenprofil" für jemanden, den man
            // gerade im selben Formular anlegt.
            const bekannt = neuerKomponist ? [...composers, neuerKomponist] : composers;
            maengel = [
                ...(neuerKomponist ? pruefeKomponist(neuerKomponist, { komponisten: composers }) : []),
                ...pruefeWerk(eingabe.werk, { werke: operas, komponisten: bekannt }),
            ];
        } else {
            maengel = pruefeHaus(eingabe, { haeuser: operaHouses });
        }

        if (maengel.length) { zeigeMaengel(maengel); return; }

        knopf.disabled = true;
        knopf.textContent = 'Wird gespeichert…';
        try {
            if (werk) {
                // Erst der Komponist: ohne ihn zeigt die Werkseite einen Namen
                // ohne Profil. Schlägt er fehl, ist noch kein Werk angelegt.
                if (neuerKomponist) {
                    await speichereKomponist(neuerKomponist);
                    uebernehmen({ komponisten: [neuerKomponist] });
                }
                await speichereWerk(eingabe.werk);
                uebernehmen({ werke: [eingabe.werk] });
            } else {
                await speichereHaus(eingabe);
                uebernehmen({ haeuser: [eingabe] });
            }
            modal.remove();
            fertig?.();
        } catch (err) {
            zeigeMaengel([`Speichern fehlgeschlagen: ${err.message}`]);
            knopf.disabled = false;
            knopf.textContent = 'Hinzufügen';
        }
    });

    modal.querySelectorAll('.close-modal').forEach(b => b.addEventListener('click', () => modal.remove()));
    q('.modal__overlay').addEventListener('click', () => modal.remove());

    return modal;
}
