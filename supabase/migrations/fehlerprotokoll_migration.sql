-- Fehlerprotokoll: was im Browser schiefgeht, ohne dass es jemand abfängt.
--
-- Bisher erfuhr man von Fehlern nur, wenn Jonas sie selbst bemerkte – gerade
-- die, die nur auf dem iPhone oder nur in der installierten App auftreten.
-- src/fehlerprotokoll.js meldet jetzt jeden nicht abgefangenen Fehler hierher.
--
-- Bewusst ohne Personenbezug: keine Nutzer-Id, keine Adresse mit Kennungen
-- (von "#/profile/<id>" bleibt "profile"), nur ob jemand angemeldet war. Die
-- Kennung des Browsers (geraet) braucht es, um iPhone-Fehler zu erkennen.
--
-- Melden darf jeder – auch wer nicht angemeldet ist, denn gerade beim Start
-- und bei der Anmeldung geht manches schief. Lesen dürfen nur Admins. Die
-- Längen sind begrenzt, und die App schickt je Seitenaufruf höchstens fünf
-- verschiedene Fehler.
--
-- Mehrfaches Ausführen ist gefahrlos.

CREATE TABLE IF NOT EXISTS fehlerprotokoll (
    id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    zeit       TIMESTAMPTZ NOT NULL DEFAULT now(),
    version    TEXT NOT NULL CHECK (length(version) <= 20),
    seite      TEXT NOT NULL CHECK (length(seite) <= 40),
    meldung    TEXT NOT NULL CHECK (length(meldung) <= 500),
    stelle     TEXT NOT NULL DEFAULT '' CHECK (length(stelle) <= 300),
    geraet     TEXT NOT NULL DEFAULT '' CHECK (length(geraet) <= 300),
    angemeldet BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE fehlerprotokoll ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Jeder darf Fehler melden" ON fehlerprotokoll;
CREATE POLICY "Jeder darf Fehler melden" ON fehlerprotokoll FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Nur Admins lesen Fehler" ON fehlerprotokoll;
CREATE POLICY "Nur Admins lesen Fehler" ON fehlerprotokoll FOR SELECT USING (public.ist_admin());

-- Rechte für die Datenschnittstelle ausdrücklich (siehe rls.test.js): melden
-- dürfen alle, lesen nur Angemeldete – und von denen laut Regel nur Admins.
REVOKE ALL ON fehlerprotokoll FROM anon, authenticated;
GRANT INSERT ON fehlerprotokoll TO anon, authenticated;
GRANT SELECT ON fehlerprotokoll TO authenticated;
