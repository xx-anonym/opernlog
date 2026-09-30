// Probe für tests/checks/githubAnmerkungen.test.js: ein Test, der gelingt,
// und einer, der absichtlich scheitert. Kein .test.js, damit keine der
// üblichen Testrunden ihn mitnimmt.

import { test } from 'node:test';
import assert from 'node:assert/strict';

test('gelingt', () => {
    assert.equal(1, 1);
});

test('scheitert: mit Komma, Doppelpunkt und 100 %', () => {
    assert.equal('erste Zeile\nzweite Zeile', 'etwas anderes');
});
