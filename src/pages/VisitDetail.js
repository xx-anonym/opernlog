import { store } from '../store/store.js';
import { ReviewCard } from '../components/ReviewCard.js';
import { andenkenBereich } from '../components/Andenken.js';
import { operas } from '../data/operas.js';

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
            <div class="page-header" style="border-bottom: none; padding-bottom: 0;">
                <button class="btn-icon" onclick="window.history.back()" style="margin-bottom: 8px; margin-left: -8px;">← Zurück</button>
            </div>
            <div id="visitContent"></div>
        `;

        const content = page.querySelector('#visitContent');
        const karte = ReviewCard(visit, { showOpera: true, showHouse: true, standalone: true });
        content.appendChild(karte);
        // Die Fotos gehören zum Abend selbst: in die Karte, vor Gefällt-mir
        // und Kommentare – nicht als Anhang unter alles andere.
        karte.insertBefore(andenkenBereich(visit), karte.querySelector('.review-card__actions'));
        
        // Fix scroll position (prevent auto scroll down from previous page or DOM change)
        setTimeout(() => window.scrollTo(0, 0), 10);
    }, 0);

    return page;
}
