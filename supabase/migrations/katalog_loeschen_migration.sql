-- Was hängt an einem Katalogeintrag?
--
-- Vor dem Löschen muss der Admin wissen, ob jemand dieses Werk schon geloggt
-- oder als gesehen markiert hat. Nur sehen kann er das nicht: seen_operas
-- zeigt jedem ausschließlich die eigenen Markierungen, und private Listen
-- gehören ohnehin niemandem sonst.
--
-- Deshalb zählt die Datenbank. Herausgegeben werden ausschließlich Zahlen,
-- keine Namen und keine Nutzerkennungen – wer ein Werk gesehen hat, geht den
-- Admin so wenig an wie jeden anderen.
--
-- Gelöscht wird über die gewöhnliche DELETE-Regel aus
-- katalog_schreibrechte_migration.sql; eine eigene Funktion braucht es dafür
-- nicht. Diese hier liefert nur die Entscheidungsgrundlage.

CREATE OR REPLACE FUNCTION public.katalog_verweise(p_art TEXT, p_id TEXT)
RETURNS TABLE (besuche BIGINT, markierungen BIGINT, listen BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Nur für Admins: die Zahl der Besuche eines Werks ist zwar aus visits
    -- ohnehin ablesbar, die Zahl der Markierungen aber nicht.
    IF NOT public.ist_admin() THEN
        RAISE EXCEPTION 'Nur Admins';
    END IF;

    IF p_art = 'werk' THEN
        RETURN QUERY SELECT
            (SELECT count(*) FROM public.visits WHERE opera_id = p_id),
            (SELECT count(*) FROM public.seen_operas WHERE opera_id = p_id),
            (SELECT count(*) FROM public.lists WHERE p_id = ANY(items));
    ELSIF p_art = 'haus' THEN
        RETURN QUERY SELECT
            (SELECT count(*) FROM public.visits WHERE house_id = p_id),
            0::BIGINT,
            (SELECT count(*) FROM public.lists WHERE p_id = ANY(items));
    ELSE
        RAISE EXCEPTION 'Unbekannte Art: %', p_art;
    END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.katalog_verweise(TEXT, TEXT) FROM anon;
