-- Bereits gesehene Werke ohne Besuchseintrag
--
-- Für Opern, die man vor OpernLog gesehen hat: kein Datum, kein Haus, keine
-- Bewertung, nur die Tatsache. Damit lassen sich die blinden Flecken
-- verfeinern, ohne das Tagebuch mit erfundenen Daten zu füllen.
--
-- Bewusst eine eigene Tabelle statt eines Besuchs mit leerem Datum: ein Besuch
-- hat Ort, Zeit und Urteil, und all das fehlt hier. Vermischt würden die
-- Statistiken falsch – "12 Abende" muss weiterhin zwölf geloggte Abende
-- bedeuten.
--
-- Zusammengesetzter Primärschlüssel, keine eigene id-Spalte. Das Entfernen
-- läuft deshalb über user_id und opera_id; ein Löschen über eine nicht
-- vorhandene id war in diesem Projekt schon einmal die Ursache dafür, dass
-- sich Likes nicht zurücknehmen ließen.
--
-- Der Zuschnitt der Rechte folgt der suggestions-Tabelle: jeder sieht nur
-- seine eigenen Markierungen. Sollen sie später auch für andere sichtbar sein,
-- ist das eine bewusste Entscheidung und keine Voreinstellung.
--
-- Mehrfaches Ausführen ist gefahrlos.

CREATE TABLE IF NOT EXISTS seen_operas (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  opera_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, opera_id)
);

ALTER TABLE seen_operas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "User kann eigene Markierungen lesen" ON seen_operas;
CREATE POLICY "User kann eigene Markierungen lesen"
ON seen_operas FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "User kann als gesehen markieren" ON seen_operas;
CREATE POLICY "User kann als gesehen markieren"
ON seen_operas FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "User kann Markierung entfernen" ON seen_operas;
CREATE POLICY "User kann Markierung entfernen"
ON seen_operas FOR DELETE USING (auth.uid() = user_id);
