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
const ERINNERUNG = lies('supabase/migrations/mail_erinnerung_migration.sql')
    .split('\n').map(z => z.replace(/--.*$/, '')).join('\n');

test('die Vorlage in der Funktion ist die, die das Werkzeug erzeugt', () => {
    assert.equal(lies('supabase/functions/mail-senden/vorlage.js'), vorlageModul(),
        'weicht ab – node tests/werkzeug/mailvorlagen.mjs laufen lassen');
    assert.deepEqual(Object.keys(VORLAGEN), FUNKTIONS_MAILS.map(m => m.name));
});

test('die Anfrage-Mail: Name überall eingesetzt, Knopf in die App, keine Supabase-Variablen', () => {
    const v = VORLAGEN.anfrage;
    for (const teil of ['betreff', 'text', 'html']) assert.ok(v[teil].includes('%%NAME%%'), teil);
    // Der Knopf trägt den Link aus felder.js (mit Einmal-Code, seit
    // 23.11.2026); der Link darunter zeigt genau denselben.
    assert.match(v.html, /<a class="knopf" href="%%LINK%%"/);
    assert.match(v.html, /<a href="%%LINK%%" [^>]*>%%LINK%%<\/a>/);
    assert.match(v.text, /^Anfrage ansehen: %%LINK%%$/m);
    assert.ok(!/opernlog\.vercel\.app\/#/.test(v.html), 'ein Link zeigt noch auf vercel.app');
    assert.ok(!v.html.includes('{{'), 'Go-Template-Klammern – die füllt hier niemand');
    // Wo man sie abschaltet, steht in jeder Mail.
    assert.match(v.html, /Profil bearbeiten → E-Mails/);
    assert.match(v.text, /Profil bearbeiten → E-Mails/);
});

test('in keiner Funktions-Mail lautet ein Link anders, als er führt', () => {
    // Text, der wie eine Adresse aussieht, muss genau das Ziel sein – sonst
    // landet man ohne Anmeldung, und Mailprogramme werten es als Phishing.
    for (const [name, v] of Object.entries(VORLAGEN)) {
        for (const [, ziel, text] of v.html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]*)<\/a>/g)) {
            if (/^(https?:|%%)/.test(text.trim())) assert.equal(text.trim(), ziel, `${name}: ${text}`);
        }
    }
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

