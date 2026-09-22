-- Push-Mitteilungen.
--
-- Anlässe: neue Freundschaftsanfrage, angenommene Einladung, Like oder
-- Kommentar auf die eigene Review, Saisonrückblick am 31. Juli.
--
-- Der Weg einer Mitteilung:
--
--   1. Ein Auslöser in dieser Datei bemerkt das Ereignis (neue Zeile in
--      friend_requests, likes, comments; angenommene Einladung in
--      accept_invite; der Termin am 31. Juli über pg_cron).
--   2. push_senden() legt über pg_net eine Anfrage an die Edge Function
--      push-senden in die Warteschlange. pg_net arbeitet nach dem Ende der
--      Transaktion; der Like oder Kommentar wartet also nicht auf den Versand,
--      und ein Fehler beim Versand macht ihn nicht rückgängig.
--   3. Die Edge Function verschlüsselt die Mitteilung für jedes Gerät des
--      Empfängers und schickt sie an Apple, Google oder Mozilla.
--
-- Zwei Geheimnisse liegen im Supabase Vault und verlassen den Server nie:
-- push_geheimnis, mit dem sich die Datenbank bei der Edge Function ausweist,
-- und der private VAPID-Schlüssel, den die Edge Function beim ersten Aufruf
-- selbst erzeugt.
--
-- Mehrfaches Ausführen ist gefahrlos.

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── Abos ──────────────────────────────────────────────────────────────────
--
-- Ein Abo ist ein Gerät (genauer: ein Browser auf einem Gerät). endpoint ist
-- die Adresse beim Push-Dienst, p256dh und auth die Schlüssel, mit denen nur
-- dieser Browser die Mitteilung lesen kann.

CREATE TABLE IF NOT EXISTS push_abos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    zuletzt_benutzt TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS push_abos_user_id ON push_abos (user_id);

ALTER TABLE push_abos ENABLE ROW LEVEL SECURITY;
-- Lesen darf jeder nur die eigenen. Schreiben geht ausschließlich über
-- push_abo_speichern() und push_abo_loeschen() unten.
DROP POLICY IF EXISTS "Eigene Push-Abos lesen" ON push_abos;
CREATE POLICY "Eigene Push-Abos lesen" ON push_abos
    FOR SELECT USING ((SELECT auth.uid()) = user_id);

-- ── Protokoll ─────────────────────────────────────────────────────────────
--
-- Damit niemand mit Mitteilungen überschüttet wird: wer einen Like zurücknimmt
-- und wieder setzt, oder eine abgelehnte Anfrage erneut schickt, löst nicht
-- jedes Mal eine neue aus. Keine Regel für Nutzer – nur die Funktionen hier
-- lesen und schreiben.

CREATE TABLE IF NOT EXISTS push_protokoll (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    empfaenger UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    art TEXT NOT NULL,
    schluessel TEXT NOT NULL,
    gesendet_am TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS push_protokoll_suche ON push_protokoll (art, schluessel, gesendet_am);
CREATE INDEX IF NOT EXISTS push_protokoll_empfaenger ON push_protokoll (empfaenger);

ALTER TABLE push_protokoll ENABLE ROW LEVEL SECURITY;

-- ── Geheimnis für die Edge Function ───────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'push_geheimnis') THEN
        PERFORM vault.create_secret(
            encode(extensions.gen_random_bytes(32), 'hex'),
            'push_geheimnis',
            'Push: damit weist sich die Datenbank bei der Edge Function push-senden aus');
    END IF;
END $$;

-- ── Für die Edge Function (nur mit Dienstschlüssel aufrufbar) ────────────

CREATE OR REPLACE FUNCTION public.push_intern()
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT json_build_object(
        'geheimnis',         (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'push_geheimnis'),
        'vapid_oeffentlich', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'push_vapid_oeffentlich'),
        'vapid_privat',      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'push_vapid_privat'));
$$;

-- Legt das VAPID-Paar an, wenn es noch keins gibt, und gibt das gültige
-- zurück. Ein vorhandenes wird nie ersetzt: jedes Abo hängt an genau diesem
-- öffentlichen Schlüssel, ein neuer machte alle Abos auf einen Schlag wertlos.
CREATE OR REPLACE FUNCTION public.push_vapid_speichern(p_oeffentlich TEXT, p_privat TEXT)
RETURNS json
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('push_vapid'));
    IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'push_vapid_oeffentlich') THEN
        PERFORM vault.create_secret(p_oeffentlich, 'push_vapid_oeffentlich', 'Push: öffentlicher VAPID-Schlüssel');
        PERFORM vault.create_secret(p_privat, 'push_vapid_privat', 'Push: privater VAPID-Schlüssel (JWK)');
    END IF;
    RETURN public.push_intern();
