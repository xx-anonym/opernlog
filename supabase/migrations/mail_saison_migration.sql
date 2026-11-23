-- Eine Mail zum Saisonrückblick (seit 23.11.2026).
--
-- Am 31. Juli erscheint der Rückblick auf die zu Ende gehende Spielzeit in
-- der App, und wer Mitteilungen eingeschaltet hat, bekommt eine Push-
-- Mitteilung (push_saisonrueckblick, push_migration.sql). Wer das nicht hat,
-- erfuhr bisher nichts davon. Jetzt kommt am selben Tag auch eine Mail: die
-- Zahlen der Spielzeit (Abende, Häuser, Werke, davon zum ersten Mal), der
-- Abend der Saison und das Haus, in dem man am häufigsten war, mit dem Knopf
-- in den Rückblick.
--
-- Je Konto und Spielzeit einmal (vermerkt in push_protokoll unter
-- 'mail-saison', Schlüssel "<nutzer>:<2025/26>"). Nur an bestätigte Adressen
-- und nur, wer Mails unter "Profil bearbeiten" → E-Mails nicht abgeschaltet
-- hat. Nur wer in der Spielzeit mindestens einen Abend geloggt hat.
--
-- Der Weg ist der der übrigen Mails (mail_erinnerung_migration.sql):
-- mail_senden() ruft über pg_net die Edge Function mail-senden, die sich
-- Adresse, Name und Zahlen selbst holt – über mail_saison_daten(), und nur,
-- wenn die Mail wirklich fällig ist.
--
-- Täglich um 08:05 UTC im Juli und August; die Funktion selbst wird nur am
-- 31. Juli und im August tätig, wie der Rückblick in der App
-- (isSeasonReviewWindow in src/data/season.js). Je Lauf höchstens 50 Mails;
-- wer am 31. Juli nicht drankam, folgt am nächsten Tag. Mehrfaches Ausführen
-- ist gefahrlos.

-- ── Welche Spielzeit ──────────────────────────────────────────────────────
--
-- Das erste Jahr der zuletzt abgeschlossenen Spielzeit, wie
-- lastCompletedSeasonStartYear() in der App und push_saisonrueckblick(): am
-- 31. Juli zählt die laufende schon als abgeschlossen.

CREATE OR REPLACE FUNCTION public.mail_saison_start(p_heute DATE DEFAULT current_date)
RETURNS integer
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
    SELECT CASE
        WHEN (extract(month FROM p_heute), extract(day FROM p_heute)) >= (7, 31)
            THEN extract(year FROM p_heute)::int - 1
        ELSE extract(year FROM p_heute)::int - 2
    END;
$$;

-- "2025/26"
CREATE OR REPLACE FUNCTION public.mail_saison_etikett(p_start INT)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = ''
AS $$
    SELECT p_start || '/' || lpad(((p_start + 1) % 100)::text, 2, '0');
$$;

-- ── Wann fällig ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mail_saison_faellig(p_nutzer UUID, p_heute DATE DEFAULT current_date)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM auth.users u
        WHERE u.id = p_nutzer
          AND u.email IS NOT NULL
          AND u.email_confirmed_at IS NOT NULL
          AND coalesce((SELECT e.bei_anfrage FROM public.mail_einstellungen e WHERE e.user_id = u.id), true)
          AND EXISTS (
              SELECT 1 FROM public.visits v
              WHERE v.user_id = u.id
                AND v.date BETWEEN make_date(public.mail_saison_start(p_heute), 8, 1)
                               AND make_date(public.mail_saison_start(p_heute) + 1, 7, 31))
    );
$$;

REVOKE ALL ON FUNCTION public.mail_saison_faellig(UUID, DATE) FROM PUBLIC, anon, authenticated;

-- ── Für die Edge Function (nur mit Dienstschlüssel aufrufbar) ────────────
--
-- Adresse, Benutzername und die Zahlen der Spielzeit, nur wenn die Mail
-- fällig ist. Sonst NULL. Werke und Häuser als Kennung; die Titel kennt die
-- Edge Function (katalog.js, erzeugt aus operas.js und operaHouses.js).
-- Für Werke und Häuser, die der Admin in der App angelegt hat, steht der
-- Titel aus catalog_operas bzw. catalog_houses dabei.
--
--   abend: der Abend der Saison – die beste Bewertung, bei Gleichstand der
--          jüngste
--   haus:  wo die meisten Abende waren, bei Gleichstand der jüngste
--   erstmals: Werke, die vor dieser Spielzeit kein Abend zeigte