test('die Funktion: nur mit Geheimnis, nur Kennungen, SMTP auf Port 465', () => {
    assert.match(FUNKTION, /req\.headers\.get\('x-push-geheimnis'\)/);
    assert.match(FUNKTION, /Object\.hasOwn\(DATEN, art\)/);
    assert.match(FUNKTION, /anfrage: 'mail_anfrage_daten', erinnerung: 'mail_erinnerung_daten', saison: 'mail_saison_daten'/);
    assert.match(FUNKTION, /rest\(`rpc\/\$\{DATEN\[art as keyof typeof DATEN\]\}`/);
    // Der Mailserver kommt aus den Secrets (Resend seit 17.11.2026), ohne
    // Angabe Gmail wie vorher.
    assert.match(FUNKTION, /const HOST = \(Deno\.env\.get\('MAIL_HOST'\) \|\| 'smtp\.gmail\.com'\)\.trim\(\);/);
    assert.match(FUNKTION, /Deno\.connectTls\(\{ hostname: HOST, port: 465 \}\)/);
    assert.match(FUNKTION, /benutzer: BENUTZER,/);
    // Antworten gehen an support@opernlog.de (iCloud+), nicht ins noreply-Postfach.
    assert.match(FUNKTION, /\|\| 'support@opernlog\.de';/);
    assert.match(FUNKTION, /antwortAn: ANTWORT,/);
    // 25 und 587 sperrt Supabase für Edge Functions.
    assert.ok(!/port: (25|587)\b/.test(FUNKTION));
    assert.match(FUNKTION, /Deno\.env\.get\('MAIL_ADRESSE'\)/);
    assert.match(FUNKTION, /Deno\.env\.get\('MAIL_APP_PASSWORT'\)/);
    // Name, Titel und Zahlen kommen maskiert ins HTML (felder.js).
    assert.match(FUNKTION, /einsetzen\(vorlage\.html, felder, \{ html: true \}\)/);
    // Der Einmal-Code für den Knopf: nur für die Mails, die anmelden, und
    // ohne die Antwort von generate_link (sie nennt die Adresse) im Protokoll.
    assert.match(FUNKTION, /const code = MIT_ANMELDUNG\.has\(art\) \? await einmalCode\(daten\.adresse\) : null;/);
    assert.match(FUNKTION, /felderFuer\(art, daten, \{ code \}\)/);
    assert.match(FUNKTION, /\/auth\/v1\/admin\/generate_link/);
    assert.match(FUNKTION, /throw new Error\(`generate_link: \$\{antwort\.status\}`\)/);
});

// ── Erinnerung an leere Konten (seit 18.11.2026) ─────────────────────────

test('die Erinnerung: Name des Empfängers, Links auf opernlog.de, "nur einmal" im Fuß', () => {
    const v = VORLAGEN.erinnerung;
    for (const teil of ['betreff', 'text', 'html']) assert.ok(v[teil].includes('%%NAME%%'), teil);
    // Links auf die eigene Domain, damit sie den Umzug überleben.
    assert.match(v.html, /<a class="knopf" href="%%LINK%%"/);
    assert.match(v.text, /^Zu OpernLog: %%LINK%%$/m);
    assert.ok(!/<a [^>]*href="https:\/\/opernlog\.vercel\.app/.test(v.html), 'ein Link zeigt noch auf vercel.app');
    assert.ok(!v.html.includes('{{'));
    for (const teil of [v.text, v.html]) {
        assert.match(teil, /nur einmal/);
        assert.match(teil, /Profil bearbeiten → E-Mails/);
    }
});

test('die Erinnerung ist fällig nur für leere Konten zwischen 7 und 30 Tagen, mit bestätigter Adresse, nicht abgeschaltet', () => {
    const faellig = ERINNERUNG.match(/FUNCTION public\.mail_erinnerung_faellig[\s\S]*?\$\$;/)[0];
    assert.match(faellig, /email_confirmed_at IS NOT NULL/);
    assert.match(faellig, /p\.created_at <= now\(\) - interval '7 days'/);
    assert.match(faellig, /p\.created_at > now\(\) - interval '30 days'/);
    assert.match(faellig, /NOT EXISTS \(SELECT 1 FROM public\.visits v WHERE v\.user_id = u\.id\)/);
    assert.match(faellig, /NOT EXISTS \(SELECT 1 FROM public\.seen_operas s WHERE s\.user_id = u\.id\)/);
    assert.match(faellig, /mail_einstellungen e WHERE e\.user_id = u\.id\), true\)/);
    // Die Daten für die Funktion hängen an derselben Prüfung.
    const daten = ERINNERUNG.match(/FUNCTION public\.mail_erinnerung_daten[\s\S]*?\$\$;/)[0];
    assert.match(daten, /public\.mail_erinnerung_faellig\(p_empfaenger\)/);
});

test('die Erinnerung geht je Konto nur einmal, höchstens 20 je Lauf, täglich', () => {
    const lauf = ERINNERUNG.match(/FUNCTION public\.mail_erinnerungen\(\)[\s\S]*?\$\$;/)[0];
    assert.match(lauf, /push_einmal\('mail-erinnerung', nutzer::text, nutzer, interval '100 years'\)/);
    assert.match(lauf, /l\.art = 'mail-erinnerung' AND l\.schluessel = p\.id::text/);
    assert.match(lauf, /LIMIT 20/);
    assert.match(lauf, /mail_senden\('erinnerung', nutzer, nutzer\)/);
    assert.match(lauf, /EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING/);
    assert.match(ERINNERUNG, /cron\.schedule\('mail-erinnerung', '0 16 \* \* \*', 'SELECT public\.mail_erinnerungen\(\)'\)/);
});

test('Erinnerungs-Funktionen sind nicht von außen aufrufbar', () => {
    for (const f of ['mail_erinnerung_faellig(UUID)', 'mail_erinnerung_daten(UUID)', 'mail_erinnerungen()']) {
        assert.ok(ERINNERUNG.includes(`REVOKE ALL ON FUNCTION public.${f} FROM PUBLIC, anon, authenticated;`), f);
    }
    assert.match(ERINNERUNG, /GRANT EXECUTE ON FUNCTION public\.mail_erinnerung_daten\(UUID\) TO service_role;/);
});

// ── Saisonrückblick (seit 23.11.2026) ────────────────────────────────────

