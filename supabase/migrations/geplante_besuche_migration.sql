-- Geplante Besuche: Abende, für die man Karten hat oder die man sich
-- vorgemerkt hat.
--
-- Vorgemerkt wird aus dem Spielplan ("Läuft demnächst" → Termin wählen).
-- Die Startseite zeigt die nächsten; ist ein Abend vorbei, fragt sie, wie er
-- war, und führt ins vorausgefüllte Formular. Nach dem Loggen verschwindet
-- der Plan.
--
-- Privat, anders als das Tagebuch: wann jemand in welcher Stadt im Theater
-- sitzt – und also nicht zu Hause ist –, gehört nicht in eine öffentliche
-- Liste. Lesen, anlegen und löschen nur die eigene Zeile; ändern gibt es
-- nicht, ein anderer Termin ist ein anderer Plan.
--
-- Mit dem Konto verschwinden die Pläne (ON DELETE CASCADE).
--
-- Mehrfaches Ausführen ist gefahrlos.

CREATE TABLE IF NOT EXISTS geplante_besuche (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    opera_id   TEXT NOT NULL CHECK (length(opera_id) BETWEEN 1 AND 100),
    house_id   TEXT NOT NULL CHECK (length(house_id) BETWEEN 1 AND 100),
    datum      DATE NOT NULL,
    zeit       TEXT CHECK (zeit IS NULL OR zeit ~ '^([01][0-9]|2[0-3]):[0-5][0-9](-([01][0-9]|2[0-3]):[0-5][0-9])?$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, opera_id, house_id, datum)
);

CREATE INDEX IF NOT EXISTS geplante_besuche_user_datum_idx ON geplante_besuche (user_id, datum);

ALTER TABLE geplante_besuche ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Eigene geplante Besuche lesen" ON geplante_besuche;
CREATE POLICY "Eigene geplante Besuche lesen" ON geplante_besuche FOR SELECT
    USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Eigene geplante Besuche anlegen" ON geplante_besuche;
CREATE POLICY "Eigene geplante Besuche anlegen" ON geplante_besuche FOR INSERT
    WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Eigene geplante Besuche löschen" ON geplante_besuche;
CREATE POLICY "Eigene geplante Besuche löschen" ON geplante_besuche FOR DELETE
    USING ((SELECT auth.uid()) = user_id);

-- Rechte ausdrücklich (siehe rls.test.js): nur Angemeldete, nur lesen,
-- anlegen und löschen.
REVOKE ALL ON geplante_besuche FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON geplante_besuche TO authenticated;
