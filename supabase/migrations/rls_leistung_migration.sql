-- Zugriffsregeln und Indizes, die mit mehr Nutzern langsam würden.
--
-- Supabase meldete (27.09.2026) drei Dinge; am Verhalten ändert sich nichts.
--
--   1. auth.uid() direkt in einer Regel wird für jede Zeile neu ausgewertet.
--      In (SELECT auth.uid()) gefasst, rechnet Postgres den Wert einmal je
--      Abfrage aus. Das Ergebnis ist dasselbe – die Regel sieht dieselbe
--      Person –, nur ohne den Aufruf pro Zeile. ALTER POLICY ändert allein
--      die angegebenen Teile; eine Regel ohne WITH CHECK bleibt ohne.
--
--   2. profiles hatte zwei gleiche INSERT-Regeln. "Nutzer dürfen ihr Profil
--      anlegen" stand in keiner Datei, war also von Hand im Dashboard
--      entstanden; "User kann Profil erstellen" aus schema.sql bleibt.
--
--   3. Zehn Fremdschlüssel ohne Index. Ohne ihn liest Postgres beim Löschen
--      eines Kontos jede dieser Tabellen ganz, und "alle Abende von X" kann
--      keinen Index nehmen.
--
-- Mehrfaches Ausführen ist gefahrlos.

-- 1. auth.uid() einmal je Abfrage

ALTER POLICY "User kann eigene Kommentare löschen" ON comments USING ((SELECT auth.uid()) = user_id);
ALTER POLICY "User kann kommentieren" ON comments WITH CHECK ((SELECT auth.uid()) = user_id);

ALTER POLICY "User kann entfolgen" ON follows USING ((SELECT auth.uid()) = follower_id);
ALTER POLICY "User kann folgen" ON follows WITH CHECK ((SELECT auth.uid()) = follower_id);

ALTER POLICY "Users can view own friend requests" ON friend_requests
    USING ((SELECT auth.uid()) = sender_id OR (SELECT auth.uid()) = receiver_id);

ALTER POLICY "User kann Invites erstellen" ON invites WITH CHECK ((SELECT auth.uid()) = created_by);
ALTER POLICY "User sieht eigene Invites" ON invites USING ((SELECT auth.uid()) = created_by);

ALTER POLICY "User kann liken" ON likes WITH CHECK ((SELECT auth.uid()) = user_id);
ALTER POLICY "User kann unlike" ON likes USING ((SELECT auth.uid()) = user_id);

ALTER POLICY "User kann Listen erstellen" ON lists WITH CHECK ((SELECT auth.uid()) = user_id);
ALTER POLICY "User kann eigene Listen löschen" ON lists USING ((SELECT auth.uid()) = user_id);
ALTER POLICY "User kann eigene Listen ändern" ON lists USING ((SELECT auth.uid()) = user_id);
ALTER POLICY "Öffentliche Listen sind lesbar" ON lists USING (is_public = true OR (SELECT auth.uid()) = user_id);

ALTER POLICY "User kann Profil erstellen" ON profiles WITH CHECK ((SELECT auth.uid()) = id);
ALTER POLICY "User kann eigenes Profil ändern" ON profiles USING ((SELECT auth.uid()) = id);

ALTER POLICY "User kann Markierung entfernen" ON seen_operas USING ((SELECT auth.uid()) = user_id);
ALTER POLICY "User kann als gesehen markieren" ON seen_operas WITH CHECK ((SELECT auth.uid()) = user_id);
ALTER POLICY "User kann eigene Markierungen lesen" ON seen_operas USING ((SELECT auth.uid()) = user_id);

ALTER POLICY "User kann Suggestions erstellen" ON suggestions WITH CHECK ((SELECT auth.uid()) = user_id);
ALTER POLICY "User kann eigene Suggestions lesen" ON suggestions USING ((SELECT auth.uid()) = user_id);

ALTER POLICY "User kann eigene Visits erstellen" ON visits WITH CHECK ((SELECT auth.uid()) = user_id);
ALTER POLICY "User kann eigene Visits löschen" ON visits USING ((SELECT auth.uid()) = user_id);
ALTER POLICY "User kann eigene Visits ändern" ON visits
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

-- 2. Die doppelte Regel

DROP POLICY IF EXISTS "Nutzer dürfen ihr Profil anlegen" ON profiles;

-- 3. Indizes für die Fremdschlüssel

CREATE INDEX IF NOT EXISTS bild_ausschnitte_geaendert_von_idx ON bild_ausschnitte (geaendert_von);
CREATE INDEX IF NOT EXISTS catalog_composers_created_by_idx ON catalog_composers (created_by);
CREATE INDEX IF NOT EXISTS catalog_houses_created_by_idx ON catalog_houses (created_by);
CREATE INDEX IF NOT EXISTS catalog_operas_created_by_idx ON catalog_operas (created_by);
CREATE INDEX IF NOT EXISTS comments_user_id_idx ON comments (user_id);
CREATE INDEX IF NOT EXISTS follows_following_id_idx ON follows (following_id);
CREATE INDEX IF NOT EXISTS friend_requests_receiver_id_idx ON friend_requests (receiver_id);
CREATE INDEX IF NOT EXISTS invites_created_by_idx ON invites (created_by);
CREATE INDEX IF NOT EXISTS lists_user_id_idx ON lists (user_id);
CREATE INDEX IF NOT EXISTS visits_user_id_idx ON visits (user_id);
