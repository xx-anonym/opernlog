// Die Prüfungen der Datenbank für Besuche und die der App müssen dieselben
// sein.
//
// Die Datenbank lehnt Werk- und Hauskennungen ab, die nicht aussehen wie eine
// Katalogkennung. Welche das sind, legt ID_MUSTER in katalogRegeln.js fest.
// Wird das Muster dort gelockert – etwa für Großbuchstaben –, könnte der Admin
// ein Werk anlegen, das niemand loggen kann: die Datenbank wiese jeden Besuch
// ab. Deshalb hier der Abgleich.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { ID_MUSTER } from '../../src/data/katalogRegeln.js';

const SQL = fs.readFileSync(new URL('../../supabase/migrations/visits_pruefungen_migration.sql', import.meta.url), 'utf8');

test('Werk und Haus werden gegen ID_MUSTER geprüft', () => {
    for (const spalte of ['opera_id', 'house_id']) {
        const m = SQL.match(new RegExp(`CHECK \\(${spalte} ~ '([^']+)'\\)`));
        assert.ok(m, `keine Prüfung für ${spalte}`);
        assert.equal(m[1], ID_MUSTER.source, `${spalte}: Datenbank und katalogRegeln.js weichen ab`);
    }
});

test('die Note ist auf 0,5 bis 5 in halben Schritten begrenzt', () => {
    assert.match(SQL, /CHECK \(rating >= 0\.5 AND rating <= 5 AND rating \* 2 = trunc\(rating \* 2\)\)/);
});