CREATE OR REPLACE FUNCTION public.mail_saison_daten(p_empfaenger UUID)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
    WITH grenzen AS (
        SELECT public.mail_saison_start() AS start_jahr
    ), abende AS (
        SELECT v.* FROM public.visits v, grenzen g
        WHERE v.user_id = p_empfaenger
          AND v.date BETWEEN make_date(g.start_jahr, 8, 1) AND make_date(g.start_jahr + 1, 7, 31)
    ), bester AS (
        SELECT a.opera_id, a.house_id, a.date, a.rating
        FROM abende a
        ORDER BY a.rating DESC NULLS LAST, a.date DESC
        LIMIT 1
    ), haus AS (
        SELECT a.house_id, count(*) AS anzahl
        FROM abende a
        GROUP BY a.house_id
        ORDER BY count(*) DESC, max(a.date) DESC
        LIMIT 1
    )
    SELECT json_build_object(
        'adresse', u.email,
        'name', p.username,
        'saison', public.mail_saison_etikett(g.start_jahr),
        'abende', (SELECT count(*) FROM abende),
        'haeuser', (SELECT count(DISTINCT house_id) FROM abende),
        'werke', (SELECT count(DISTINCT opera_id) FROM abende),
        'erstmals', (SELECT count(DISTINCT a.opera_id) FROM abende a
                     WHERE NOT EXISTS (SELECT 1 FROM public.visits w
                                       WHERE w.user_id = p_empfaenger AND w.opera_id = a.opera_id
                                         AND w.date < make_date(g.start_jahr, 8, 1))),
        'abend', (SELECT json_build_object(
                      'werk', b.opera_id,
                      'werk_titel', (SELECT c.title FROM public.catalog_operas c WHERE c.id = b.opera_id),
                      'haus', b.house_id,
                      'haus_name', (SELECT c.name FROM public.catalog_houses c WHERE c.id = b.house_id),
                      'datum', b.date,
                      'sterne', b.rating)
                  FROM bester b),
        'haus', (SELECT json_build_object(
                     'haus', h.house_id,
                     'haus_name', (SELECT c.name FROM public.catalog_houses c WHERE c.id = h.house_id),
                     'abende', h.anzahl)
                 FROM haus h)
    )
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    CROSS JOIN grenzen g
    WHERE u.id = p_empfaenger
      AND public.mail_saison_faellig(p_empfaenger)
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.mail_saison_daten(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mail_saison_daten(UUID) TO service_role;

-- ── Der tägliche Lauf ─────────────────────────────────────────────────────
--
-- Nur am 31. Juli und im August. Höchstens 50 Mails je Lauf. Ein Fehler bei
-- einem Konto hält die anderen nicht auf. Gibt die Zahl der angestoßenen
-- Mails zurück. p_heute nur für Tests; der Termin ruft ohne Argument.

CREATE OR REPLACE FUNCTION public.mail_saisonrueckblicke(p_heute DATE DEFAULT current_date)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    start_jahr INT;
    etikett TEXT;
    nutzer UUID;
    anzahl integer := 0;
BEGIN
    IF NOT ((extract(month FROM p_heute) = 7 AND extract(day FROM p_heute) = 31) OR extract(month FROM p_heute) = 8) THEN
        RETURN 0;
    END IF;
    start_jahr := public.mail_saison_start(p_heute);
    etikett := public.mail_saison_etikett(start_jahr);

    FOR nutzer IN
        SELECT DISTINCT v.user_id FROM public.visits v
        WHERE v.date BETWEEN make_date(start_jahr, 8, 1) AND make_date(start_jahr + 1, 7, 31)
          AND NOT EXISTS (SELECT 1 FROM public.push_protokoll l
                          WHERE l.art = 'mail-saison' AND l.schluessel = v.user_id || ':' || etikett)
          AND public.mail_saison_faellig(v.user_id, p_heute)
        LIMIT 50
    LOOP
        BEGIN
            -- Erst vermerken, dann senden: lieber eine Mail zu wenig als zwei.
            IF public.push_einmal('mail-saison', nutzer || ':' || etikett, nutzer, interval '300 days') THEN
                PERFORM public.mail_senden('saison', nutzer, nutzer);
                anzahl := anzahl + 1;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'mail_saisonrueckblicke: %', SQLERRM;
        END;
    END LOOP;
    RETURN anzahl;
END;
$$;

REVOKE ALL ON FUNCTION public.mail_saisonrueckblicke(DATE) FROM PUBLIC, anon, authenticated;

-- ── Zeitplan ──────────────────────────────────────────────────────────────
--
-- 08:05 UTC ist 10:05 Uhr deutscher Sommerzeit, fünf Minuten nach der
-- Push-Mitteilung. cron.schedule mit einem vorhandenen Namen ersetzt den
-- Eintrag.

SELECT cron.schedule('mail-saison', '5 8 * 7,8 *', 'SELECT public.mail_saisonrueckblicke()');
