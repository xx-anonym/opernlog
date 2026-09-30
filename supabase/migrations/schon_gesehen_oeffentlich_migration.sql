-- "Schon gesehen" ist ab jetzt öffentlich, wie das Tagebuch.
--
-- Bisher las jeder nur seine eigenen Markierungen (seen_operas_migration.sql).
-- Mit den Sammlungen sieht man den Stand von Freunden; ohne ihre Markierungen
-- stand dort weniger, als sie selbst sehen. Jonas' Entscheidung am 30.9.2026:
-- nicht länger privat. Betroffen waren zu dem Zeitpunkt nur seine eigenen
-- 14 Markierungen. Die Datenschutzseite nennt sie seitdem unter dem, was
-- jeder sehen kann.
--
-- Schreiben bleibt wie gehabt: markieren und entfernen nur die eigenen.
--
-- Mehrfaches Ausführen ist gefahrlos.

DROP POLICY IF EXISTS "User kann eigene Markierungen lesen" ON seen_operas;
DROP POLICY IF EXISTS "Markierungen lesen: alle" ON seen_operas;
CREATE POLICY "Markierungen lesen: alle" ON seen_operas FOR SELECT USING (true);
