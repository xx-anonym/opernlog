-- Mitwirkende zu einem Besuch: Dirigent, Regie, Besetzung.
--
-- Rein additiv: es werden drei Spalten angelegt, es wird nichts geändert,
-- verschoben oder gelöscht. Bestehende Besuche bekommen den Standardwert ''
-- und bleiben ansonsten unberührt. Alle drei Felder sind optional.
--
-- Die Spalte heißt cast_list und nicht cast: CAST ist in PostgreSQL ein
-- reserviertes Schlüsselwort und müsste sonst überall in Anführungszeichen
-- stehen.
--
-- Mehrfaches Ausführen ist gefahrlos (IF NOT EXISTS).

ALTER TABLE visits ADD COLUMN IF NOT EXISTS conductor TEXT DEFAULT '';
ALTER TABLE visits ADD COLUMN IF NOT EXISTS director  TEXT DEFAULT '';
ALTER TABLE visits ADD COLUMN IF NOT EXISTS cast_list TEXT DEFAULT '';
