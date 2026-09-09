-- Migration: Bearbeiten von Besuchen/Reviews ermöglichen
--
-- Die Tabelle "visits" hatte RLS-Policies für SELECT, INSERT und DELETE,
-- aber keine für UPDATE. Dadurch wurde jedes Speichern einer bearbeiteten
-- Review von Postgres verworfen (0 betroffene Zeilen) und die Änderung war
-- nach dem Neuladen wieder verschwunden.
--
-- In Supabase im SQL Editor ausführen.

DROP POLICY IF EXISTS "User kann eigene Visits ändern" ON visits;

CREATE POLICY "User kann eigene Visits ändern" ON visits
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
