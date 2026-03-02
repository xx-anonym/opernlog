// Ratings Histogram – Letterboxd-style rating distribution bar chart
// Shows how many ratings exist for each star level (½ to 5 in 0.5 steps)

export function RatingsHistogram(ratings, options = {}) {
    const {
        height = 80,
        accentColor = '#c9a84c',
        showAverage = true,
        showCount = true,
    } = options;

    const container = document.createElement('div');
    container.className = 'ratings-histogram';

    if (!ratings || ratings.length === 0) {
        container.innerHTML = '<div class="ratings-histogram__empty">Noch keine Bewertungen</div>';
        return container;
    }

    // Letterboxd always uses half-steps (0.5 to 5.0 = 10 bars)
    const steps = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

    const dist = {};
    steps.forEach(s => dist[s] = 0);

    ratings.forEach(r => {
        // Snap to nearest 0.5 step
        const snapped = Math.round(r * 2) / 2;
        const clamped = Math.max(0.5, Math.min(5, snapped));
        dist[clamped] = (dist[clamped] || 0) + 1;
    });

    const maxCount = Math.max(...Object.values(dist), 1);
    const avg = ratings.reduce((s, r) => s + r, 0) / ratings.length;

    // Header with average
    const header = document.createElement('div');
    header.className = 'ratings-histogram__header';
    header.innerHTML = `
        <span class="ratings-histogram__title">Bewertungen</span>
        ${showAverage ? `
        <span class="ratings-histogram__avg">
            <span class="ratings-histogram__avg-stars">${renderStars(avg)}</span>
            <span class="ratings-histogram__avg-number">${avg.toFixed(1)}</span>
            ${showCount ? `<span class="ratings-histogram__count">(${ratings.length})</span>` : ''}
        </span>
        ` : ''}
    `;
    container.appendChild(header);

    // Bars
    const barsContainer = document.createElement('div');
    barsContainer.className = 'ratings-histogram__bars';
    barsContainer.style.setProperty('--histogram-height', `${height}px`);

    steps.forEach(step => {
        const count = dist[step];
        const pct = (count / maxCount) * 100;

        const barWrapper = document.createElement('div');
        barWrapper.className = 'ratings-histogram__bar-wrapper';
        barWrapper.title = `${step} Sterne: ${count} Bewertung${count !== 1 ? 'en' : ''}`;

        const bar = document.createElement('div');
        bar.className = 'ratings-histogram__bar';
        bar.style.height = `${Math.max(pct, 2)}%`;
        if (count > 0) {
            bar.style.background = `linear-gradient(to top, ${accentColor}, ${lightenColor(accentColor, 20)})`;
            bar.classList.add('ratings-histogram__bar--filled');
        }

        const label = document.createElement('span');
        label.className = 'ratings-histogram__label';
        label.textContent = formatStep(step);

        barWrapper.appendChild(bar);
        barWrapper.appendChild(label);
        barsContainer.appendChild(barWrapper);
    });

    container.appendChild(barsContainer);

    return container;
}

function formatStep(step) {
    if (step === 1) return '★';
    if (step === 2) return '★★';
    if (step === 3) return '★★★';
    if (step === 4) return '★★★★';
    if (step === 5) return '★★★★★';
    return '';
}

function renderStars(rating) {
    const full = Math.floor(rating);
    const half = rating % 1 >= 0.25 && rating % 1 < 0.75 ? 1 : 0;
    const empty = 5 - full - half;
    return '★'.repeat(full) + (half ? '½' : '') + '☆'.repeat(empty);
}

function lightenColor(hex, percent) {
    // Simple hex color lightener
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, (num >> 16) + Math.round(2.55 * percent));
    const g = Math.min(255, ((num >> 8) & 0x00FF) + Math.round(2.55 * percent));
    const b = Math.min(255, (num & 0x0000FF) + Math.round(2.55 * percent));
    return `rgb(${r}, ${g}, ${b})`;
}
