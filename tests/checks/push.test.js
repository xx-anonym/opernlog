// Push: was an zwei Orten stehen muss, bleibt gleich.
//
// Die Liste der erlaubten Push-Dienste steht in der Edge Function und in der
// Datenbank. Wird sie nur an einer Stelle erweitert – etwa um einen neuen
// Dienst von Samsung –, nimmt die Datenbank das Abo an und die Funktion
// verwirft es beim ersten Versand, oder umgekehrt. Beides still.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { PUSH_DIENSTE } from '../../supabase/functions/push-senden/webpush.js';

const lies = (pfad) => fs.readFileSync(new URL(`../../${pfad}`, import.meta.url), 'utf8');
const SQL = lies('supabase/migrations/push_migration.sql');

test('Datenbank und Edge Function erlauben dieselben Push-Dienste', () => {
    const m = SQL.match(/p_endpoint !~ '([^']+)'/);
    assert.ok(m, 'keine Prüfung der Push-Adresse in push_abo_speichern');
    // In JavaScript steht der Schrägstrich maskiert, in SQL nicht.
    assert.equal(m[1], PUSH_DIENSTE.source.replace(/\\\//g, '/'));
});

test('die Datenbank ruft die Edge Function dieses Projekts', () => {
    const config = lies('src/config.js');
    const projekt = config.match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];
    assert.match(SQL, new RegExp(`https://${projekt}\\.supabase\\.co/functions/v1/push-senden`));
    assert.ok(fs.existsSync(new URL('../../supabase/functions/push-senden/index.ts', import.meta.url)));
});

test('für jeden Anlass gibt es einen Auslöser', () => {
    for (const [tabelle, funktion] of [['friend_requests', 'push_bei_anfrage'], ['likes', 'push_bei_like'], ['comments', 'push_bei_kommentar']]) {
        assert.match(SQL, new RegExp(`CREATE TRIGGER ${funktion} AFTER INSERT ON public\\.${tabelle}`), tabelle);
    }
    assert.match(SQL, /accept_invite[\s\S]*push_senden\(ARRAY\[v_inviter_id\]/, 'angenommene Einladung');
    // 31. Juli, 8 Uhr UTC = 10 Uhr deutscher Sommerzeit.
    assert.match(SQL, /cron\.schedule\('push-saisonrueckblick', '0 8 31 7 \*'/);
});

test('niemand außer der Datenbank kann push_senden aufrufen', () => {
    assert.match(SQL, /REVOKE ALL ON FUNCTION public\.push_senden\([^)]*\) FROM PUBLIC, anon, authenticated;/);
    assert.match(SQL, /REVOKE ALL ON FUNCTION public\.push_intern\(\) FROM PUBLIC, anon, authenticated;/);
});
