import { store } from '../store/store.js';
import { ReviewCard } from '../components/ReviewCard.js';

export function VisitDetailPage(visitId) {
    const page = document.createElement('div');
    page.className = 'page page--visit';

    // Wait for store initialization
    setTimeout(() => {
        const visit = store.state.visits.find(v => String(v.id) === String(visitId));
        
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

        page.innerHTML = `
            <div class="page-header">
                <button class="btn-icon" onclick="window.history.back()" style="margin-bottom: 16px; margin-left: -8px;">← Zurück</button>
                <h1 class="page-header__title">Log-Eintrag</h1>
            </div>
            <div id="visitContent"></div>
        `;

        const content = page.querySelector('#visitContent');
        content.appendChild(ReviewCard(visit, { showOpera: true, showHouse: true, compact: false }));
    }, 0);

    return page;
}
