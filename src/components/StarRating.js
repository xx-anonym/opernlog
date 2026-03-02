// Star Rating Component
export function StarRating(rating, interactive = false, onChange = null, size = 'md') {
    const container = document.createElement('div');
    container.className = `star-rating star-rating--${size}`;

    const maxStars = 5;
    let currentRating = rating || 0;

    function render() {
        container.innerHTML = '';
        for (let i = 1; i <= maxStars; i++) {
            const star = document.createElement('span');
            star.className = 'star';

            if (currentRating >= i) {
                star.innerHTML = '★';
                star.classList.add('star--full');
            } else if (currentRating >= i - 0.5) {
                star.innerHTML = '★';
                star.classList.add('star--half');
            } else {
                star.innerHTML = '☆';
                star.classList.add('star--empty');
            }

            if (interactive) {
                star.style.cursor = 'pointer';
                star.addEventListener('click', (e) => {
                    const rect = star.getBoundingClientRect();
                    const isLeftHalf = (e.clientX - rect.left) < rect.width / 2;
                    currentRating = isLeftHalf ? i - 0.5 : i;
                    if (onChange) onChange(currentRating);
                    render();
                });
                star.addEventListener('mouseenter', (e) => {
                    star.style.transform = 'scale(1.2)';
                    // Show preview of what clicking left/right half would give
                    const rect = star.getBoundingClientRect();
                    const isLeftHalf = (e.clientX - rect.left) < rect.width / 2;
                    const previewRating = isLeftHalf ? i - 0.5 : i;
                    if (label) label.textContent = previewRating.toFixed(1);
                });
                star.addEventListener('mousemove', (e) => {
                    const rect = star.getBoundingClientRect();
                    const isLeftHalf = (e.clientX - rect.left) < rect.width / 2;
                    const previewRating = isLeftHalf ? i - 0.5 : i;
                    if (label) label.textContent = previewRating.toFixed(1);
                });
                star.addEventListener('mouseleave', () => {
                    star.style.transform = 'scale(1)';
                    if (label) label.textContent = currentRating > 0 ? currentRating.toFixed(1) : '';
                });
            }

            container.appendChild(star);
        }

        // Show rating number for both interactive and read-only
        const label = document.createElement('span');
        label.className = 'star-rating__number';
        if (interactive) {
            label.textContent = currentRating > 0 ? currentRating.toFixed(1) : '';
            label.style.minWidth = '2.5em';
        } else if (rating !== null && rating !== undefined) {
            label.textContent = typeof rating === 'number' ? rating.toFixed(1) : '';
        }
        container.appendChild(label);

        // Hint text for interactive mode
        if (interactive) {
            let hint = container.querySelector('.star-rating__hint');
            if (!hint) {
                hint = document.createElement('span');
                hint.className = 'star-rating__hint';
                container.appendChild(hint);
            }
            if (currentRating > 0) {
                hint.textContent = ratingText(currentRating);
            } else {
                hint.textContent = 'Linke Hälfte = halber Stern';
            }
        }
    }

    // Need label reference for hover events — render creates it
    let label = null;
    render();
    label = container.querySelector('.star-rating__number');

    container.getValue = () => currentRating;
    return container;
}

// Text rating
export function ratingText(rating) {
    if (rating >= 4.5) return 'Meisterwerk';
    if (rating >= 4) return 'Herausragend';
    if (rating >= 3.5) return 'Sehr gut';
    if (rating >= 3) return 'Gut';
    if (rating >= 2.5) return 'Ordentlich';
    if (rating >= 2) return 'Mäßig';
    if (rating >= 1.5) return 'Unterdurchschnittlich';
    if (rating >= 1) return 'Schwach';
    if (rating >= 0.5) return 'Sehr schwach';
    return 'Nicht bewertet';
}
