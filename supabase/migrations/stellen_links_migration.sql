-- Links zu Aufnahmen für die "bekannten Stellen" eines Werks (Jonas,
-- 19.11.2026): ein Admin hinterlegt zu einer Stelle – etwa „Vissi d’arte“ –
-- einen Link zu einer legendären Aufnahme. Wer in der App auf die Stelle
-- tippt, öffnet diesen Link.
--
-- Die Stellen selbst stehen als Dateien im Repo (daten/werke/<id>.json);
-- hier steht nur der Link, verknüpft über Werk und Titel der Stelle. Wird
-- ein Titel in der Datei geändert, verliert die Stelle ihren Link.
--
-- Lesen darf jeder, schreiben nur, wer in admins steht – wie bei den
-- Bildausschnitten. Nur https-Adressen.
--
-- Mehrfaches Ausführen ist gefahrlos.

CREATE TABLE IF NOT EXISTS stellen_links (
    werk_id       TEXT NOT NULL CHECK (char_length(werk_id) BETWEEN 1 AND 80),
    stelle        TEXT NOT NULL CHECK (char_length(stelle) BETWEEN 1 AND 120),
    url           TEXT NOT NULL CHECK (char_length(url) <= 500 AND url ~ '^https://[^[:space:]<>"]+$'),
    geaendert_von UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    geaendert     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (werk_id, stelle)
);

ALTER TABLE stellen_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Stellen-Links sind öffentlich lesbar" ON stellen_links;
CREATE POLICY "Stellen-Links sind öffentlich lesbar" ON stellen_links
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Nur Admins legen Stellen-Links an" ON stellen_links;
CREATE POLICY "Nur Admins legen Stellen-Links an" ON stellen_links
    FOR INSERT WITH CHECK (public.ist_admin());

DROP POLICY IF EXISTS "Nur Admins ändern Stellen-Links" ON stellen_links;
CREATE POLICY "Nur Admins ändern Stellen-Links" ON stellen_links
    FOR UPDATE USING (public.ist_admin()) WITH CHECK (public.ist_admin());

DROP POLICY IF EXISTS "Nur Admins löschen Stellen-Links" ON stellen_links;
CREATE POLICY "Nur Admins löschen Stellen-Links" ON stellen_links
    FOR DELETE USING (public.ist_admin());

REVOKE ALL ON stellen_links FROM anon, authenticated;
GRANT SELECT ON stellen_links TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON stellen_links TO authenticated;
