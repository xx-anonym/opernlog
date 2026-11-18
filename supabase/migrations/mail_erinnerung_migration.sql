-- Eine Erinnerung an neue, leere Konten (seit 18.11.2026).
--
-- Von 8 Konten hatten am 17.11.2026 nur 3 je einen Abend geloggt. Wer sich
-- registriert und dann nichts einträgt, kommt meist nicht wieder. Deshalb
-- geht eine einzige Mail an Konten, die eine Woche alt und noch leer sind:
-- kein Abend, kein Werk als gesehen markiert. Der Knopf führt in die App,
-- wo bis zum 30. Tag das Karussell "Was hast du schon gesehen?" wartet.
--
-- Je Konto höchstens einmal, nie wieder (vermerkt in push_protokoll unter
-- 'mail-erinnerung'). Wer Mails unter "Profil bearbeiten" → E-Mails
-- abgeschaltet hat, bekommt auch diese nicht. Älter als 30 Tage: keine
-- Erinnerung mehr.
--
-- Der Weg ist der der Mail bei Freundschaftsanfragen
-- (mail_anfrage_migration.sql): mail_senden() ruft über pg_net die Edge
-- Function mail-senden, die sich Adresse und Name selbst holt – über
-- mail_erinnerung_daten(), und nur, wenn die Erinnerung wirklich fällig ist.
--
-- Täglich um 16:00 UTC (17 Uhr in Deutschland). Mehrfaches Ausführen ist
-- gefahrlos.

-- ── Wann fällig ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mail_erinnerung_faellig(p_nutzer UUID)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM auth.users u
        JOIN public.profiles p ON p.id = u.id
        WHERE u.id = p_nutzer
          AND u.email IS NOT NULL
          AND u.email_confirmed_at IS NOT NULL
          AND p.created_at <= now() - interval '7 days'
          AND p.created_at > now() - interval '30 days'
          AND NOT EXISTS (SELECT 1 FROM public.visits v WHERE v.user_id = u.id)
          AND NOT EXISTS (SELECT 1 FROM public.seen_operas s WHERE s.user_id = u.id)
          AND coalesce((SELECT e.bei_anfrage FROM public.mail_einstellungen e WHERE e.user_id = u.id), true)
    );
$$;

REVOKE ALL ON FUNCTION public.mail_erinnerung_faellig(UUID) FROM PUBLIC, anon, authenticated;

-- ── Für die Edge Function (nur mit Dienstschlüssel aufrufbar) ────────────
--
-- Adresse und Benutzername des Empfängers, nur wenn die Erinnerung fällig
-- ist. Sonst NULL.

CREATE OR REPLACE FUNCTION public.mail_erinnerung_daten(p_empfaenger UUID)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT json_build_object('adresse', u.email, 'name', p.username)
    FROM auth.users u
    LEFT JOIN public.profiles p ON p.id = u.id
    WHERE u.id = p_empfaenger
      AND public.mail_erinnerung_faellig(p_empfaenger)
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.mail_erinnerung_daten(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mail_erinnerung_daten(UUID) TO service_role;

-- ── Der tägliche Lauf ─────────────────────────────────────────────────────
--
-- Höchstens 20 Mails je Lauf, falls je viele auf einmal fällig wären. Ein
-- Fehler bei einem Konto hält die anderen nicht auf. Gibt die Zahl der
-- angestoßenen Mails zurück.

CREATE OR REPLACE FUNCTION public.mail_erinnerungen()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    nutzer UUID;
    anzahl integer := 0;
BEGIN
    FOR nutzer IN
        SELECT p.id FROM public.profiles p
        WHERE p.created_at <= now() - interval '7 days'
          AND p.created_at > now() - interval '30 days'
          AND public.mail_erinnerung_faellig(p.id)
          AND NOT EXISTS (SELECT 1 FROM public.push_protokoll l
                          WHERE l.art = 'mail-erinnerung' AND l.schluessel = p.id::text)
        ORDER BY p.created_at
        LIMIT 20
    LOOP
        BEGIN
            -- Erst vermerken, dann senden: lieber eine Mail zu wenig als zwei.
            IF public.push_einmal('mail-erinnerung', nutzer::text, nutzer, interval '100 years') THEN
                PERFORM public.mail_senden('erinnerung', nutzer, nutzer);
                anzahl := anzahl + 1;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'mail_erinnerungen: %', SQLERRM;
        END;
    END LOOP;
    RETURN anzahl;
END;
$$;

REVOKE ALL ON FUNCTION public.mail_erinnerungen() FROM PUBLIC, anon, authenticated;

-- ── Zeitplan ──────────────────────────────────────────────────────────────
--
-- cron.schedule mit einem vorhandenen Namen ersetzt den Eintrag.

SELECT cron.schedule('mail-erinnerung', '0 16 * * *', 'SELECT public.mail_erinnerungen()');
