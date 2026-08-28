-- Zähler für offene Vorschläge
--
-- Die Tabelle suggestions ist bewusst eng abgesichert: jeder sieht nur seine
-- eigenen Vorschläge, eine Admin-Leseregel gibt es nicht. Damit kann aber auch
-- keine Benachrichtigung von außen feststellen, dass etwas eingegangen ist.
--
-- Diese Funktion liefert deshalb ausschließlich Anzahlen je Art – keine Namen,
-- keine Nutzerkennungen, keine Inhalte. Mehr braucht ein Hinweis nicht: er
-- soll nur dazu führen, dass jemand nachsieht. Die Vorschläge selbst bleiben
-- so geschützt wie bisher.
--
-- SECURITY DEFINER, weil die Funktion sonst dieselbe Einschränkung wie der
-- Aufrufer hätte und immer 0 zurückgäbe. search_path wird fest gesetzt – ohne
-- das könnte ein untergeschobener Suchpfad bestimmen, welche Tabelle gemeint
-- ist (siehe security_definer_search_path_migration.sql).
--
-- Mehrfaches Ausführen ist gefahrlos.

CREATE OR REPLACE FUNCTION public.pending_suggestion_counts()
RETURNS TABLE (suggestion_type text, total bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.type, count(*)::bigint
  FROM public.suggestions s
  WHERE s.status = 'pending'
  GROUP BY s.type
  ORDER BY s.type;
$$;

-- Ausführbar für alle: die Rückgabe ist eine reine Zahl je Art.
GRANT EXECUTE ON FUNCTION public.pending_suggestion_counts() TO anon, authenticated;
