-- Wie voll der Speicher ist – für den Hinweis an Admins auf der Startseite
-- (src/components/SpeicherHinweis.js). Jonas, 1.10.2026: warnen ab 90 %.
--
-- Supabase selbst meldet sich erst, wenn eine Grenze schon überschritten
-- ist. Die Grenzen des Plans (1 GB Dateien, 500 MB Datenbank) stehen in
-- der App, nicht hier: wechselt der Plan, ist das eine Zeile dort.
--
-- SECURITY DEFINER, weil storage.objects jedem nur die eigenen Dateien
-- zeigt. Heraus kommen nur zwei Zahlen, und nur für Admins.
--
-- Mehrfaches Ausführen ist gefahrlos.

CREATE OR REPLACE FUNCTION public.speicher_belegt()
RETURNS TABLE (dateien BIGINT, datenbank BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.ist_admin() THEN
        RAISE EXCEPTION 'Nur Admins';
    END IF;
    RETURN QUERY SELECT
        (SELECT coalesce(sum((o.metadata->>'size')::BIGINT), 0) FROM storage.objects o)::BIGINT,
        pg_database_size(current_database())::BIGINT;
END;
$$;

REVOKE ALL ON FUNCTION public.speicher_belegt() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.speicher_belegt() TO authenticated;
