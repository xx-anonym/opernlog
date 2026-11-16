-- Andere Titel eines Werks, das der Admin in der App anlegt (16.11.2026).
--
-- Der Spielplan-Lauf (tests/werkzeug/spielplaene-lesen.mjs) findet ein Werk
-- nur unter den Titeln, die er kennt. Für die Werke im Repo stehen weitere
-- Titel in ANDERE_TITEL im Werkzeug. Für Werke aus dem Formular gab es keinen
-- Platz dafür: Genf und Lausanne spielen unter französischem Titel, deutsche
-- Häuser oft unter deutschem, und der Lauf übersah das Werk dort. Jetzt
-- trägt der Admin diese Titel im Formular ein, einen je Zeile.
--
-- Leer heißt: nur der Haupttitel. Lesbar wie die übrigen Spalten
-- (catalog_operas ist für alle lesbar), schreibbar nur über die bestehende
-- INSERT-Regel für Admins.

ALTER TABLE catalog_operas ADD COLUMN IF NOT EXISTS andere_titel text[] NOT NULL DEFAULT '{}';
