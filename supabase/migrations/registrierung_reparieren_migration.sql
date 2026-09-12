-- Die Registrierung war kaputt. Drei Fehler auf einmal:
--
--   1. "Database error saving new user". Der Trigger on_auth_user_created rief
--      handle_new_user(), und die Funktion fügte nur die Id in profiles ein.
--      profiles.username ist aber NOT NULL ohne Vorgabewert. Der INSERT schlug
--      fehl, der Trigger riss das Anlegen in auth.users mit, und die App bekam
--      nur die nichtssagende Meldung von Supabase zurück.
--
--   2. "new row violates row-level security policy for table profiles".
--      Verlangt das Projekt eine E-Mail-Bestätigung, gibt signUp() zwar einen
--      Nutzer zurück, aber KEINE Sitzung. Das anschließende upsert der App lief
--      damit als anon, und die Regel "auth.uid() = id" ließ es nicht durch.
--
--   3. Benutzername und Profilbild, die man beim Registrieren aussucht, waren
--      nach der Bestätigung wieder weg – die Profileinrichtung fragte beides
--      erneut ab. Sie standen nur in dem upsert, das nie ankam.
--
-- Alle drei lösen sich hier: der Trigger läuft als SECURITY DEFINER, braucht
-- keine Sitzung und bekommt Name und Bild über raw_user_meta_data, wohin
-- signUp() sie ohnehin schreibt.
--
-- profile_complete wird nur gesetzt, wenn wirklich ein Wunschname mitkam und
-- er auch frei war. Wer sich über Google anmeldet, schickt keinen – der soll
-- weiterhin durch die Profileinrichtung.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    gewaehlt     TEXT;
    name         TEXT;
    bild         TEXT;
    initialen    TEXT;
    vollstaendig BOOLEAN;
BEGIN
    gewaehlt := NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), '');
    bild     := COALESCE(NULLIF(TRIM(NEW.raw_user_meta_data->>'avatar_icon'), ''), '');

    name := COALESCE(
        gewaehlt,
        NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
        NULLIF(SPLIT_PART(COALESCE(NEW.email, ''), '@', 1), ''),
        'nutzer'
    );

    -- Nur wer den Namen selbst ausgesucht hat, ist fertig eingerichtet.
    vollstaendig := gewaehlt IS NOT NULL;

    -- Schon vergeben? Dann die Id anhängen, damit der UNIQUE-Index auf
    -- username nicht das nächste Hindernis wird.
    IF EXISTS (SELECT 1 FROM public.profiles WHERE username = name) THEN
        name := name || '-' || LEFT(REPLACE(NEW.id::TEXT, '-', ''), 6);
        -- Der Wunschname war weg; dann soll die Einrichtung noch einmal fragen.
        vollstaendig := FALSE;
    END IF;

    -- Initialen wie in der App: die Anfangsbuchstaben der Wörter, höchstens
    -- zwei, groß geschrieben.
    SELECT UPPER(LEFT(STRING_AGG(LEFT(teil, 1), '' ORDER BY nr), 2))
      INTO initialen
      FROM UNNEST(STRING_TO_ARRAY(name, ' ')) WITH ORDINALITY AS t(teil, nr)
     WHERE teil <> '';

    INSERT INTO public.profiles (id, username, avatar_initials, avatar_icon, profile_complete)
    VALUES (NEW.id, name, COALESCE(initialen, 'OF'), bild, vollstaendig)
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Letzte Sicherung: die Registrierung darf hieran nicht scheitern. Ein
    -- Konto ohne Profilzeile ist ein kleiner Schaden, ein Konto, das gar nicht
    -- erst entsteht, ein großer.
    RAISE WARNING 'handle_new_user: %', SQLERRM;
    RETURN NEW;
END;
$$;