END;
$$;

REVOKE ALL ON FUNCTION public.push_intern() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_vapid_speichern(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_intern() TO service_role;
GRANT EXECUTE ON FUNCTION public.push_vapid_speichern(TEXT, TEXT) TO service_role;

-- ── Für die App ───────────────────────────────────────────────────────────

-- Die Liste der Push-Dienste steht auch in supabase/functions/push-senden/
-- webpush.js (PUSH_DIENSTE). Dass beide gleich bleiben, prüft
-- tests/checks/push.test.js.
CREATE OR REPLACE FUNCTION public.push_abo_speichern(p_endpoint TEXT, p_p256dh TEXT, p_auth TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    ich UUID := (SELECT auth.uid());
BEGIN
    IF ich IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet'; END IF;
    IF length(p_endpoint) > 2000
       OR p_endpoint !~ '^https://(fcm\.googleapis\.com|([a-z0-9-]+\.)*push\.apple\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*notify\.windows\.com)/' THEN
        RAISE EXCEPTION 'Unbekannter Push-Dienst';
    END IF;
    IF p_p256dh !~ '^[A-Za-z0-9_-]{86,88}$' OR p_auth !~ '^[A-Za-z0-9_-]{22,24}$' THEN
        RAISE EXCEPTION 'Ungültige Schlüssel';
    END IF;
    -- Ein Gerät gehört dem, der zuletzt darauf angemeldet war. Stand es vorher
    -- unter einem anderen Konto, bekommt jenes ab jetzt nichts mehr dorthin.
    DELETE FROM public.push_abos WHERE endpoint = p_endpoint;
    INSERT INTO public.push_abos (user_id, endpoint, p256dh, auth) VALUES (ich, p_endpoint, p_p256dh, p_auth);
END;
$$;

CREATE OR REPLACE FUNCTION public.push_abo_loeschen(p_endpoint TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    DELETE FROM public.push_abos WHERE endpoint = p_endpoint AND user_id = (SELECT auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.push_abo_speichern(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.push_abo_loeschen(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.push_abo_speichern(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.push_abo_loeschen(TEXT) TO authenticated;

-- ── Versand ───────────────────────────────────────────────────────────────

-- true, wenn diese Mitteilung in der Frist noch nicht verschickt wurde – und
-- vermerkt sie dann.
CREATE OR REPLACE FUNCTION public.push_einmal(p_art TEXT, p_schluessel TEXT, p_empfaenger UUID, p_frist INTERVAL)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.push_protokoll
               WHERE art = p_art AND schluessel = p_schluessel AND gesendet_am > now() - p_frist) THEN
        RETURN false;
    END IF;
    INSERT INTO public.push_protokoll (empfaenger, art, schluessel) VALUES (p_empfaenger, p_art, p_schluessel);
    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.push_senden(p_empfaenger UUID[], p_titel TEXT, p_text TEXT, p_url TEXT, p_tag TEXT DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    geheimnis TEXT;
BEGIN
    -- Ohne Abo keine Anfrage: die meisten Ereignisse treffen Leute, die
    -- Mitteilungen gar nicht eingeschaltet haben.
    IF NOT EXISTS (SELECT 1 FROM public.push_abos WHERE user_id = ANY (p_empfaenger)) THEN
        RETURN;
    END IF;
    SELECT decrypted_secret INTO geheimnis FROM vault.decrypted_secrets WHERE name = 'push_geheimnis';
    PERFORM net.http_post(
        url := 'https://gqdblqymteclmdlushox.supabase.co/functions/v1/push-senden',
        body := jsonb_build_object('empfaenger', to_jsonb(p_empfaenger), 'titel', p_titel,
                                   'text', p_text, 'url', p_url, 'tag', p_tag),
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-geheimnis', geheimnis),
        timeout_milliseconds := 10000);
END;
$$;

REVOKE ALL ON FUNCTION public.push_einmal(TEXT, TEXT, UUID, INTERVAL) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_senden(UUID[], TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

-- Eine Probemitteilung an sich selbst, aus dem Profil heraus. Höchstens eine
-- pro Minute.
CREATE OR REPLACE FUNCTION public.push_test()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    ich UUID := (SELECT auth.uid());
BEGIN
    IF ich IS NULL THEN RAISE EXCEPTION 'Nicht angemeldet'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.push_abos WHERE user_id = ich) THEN RETURN false; END IF;
    IF NOT public.push_einmal('test', ich::text, ich, interval '1 minute') THEN RETURN false; END IF;
    PERFORM public.push_senden(ARRAY[ich], 'OpernLog', 'So sehen Mitteilungen von OpernLog aus.', '#/profile', 'test');
    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.push_test() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.push_test() TO authenticated;

-- ── Auslöser ──────────────────────────────────────────────────────────────
--
-- Alle mit Auffangnetz: scheitert der Versand, wird nur gewarnt. Ein Like
-- oder Kommentar darf nie an einer Mitteilung scheitern.

CREATE OR REPLACE FUNCTION public.push_bei_anfrage()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    name TEXT;
BEGIN
    IF NEW.status <> 'pending' THEN RETURN NEW; END IF;
    IF NOT public.push_einmal('anfrage', NEW.sender_id || ':' || NEW.receiver_id, NEW.receiver_id, interval '1 day') THEN
        RETURN NEW;
    END IF;
    SELECT username INTO name FROM public.profiles WHERE id = NEW.sender_id;
    PERFORM public.push_senden(ARRAY[NEW.receiver_id], 'Neue Freundschaftsanfrage',
        coalesce(name, 'Jemand') || ' möchte mit dir befreundet sein.', '#/', 'anfrage-' || NEW.sender_id);
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'push_bei_anfrage: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS push_bei_anfrage ON public.friend_requests;
CREATE TRIGGER push_bei_anfrage AFTER INSERT ON public.friend_requests
    FOR EACH ROW EXECUTE FUNCTION public.push_bei_anfrage();

CREATE OR REPLACE FUNCTION public.push_bei_like()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    besitzer UUID;
    datum DATE;
    name TEXT;
BEGIN
    IF NEW.target_type <> 'visit' THEN RETURN NEW; END IF;
    SELECT user_id, date INTO besitzer, datum FROM public.visits WHERE id = NEW.target_id;
    IF besitzer IS NULL OR besitzer = NEW.user_id THEN RETURN NEW; END IF;
    -- Zurücknehmen und wieder setzen meldet nicht noch einmal.
    IF NOT public.push_einmal('like', NEW.user_id || ':' || NEW.target_id, besitzer, interval '30 days') THEN
        RETURN NEW;
    END IF;
    SELECT username INTO name FROM public.profiles WHERE id = NEW.user_id;
    PERFORM public.push_senden(ARRAY[besitzer], 'Neues Like',
        coalesce(name, 'Jemand') || ' gefällt deine Review vom ' || to_char(datum, 'DD.MM.YYYY') || '.',
        '#/visit/' || NEW.target_id, 'like-' || NEW.target_id);
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'push_bei_like: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS push_bei_like ON public.likes;
CREATE TRIGGER push_bei_like AFTER INSERT ON public.likes
    FOR EACH ROW EXECUTE FUNCTION public.push_bei_like();

-- Kommentare gibt es auch unter Listen; gemeldet werden nur die unter einem
-- Besuch, also einer Review.
CREATE OR REPLACE FUNCTION public.push_bei_kommentar()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    besitzer UUID;
    name TEXT;
BEGIN
    SELECT user_id INTO besitzer FROM public.visits WHERE id = NEW.target_id;
    IF besitzer IS NULL OR besitzer = NEW.user_id THEN RETURN NEW; END IF;
    SELECT username INTO name FROM public.profiles WHERE id = NEW.user_id;
    PERFORM public.push_senden(ARRAY[besitzer], 'Neuer Kommentar',
        coalesce(name, 'Jemand') || ': '
            || CASE WHEN length(NEW.text) > 120 THEN left(NEW.text, 119) || '…' ELSE NEW.text END,
        '#/visit/' || NEW.target_id, 'kommentar-' || NEW.target_id);
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'push_bei_kommentar: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS push_bei_kommentar ON public.comments;
CREATE TRIGGER push_bei_kommentar AFTER INSERT ON public.comments
    FOR EACH ROW EXECUTE FUNCTION public.push_bei_kommentar();

REVOKE ALL ON FUNCTION public.push_bei_anfrage() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_bei_like() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_bei_kommentar() FROM PUBLIC, anon, authenticated;

-- ── Angenommene Einladung ─────────────────────────────────────────────────
--
-- accept_invite wie bisher, dazu am Ende die Mitteilung an den Einladenden.
-- Nur wenn die Freundschaft wirklich neu ist: wer denselben Link zweimal
-- öffnet, löst keine zweite aus.

CREATE OR REPLACE FUNCTION public.accept_invite(invite_code text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
    v_inviter_id uuid;
    v_accepter_id uuid;
    v_neu boolean;
    v_name text;
BEGIN
    v_accepter_id := auth.uid();
    IF v_accepter_id IS NULL THEN
        RAISE EXCEPTION 'Nicht eingeloggt';
    END IF;

    SELECT created_by INTO v_inviter_id FROM public.invites
    WHERE code = invite_code AND (expires_at IS NULL OR expires_at > now());

    IF v_inviter_id IS NULL THEN
        RAISE EXCEPTION 'Ungültiger oder abgelaufener Einladungslink';
    END IF;

    IF v_inviter_id = v_accepter_id THEN
        RAISE EXCEPTION 'Du kannst deinen eigenen Einladungslink nicht verwenden';
    END IF;

    INSERT INTO public.follows (follower_id, following_id)
    VALUES (v_accepter_id, v_inviter_id)
    ON CONFLICT (follower_id, following_id) DO NOTHING;
    v_neu := FOUND;

    INSERT INTO public.follows (follower_id, following_id)
    VALUES (v_inviter_id, v_accepter_id)
    ON CONFLICT (follower_id, following_id) DO NOTHING;

    IF v_neu THEN
        BEGIN
            SELECT username INTO v_name FROM public.profiles WHERE id = v_accepter_id;
            PERFORM public.push_senden(ARRAY[v_inviter_id], 'Einladung angenommen',
                coalesce(v_name, 'Jemand') || ' hat deine Einladung angenommen. Ihr seid jetzt befreundet.',
                '#/profile/' || v_accepter_id, 'einladung-' || v_accepter_id);
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING 'accept_invite, Mitteilung: %', SQLERRM;
        END;
    END IF;

    RETURN v_inviter_id;
END;
$$;

-- ── Saisonrückblick ──────────────────────────────────────────────────────
--
-- Am 31. Juli um 10 Uhr deutscher Sommerzeit (8 Uhr UTC) an jeden, der in der
-- zu Ende gehenden Spielzeit einen Abend geloggt hat. An dem Tag erscheint der
-- Rückblick auch in der App (siehe isSeasonReviewWindow in src/data/season.js).
--
-- p_heute nur für Tests; der Termin ruft ohne Argument.

CREATE OR REPLACE FUNCTION public.push_saisonrueckblick(p_heute DATE DEFAULT current_date)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    start_jahr INT;
    etikett TEXT;
    r RECORD;
    anzahl INT := 0;
BEGIN
    -- Die zuletzt abgeschlossene Spielzeit, wie lastCompletedSeasonStartYear()
    -- in der App: am 31. Juli zählt die laufende schon als abgeschlossen.
    start_jahr := CASE
        WHEN (extract(month FROM p_heute), extract(day FROM p_heute)) >= (7, 31)
            THEN extract(year FROM p_heute)::int - 1
        ELSE extract(year FROM p_heute)::int - 2
    END;
    etikett := start_jahr || '/' || lpad(((start_jahr + 1) % 100)::text, 2, '0');

    FOR r IN
        SELECT user_id, count(*) AS abende, count(DISTINCT house_id) AS haeuser
        FROM public.visits
        WHERE date BETWEEN make_date(start_jahr, 8, 1) AND make_date(start_jahr + 1, 7, 31)
        GROUP BY user_id
    LOOP
        IF public.push_einmal('saison', r.user_id || ':' || etikett, r.user_id, interval '300 days') THEN
            PERFORM public.push_senden(ARRAY[r.user_id], 'Dein Saisonrückblick ' || etikett,
                r.abende || CASE WHEN r.abende = 1 THEN ' Abend' ELSE ' Abende' END
                    || ' in ' || r.haeuser || CASE WHEN r.haeuser = 1 THEN ' Haus' ELSE ' Häusern' END
                    || ' – so war deine Spielzeit.',
                '#/season', 'saison');
            anzahl := anzahl + 1;
        END IF;
    END LOOP;
    RETURN anzahl;
END;
$$;

REVOKE ALL ON FUNCTION public.push_saisonrueckblick(DATE) FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('push-saisonrueckblick', '0 8 31 7 *', 'SELECT public.push_saisonrueckblick()');
