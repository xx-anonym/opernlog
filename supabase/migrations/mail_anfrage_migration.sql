-- Mail bei einer neuen Freundschaftsanfrage.
--
-- Supabase verschickt mit dem eigenen Postausgang (Gmail) nur die Mails der
-- Anmeldung. Diese hier geht denselben Weg wie die Push-Mitteilungen
-- (push_migration.sql): ein Auslöser bemerkt die neue Anfrage, pg_net ruft
-- nach dem Ende der Transaktion die Edge Function mail-senden, und die
-- verschickt über Gmail. Eine Anfrage wartet also nie auf den Versand, und ein
-- Fehler dabei macht sie nicht rückgängig.
--
-- Alle bekommen die Mail, bis sie sie unter "Profil bearbeiten" abschalten
-- (Jonas, 2.11.2026). Wer nie etwas eingestellt hat, hat keine Zeile in
-- mail_einstellungen – das zählt als eingeschaltet.
--
-- Höchstens eine Mail je Absender und Empfänger in sieben Tagen: wer eine
-- Anfrage zurückzieht oder abgelehnt bekommt und neu schickt, löst nicht
-- jedes Mal eine aus.
--
-- Mehrfaches Ausführen ist gefahrlos.

-- ── Einstellung ───────────────────────────────────────────────────────────
--
-- Nicht in profiles: das ist für jeden lesbar, und wer Mails abbestellt hat,
-- geht niemanden etwas an.

CREATE TABLE IF NOT EXISTS mail_einstellungen (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    bei_anfrage BOOLEAN NOT NULL DEFAULT true,
    geaendert_am TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE mail_einstellungen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Eigene Mail-Einstellungen lesen" ON mail_einstellungen;
CREATE POLICY "Eigene Mail-Einstellungen lesen" ON mail_einstellungen
    FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Eigene Mail-Einstellungen anlegen" ON mail_einstellungen;
CREATE POLICY "Eigene Mail-Einstellungen anlegen" ON mail_einstellungen
    FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS "Eigene Mail-Einstellungen ändern" ON mail_einstellungen;
CREATE POLICY "Eigene Mail-Einstellungen ändern" ON mail_einstellungen
    FOR UPDATE TO authenticated
    USING ((SELECT auth.uid()) = user_id) WITH CHECK ((SELECT auth.uid()) = user_id);

-- Seit dem 30.10.2026 gibt Supabase neuen Tabellen keine Rechte mehr von
-- selbst (siehe tests/checks/rls.test.js).
REVOKE ALL ON mail_einstellungen FROM anon;
GRANT SELECT, INSERT, UPDATE ON mail_einstellungen TO authenticated;

-- ── Für die Edge Function (nur mit Dienstschlüssel aufrufbar) ────────────
--
-- Adresse des Empfängers und Name des Absenders – aber nur, wenn die Mail
-- wirklich fällig ist: offene Anfrage genau dieses Absenders, bestätigte
-- Adresse, Mails nicht abgeschaltet. Sonst NULL. So kann die Funktion auch
-- mit dem Geheimnis niemandem etwas schicken, dem keine Anfrage gilt.

CREATE OR REPLACE FUNCTION public.mail_anfrage_daten(p_empfaenger UUID, p_absender UUID)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT json_build_object('adresse', u.email, 'name', p.username)
    FROM auth.users u
    JOIN public.friend_requests r
      ON r.receiver_id = u.id AND r.sender_id = p_absender AND r.status = 'pending'
    LEFT JOIN public.profiles p ON p.id = p_absender
    WHERE u.id = p_empfaenger
      AND u.email IS NOT NULL
      AND u.email_confirmed_at IS NOT NULL
      AND coalesce((SELECT e.bei_anfrage FROM public.mail_einstellungen e WHERE e.user_id = p_empfaenger), true)
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.mail_anfrage_daten(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mail_anfrage_daten(UUID, UUID) TO service_role;

-- ── Versand ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.mail_senden(p_art TEXT, p_empfaenger UUID, p_absender UUID)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    geheimnis TEXT;
BEGIN
    -- Dasselbe Geheimnis wie für push-senden (push_migration.sql).
    SELECT decrypted_secret INTO geheimnis FROM vault.decrypted_secrets WHERE name = 'push_geheimnis';
    PERFORM net.http_post(
        url := 'https://gqdblqymteclmdlushox.supabase.co/functions/v1/mail-senden',
        body := jsonb_build_object('art', p_art, 'empfaenger', p_empfaenger, 'absender', p_absender),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-geheimnis', geheimnis),
        timeout_milliseconds := 20000);
END;
$$;

REVOKE ALL ON FUNCTION public.mail_senden(TEXT, UUID, UUID) FROM PUBLIC, anon, authenticated;

-- ── Auslöser ──────────────────────────────────────────────────────────────
--
-- Neben push_bei_anfrage, nicht in ihm: die Push-Mitteilung geht nur an
-- Geräte mit Abo, die Mail an alle, die sie nicht abgeschaltet haben. Mit
-- Auffangnetz wie dort – eine Anfrage darf nie an der Mail scheitern.

CREATE OR REPLACE FUNCTION public.mail_bei_anfrage()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.status <> 'pending' THEN RETURN NEW; END IF;
    IF NOT coalesce((SELECT bei_anfrage FROM public.mail_einstellungen WHERE user_id = NEW.receiver_id), true) THEN
        RETURN NEW;
    END IF;
    -- Vermerkt im Protokoll der Push-Mitteilungen, unter eigener Art.
    IF NOT public.push_einmal('mail-anfrage', NEW.sender_id || ':' || NEW.receiver_id, NEW.receiver_id, interval '7 days') THEN
        RETURN NEW;
    END IF;
    PERFORM public.mail_senden('anfrage', NEW.receiver_id, NEW.sender_id);
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'mail_bei_anfrage: %', SQLERRM;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.mail_bei_anfrage() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS mail_bei_anfrage ON public.friend_requests;
CREATE TRIGGER mail_bei_anfrage AFTER INSERT ON public.friend_requests
    FOR EACH ROW EXECUTE FUNCTION public.mail_bei_anfrage();
