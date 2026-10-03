// Halbe Sterne (src/components/StarRating.js, RatingsHistogram.js): ein
// halber Stern ist ein Umriss mit gefüllter linker Hälfte, kein blasser
// ganzer (Jonas, 3.10.2026). Der Durchschnitt rundet auf halbe Sterne.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderStars } from '../../src/components/RatingsHistogram.js';

const arten = html => [...html.matchAll(/class="star star--(full|half|empty)"/g)].map(m => m[1]);

test('Durchschnitt auf halbe Sterne gerundet', () => {
    assert.deepEqual(arten(renderStars(3.8)), ['full', 'full', 'full', 'full', 'empty']);
    assert.deepEqual(arten(renderStars(3.6)), ['full', 'full', 'full', 'half', 'empty']);
    assert.deepEqual(arten(renderStars(3.2)), ['full', 'full', 'full', 'empty', 'empty']);
    assert.deepEqual(arten(renderStars(5)), ['full', 'full', 'full', 'full', 'full']);
    assert.deepEqual(arten(renderStars(-1)), ['empty', 'empty', 'empty', 'empty', 'empty']);
});

test('ein halber Stern ist ein Umriss mit gefüllter Hälfte, kein "½"', () => {
    const html = renderStars(2.5);
    assert.ok(!html.includes('½'));
    assert.match(html, /star--half"><span class="star__leer">☆<\/span><span class="star__halb" aria-hidden="true">★<\/span>/);
});
