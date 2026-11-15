-- Die Spielplan-Seite eines Hauses, das der Admin in der App anlegt
-- (16.11.2026).
--
-- Der monatliche Spielplan-Lauf (.github/workflows/spielplan-monatlich.yml,
-- tests/werkzeug/spielplaene-lesen.mjs) liest ein Haus nur, wenn er weiß,
-- wo dessen Spielplan steht. Für die Häuser im Repo steht das in
-- tests/werkzeug/spielplan-quellen.json. Für Häuser aus dem Formular stand es
-- nirgends, und sie mussten von Hand dort nachgetragen werden. Jetzt gibt der
-- Admin die Seite im Formular an, und der nächste Lauf liest das Haus mit.
-- Steht das Haus doch in spielplan-quellen.json, gilt die Datei – dort
-- können Feinheiten stehen (Spielstätte, Selektoren), die ein Feld nicht hat.
--
-- Leer heißt: keine Seite angegeben, der Lauf übergeht das Haus.
-- Lesbar wie die übrigen Spalten (catalog_houses ist für alle lesbar),
-- schreibbar nur über die bestehende INSERT-Regel für Admins.

ALTER TABLE catalog_houses ADD COLUMN IF NOT EXISTS spielplan_seite text NOT NULL DEFAULT '';
