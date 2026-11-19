-- Handlung, bekannte Stellen und Wissenswertes für Werke, die der Admin in
-- der App anlegt (Jonas, 19.11.2026).
--
-- Für die Werke im Repo stehen diese Texte in daten/werke/<id>.json. Ein Werk
-- aus dem Formular hat keine Datei; sein Text kommt deshalb in diese Spalte,
-- in derselben Form (siehe src/data/werkTexte.js). Das Formular prüft ihn mit
-- werkTextFehler, der tägliche Prüflauf über die Datenbank noch einmal.
-- Die Datenbank selbst achtet nur darauf, dass es ein Objekt von vernünftiger
-- Größe ist.
--
-- NULL heißt: kein Text. Lesbar wie die übrigen Spalten (catalog_operas ist
-- für alle lesbar), schreibbar nur über die bestehende INSERT-Regel für
-- Admins. Neue Spalten erben die Rechte der Tabelle.
--
-- Mehrfaches Ausführen ist gefahrlos.

ALTER TABLE catalog_operas ADD COLUMN IF NOT EXISTS werk_text jsonb;

ALTER TABLE catalog_operas DROP CONSTRAINT IF EXISTS catalog_operas_werk_text_form;
ALTER TABLE catalog_operas ADD CONSTRAINT catalog_operas_werk_text_form
    CHECK (werk_text IS NULL OR (jsonb_typeof(werk_text) = 'object' AND pg_column_size(werk_text) <= 20000));