const SAISON = lies('supabase/migrations/mail_saison_migration.sql');

test('Saisonrückblick: nur fällige Konten, je Spielzeit einmal, am 31. Juli und im August', () => {
    const faellig = SAISON.match(/FUNCTION public\.mail_saison_faellig[\s\S]*?\$\$;/)[0];
    assert.match(faellig, /email_confirmed_at IS NOT NULL/);
    // Abgeschaltete Mails gelten auch hier.
    assert.match(faellig, /coalesce\(\(SELECT e\.bei_anfrage FROM public\.mail_einstellungen e WHERE e\.user_id = u\.id\), true\)/);
    assert.match(faellig, /FROM public\.visits v/);

    const daten = SAISON.match(/FUNCTION public\.mail_saison_daten[\s\S]*?\$\$;/)[0];
    assert.match(daten, /public\.mail_saison_faellig\(p_empfaenger\)/);
    // Der Abend der Saison: beste Bewertung, bei Gleichstand der jüngste.
    assert.match(daten, /ORDER BY a\.rating DESC NULLS LAST, a\.date DESC/);

    const lauf = SAISON.match(/FUNCTION public\.mail_saisonrueckblicke[\s\S]*?\$\$;/)[0];
    assert.match(lauf, /extract\(month FROM p_heute\) = 7 AND extract\(day FROM p_heute\) = 31\) OR extract\(month FROM p_heute\) = 8/);
    assert.match(lauf, /push_einmal\('mail-saison', nutzer \|\| ':' \|\| etikett, nutzer, interval '300 days'\)/);
    assert.match(lauf, /l\.art = 'mail-saison' AND l\.schluessel = v\.user_id \|\| ':' \|\| etikett/);
    assert.match(lauf, /mail_senden\('saison', nutzer, nutzer\)/);
    assert.match(lauf, /LIMIT 50/);
    assert.match(lauf, /EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING/);

    // Dieselbe Spielzeit wie die Push-Mitteilung am selben Tag.
    const push = lies('supabase/migrations/push_migration.sql');
    const regel = /WHEN \(extract\(month FROM p_heute\), extract\(day FROM p_heute\)\) >= \(7, 31\)\s+THEN extract\(year FROM p_heute\)::int - 1\s+ELSE extract\(year FROM p_heute\)::int - 2/;
    assert.match(push, regel);
    assert.match(SAISON, regel);

    assert.match(SAISON, /cron\.schedule\('mail-saison', '5 8 \* 7,8 \*', 'SELECT public\.mail_saisonrueckblicke\(\)'\)/);
    for (const f of ['mail_saison_faellig(UUID, DATE)', 'mail_saison_daten(UUID)', 'mail_saisonrueckblicke(DATE)']) {
        assert.ok(SAISON.includes(`REVOKE ALL ON FUNCTION public.${f} FROM PUBLIC, anon, authenticated;`), f);
    }
    assert.match(SAISON, /GRANT EXECUTE ON FUNCTION public\.mail_saison_daten\(UUID\) TO service_role;/);
});

test('Saisonrückblick: die Vorlage führt in den Rückblick, die Titelliste ist aktuell', async () => {
    const v = VORLAGEN.saison;
    assert.match(v.html, /<a class="knopf" href="%%LINK%%"/);
    assert.match(v.text, /^Zum Saisonrückblick: %%LINK%%$/m);
    assert.match(v.html, /Profil → Profil bearbeiten → E-Mails/);
    // Jeder Platzhalter der Vorlage bekommt einen Wert (felder.js).
    const { felderFuer } = await import('../../supabase/functions/mail-senden/felder.js');
    const felder = felderFuer('saison', { name: 'X', saison: '2025/26', abende: 1, haeuser: 1, werke: 1, erstmals: 0, abend: {}, haus: {} });
    for (const teil of [v.betreff, v.text, v.html]) {
        for (const [, k] of teil.matchAll(/%%([A-Z_]+)%%/g)) assert.ok(k in felder, `%%${k}%% hat keinen Wert`);
    }
    const { katalogModul } = await import('../werkzeug/mailvorlagen.mjs');
    assert.equal(lies('supabase/functions/mail-senden/katalog.js'), await katalogModul(),
        'katalog.js passt nicht mehr zu operas.js/operaHouses.js – node tests/werkzeug/mailvorlagen.mjs');
});
