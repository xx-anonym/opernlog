// Mail bei Freundschaftsanfragen: was an mehreren Orten stehen muss, bleibt
// zusammen.
//
// Datenbank (supabase/migrations/mail_anfrage_migration.sql), Edge Function
// (supabase/functions/mail-senden/) und die Vorlage aus
// tests/werkzeug/mailvorlagen.mjs. Läuft einer davon auseinander, kommt
// einfach keine Mail – kein Fehler in der App, niemand merkt es.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { FUNKTIONS_MAILS, mailHtml, vorlageModul } from '../werkzeug/mailvorlagen.mjs';
import { VORLAGEN } from '../../supabase/functions/mail-senden/vorlage.js';

const lies = (pfad) => fs.readFileSync(new URL(`../../${pfad}`, import.meta.url), 'utf8');
const SQL = lies('supabase/migrations/mail_anfrage_migration.sql')
    .split('\n').map(z => z.replace(/--.*$/, '')).join('\n');
const FUNKTION = lies('supabase/functions/mail-senden/index.ts');

test('die Vorlage in der Funktion ist die, die das Werkzeug erzeugt', () => {
    assert.equal(lies('supabase/functions/mail-senden/vorlage.js'), vorlageModul(),
        'weicht ab – node tests/werkzeug/mailvorlagen.mjs laufen lassen');
    assert.deepEqual(Object.keys(VORLAGEN), FUNKTIONS_MAILS.map(m => m.name));
});

test('die Anfrage-Mail: Name überall eingesetzt, Knopf in die App, keine Supabase-Variablen', () => {
    const v = VORLAGEN.anfrage;
    for (const teil of ['betreff', 'text', 'html']) assert.ok(v[teil].includes('%%NAME%%'), teil);
    assert.match(v.html, /<a class="knopf" href="https:\/\/opernlog\.vercel\.app\/#\/"/);
    assert.ok(!v.html.includes('{{'), 'Go-Template-Klammern – die füllt hier niemand');
    // Wo man sie abschaltet, steht in jeder Mail.
    assert.match(v.html, /Profil bearbeiten → E-Mails/);
    assert.match(v.text, /Profil bearbeiten → E-Mails/);
});

test('die Anfrage-Mail hat denselben Auftritt und dieselben Regeln wie die übrigen', () => {
    const html = mailHtml(FUNKTIONS_MAILS[0]);
    assert.match(html, /@media \(prefers-reduced-motion: no-preference\)/);
    assert.match(html, /\.knopftabelle \{ animation: auftreten [^}]*backwards/);
    const ohneKeyframes = html.replace(/@keyframes\s+\w+\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, '')
        .replace(/<div style="display:none;[^"]*"/, '');
    assert.ok(!/opacity\s*:\s*0(?![.\d])/.test(ohneKeyframes));
});

test('die Datenbank ruft die Edge Function dieses Projekts', () => {
    const projekt = lies('src/config.js').match(/https:\/\/([a-z0-9]+)\.supabase\.co/)[1];
    assert.match(SQL, new RegExp(`https://${projekt}\\.supabase\\.co/functions/v1/mail-senden`));
    assert.ok(fs.existsSync(new URL('../../supabase/functions/mail-senden/index.ts', import.meta.url)));
});

test('der Auslöser: nur neue offene Anfragen, nicht wenn abgeschaltet, höchstens eine in sieben Tagen', () => {
    assert.match(SQL, /CREATE TRIGGER mail_bei_anfrage AFTER INSERT ON public\.friend_requests/);
    const ausloeser = SQL.match(/FUNCTION public\.mail_bei_anfrage\(\)[\s\S]*?\$\$;/)[0];
    assert.match(ausloeser, /NEW\.status <> 'pending'/);
    assert.match(ausloeser, /mail_einstellungen WHERE user_id = NEW\.receiver_id\), true\)/);
    assert.match(ausloeser, /push_einmal\('mail-anfrage', [^)]*interval '7 days'\)/);
    // Eine Anfrage darf nie an der Mail scheitern.
    assert.match(ausloeser, /EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING/);
});

test('Adresse und Name gibt es nur für die Funktion, und nur bei offener Anfrage', () => {
    assert.match(SQL, /REVOKE ALL ON FUNCTION public\.mail_anfrage_daten\(UUID, UUID\) FROM PUBLIC, anon, authenticated;/);
    assert.match(SQL, /GRANT EXECUTE ON FUNCTION public\.mail_anfrage_daten\(UUID, UUID\) TO service_role;/);
    assert.match(SQL, /REVOKE ALL ON FUNCTION public\.mail_senden\(TEXT, UUID, UUID\) FROM PUBLIC, anon, authenticated;/);
    const daten = SQL.match(/FUNCTION public\.mail_anfrage_daten[\s\S]*?\$\$;/)[0];
    assert.match(daten, /r\.sender_id = p_absender AND r\.status = 'pending'/);
    assert.match(daten, /email_confirmed_at IS NOT NULL/);
});

test('die Einstellung ist für niemanden sonst lesbar', () => {
    assert.match(SQL, /CREATE POLICY "Eigene Mail-Einstellungen lesen" ON mail_einstellungen\s+FOR SELECT TO authenticated USING \(\(SELECT auth\.uid\(\)\) = user_id\)/);
    assert.match(SQL, /REVOKE ALL ON mail_einstellungen FROM anon;/);
});

test('die Funktion: nur mit Geheimnis, nur Kennungen, Gmail auf Port 465', () => {
    assert.match(FUNKTION, /req\.headers\.get\('x-push-geheimnis'\)/);
    assert.match(FUNKTION, /art !== 'anfrage'/);
    assert.match(FUNKTION, /rpc\/mail_anfrage_daten/);
    assert.match(FUNKTION, /Deno\.connectTls\(\{ hostname: 'smtp\.gmail\.com', port: 465 \}\)/);
    // 25 und 587 sperrt Supabase für Edge Functions.
    assert.ok(!/port: (25|587)\b/.test(FUNKTION));
    assert.match(FUNKTION, /Deno\.env\.get\('MAIL_ADRESSE'\)/);
    assert.match(FUNKTION, /Deno\.env\.get\('MAIL_APP_PASSWORT'\)/);
    // Der Name kommt maskiert ins HTML.
    assert.match(FUNKTION, /einsetzen\(vorlage\.html, maskieren\(name\)\)/);
});
