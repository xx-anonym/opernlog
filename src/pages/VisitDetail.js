import { store } from '../store/store.js';
import { ReviewCard } from '../components/ReviewCard.js';
import { andenkenBereich } from '../components/Andenken.js';
import { operas } from '../data/operas.js';
import { zurueckLink } from '../components/ZurueckLink.js';
import { operaHouses } from '../data/operaHouses.js';
import { icon } from '../components/Icon.js';
import { showToast, showError } from '../components/Toast.js';
import { zeichneAbendbild } from '../components/Teilbild.js';
import { alsPng, teilenMitBild, teilenLink } from '../teilen.js';
import { abendbildDaten, abendText, abendDateiname, abendDirektlink } from '../abendTeilen.js';

export function VisitDetailPage(visitId) {
    const page = document.createElement('div');
    page.className = 'page page--visit';

    // Wait for store initialization
    setTimeout(async () => {
        const visit = await store.getVisit(visitId);
        
        if (!visit) {
            page.innerHTML = `
                <div class="empty-state">
                    <h3>Besuch nicht gefunden</h3>
                    <p>Dieser Log-Eintrag existiert nicht oder wurde gelöscht.</p>
                    <a href="#/" class="btn btn--primary">Zurück zum Feed</a>
                </div>
            `;
            return;
        }

        const operaId = visit.operaId || visit.opera_id;
        const opera = operas.find(o => o.id === operaId);

        page.innerHTML = `
            ${opera && opera.image ? `<div class="visit-detail__bg" style="background-image: url('${opera.image}')"></div>` : ''}
            ${zurueckLink('#/')}
            <div id="visitContent"></div>
        `;

        const content = page.querySelector('#visitContent');
        const karte = ReviewCard(visit, { showOpera: true, showHouse: true, standalone: true });
        content.appendChild(karte);
        // Die Fotos gehören zum Abend selbst: in die Karte, vor Gefällt-mir
        // und Kommentare – nicht als Anhang unter alles andere.
        karte.insertBefore(andenkenBereich(visit), karte.querySelector('.review-card__actions'));
        teilenKnopf(karte, visit, opera);
        
        // Fix scroll position (prevent auto scroll down from previous page or DOM change)
        setTimeout(() => window.scrollTo(0, 0), 10);
    }, 0);

    return page;
}

/**
 * Teilen am eigenen Abend (seit 18.11.2026), zweimal: "Bild" – im Stil des
 * Theaterzettels, mit Text und Link – und "Link" allein, der direkt auf den
 * Abend führt und in Messengern eine Vorschau zeigt (src/abendTeilen.js,
 * api/abend.mjs). "Link" gibt es nur für Abende in der Datenbank. Nur am eigenen –
 * fremde Reviews weiterzugeben, ist nicht unsere Entscheidung. Ein Abend, der
 * noch auf den Abgleich wartet, hat keine Knopfzeile und damit auch keinen
 * Knopf.
 */
function teilenKnopf(karte, visit, opera) {
    const zeile = karte.querySelector('.review-card__actions');
    const ich = store.getCurrentUser();
    if (!zeile || !ich || (visit.userId !== ich.id && visit.userId !== 'user-me')) return;

    const house = operaHouses.find(h => h.id === (visit.houseId || visit.house_id));
    const knopf = document.createElement('button');
    knopf.type = 'button';
    knopf.className = 'btn-icon abend-teilen';
    knopf.innerHTML = `${icon('share')}<span>Bild</span>`;
    zeile.appendChild(knopf);

    const direkt = abendDirektlink(visit);
    if (direkt) {
        const link = document.createElement('button');
        link.type = 'button';
        link.className = 'btn-icon abend-link';
        link.innerHTML = `${icon('link')}<span>Link</span>`;
        zeile.appendChild(link);
        link.addEventListener('click', async (e) => {
            e.stopPropagation();
            link.disabled = true;
            try {
                const ergebnis = await teilenLink({ titel: opera?.title || 'Mein Abend in der Oper', url: direkt, protokoll: 'Abend teilen' });
                if (ergebnis === 'kopiert') showToast('Link kopiert');
                else if (ergebnis === 'fehlgeschlagen') showError('Teilen hat nicht geklappt.');
            } finally {
                link.disabled = false;
            }
        });
    }

    // Das Bild entsteht schon jetzt, nicht erst beim Klick: Safari verlangt,
    // dass navigator.share() noch innerhalb der Nutzergeste aufgerufen wird
    // (wie im Saisonrückblick).
    const bild = zeichneAbendbild(abendbildDaten(visit, opera, house))
        .then(leinwand => alsPng(leinwand, abendDateiname(visit, opera)));
    bild.catch(e => console.warn('[Abend teilen] Bild vorbereiten', e));

    knopf.addEventListener('click', async (e) => {
        e.stopPropagation();
        knopf.disabled = true;
        try {
            const datei = await bild.catch(() => null);
            const ergebnis = await teilenMitBild({
                datei,
                titel: opera?.title || 'Mein Abend in der Oper',
                text: abendText(visit, opera, house),
                protokoll: 'Abend teilen',
            });
            if (ergebnis === 'kopiert') showToast('Text und Link kopiert');
            else if (ergebnis === 'fehlgeschlagen') showError('Teilen hat nicht geklappt.');
        } finally {
            knopf.disabled = false;
        }
    });
}
