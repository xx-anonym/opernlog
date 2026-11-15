// Der Lauftag in src/data/spielplanLauf.js muss zum cron des Workflows
// passen – sonst nennt das Formular des Admins ein falsches Datum.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { LAUF_TAG } from '../../src/data/spielplanLauf.js';

test('LAUF_TAG ist der Monatstag im cron von spielplan-monatlich.yml', () => {
    const yml = fs.readFileSync(new URL('../../.github/workflows/spielplan-monatlich.yml', import.meta.url), 'utf8');
    const cron = yml.match(/cron:\s*'([^']+)'/)?.[1];
    assert.ok(cron, 'kein cron gefunden');
    const [, , tag, monat] = cron.split(/\s+/);
    assert.equal(monat, '*', `der Lauf ist nicht monatlich: ${cron}`);
    assert.equal(Number(tag), LAUF_TAG, `cron ${cron}`);
});
