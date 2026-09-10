-- Der Katalog bekommt eine zweite Quelle: drei Tabellen, in die der Admin
-- Werke, Häuser und Komponisten schreiben kann, ohne dass jemand eine Datei
-- im Repo anfassen muss.
--
-- Beim Start der App werden sie unter src/data/*.js gemischt (siehe
-- src/data/katalogZusatz.js). Die Spalten heißen deshalb genau wie die Felder
-- dort, nur in Unterstrichschreibweise: yearComposed wird year_composed.
--
-- ── Warum die Adminkennung NICHT in profiles steht ────────────────────────
--
-- Naheliegend wäre eine Spalte is_admin in profiles gewesen. Das wäre ein
-- offenes Scheunentor: die Regel "User kann eigenes Profil ändern" erlaubt
-- UPDATE auf die ganze Zeile, ohne Einschränkung auf einzelne Spalten. Jeder
-- Nutzer hätte sich selbst zum Admin machen können, mit einem einzigen
-- Aufruf gegen die öffentliche API.
--
-- Deshalb eine eigene Tabelle, die NIEMAND über die API beschreiben kann: sie
-- hat RLS an und schlicht keine Regel für INSERT, UPDATE oder DELETE. Ohne
-- Regel ist der Vorgang verboten. Admins trägt man im Dashboard ein oder mit
-- dem service-role-Schlüssel, also nur dort, wo man ohnehin alles darf.

-- ── Wer darf schreiben ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admins (
    user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    notiz      TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- Nur die eigene Zeile: die App fragt "bin ich Admin?", nicht "wer ist Admin?".
-- Damit steht nirgends öffentlich, welches Konto erhöhte Rechte hat.
DROP POLICY IF EXISTS "User sieht nur den eigenen Admineintrag" ON admins;
CREATE POLICY "User sieht nur den eigenen Admineintrag" ON admins
    FOR SELECT USING ((SELECT auth.uid()) = user_id);

-- Absichtlich keine Regel für INSERT, UPDATE, DELETE. Siehe oben.

CREATE OR REPLACE FUNCTION public.ist_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.admins WHERE user_id = (SELECT auth.uid())
    );
$$;

-- ── Die drei Katalogtabellen ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS catalog_operas (
    id            TEXT PRIMARY KEY,
    title         TEXT NOT NULL,
    composer      TEXT NOT NULL,
    year_composed INTEGER NOT NULL,
    language      TEXT NOT NULL,
    acts          INTEGER NOT NULL,
    genre         TEXT NOT NULL,
    librettist    TEXT NOT NULL,
    description   TEXT NOT NULL,
    image         TEXT NOT NULL,
    created_by    UUID REFERENCES auth.users(id),
    created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS catalog_houses (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    city        TEXT NOT NULL,
    state       TEXT NOT NULL,
    lat         DOUBLE PRECISION NOT NULL,
    lon         DOUBLE PRECISION NOT NULL,
    capacity    INTEGER NOT NULL,
    founded     INTEGER NOT NULL,
    description TEXT NOT NULL,
    color       TEXT NOT NULL,
    image_url   TEXT NOT NULL,
    created_by  UUID REFERENCES auth.users(id),
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS catalog_composers (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    kurz         TEXT NOT NULL,
    bio          TEXT NOT NULL,
    bild         TEXT NOT NULL,
    bild_lizenz  TEXT NOT NULL,
    bild_urheber TEXT NOT NULL,
    wikipedia    TEXT NOT NULL,
    created_by   UUID REFERENCES auth.users(id),
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE catalog_operas ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_houses ENABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_composers ENABLE ROW LEVEL SECURITY;

-- Lesen darf jeder, auch ohne Anmeldung: der Katalog ist der Inhalt der App,
-- und die Werkliste steht auch Besuchern offen. Genau wie visits.
--
-- Schreiben darf nur, wer in admins steht.
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['catalog_operas', 'catalog_houses', 'catalog_composers']
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Katalog ist öffentlich lesbar" ON %I', t);
        EXECUTE format('CREATE POLICY "Katalog ist öffentlich lesbar" ON %I FOR SELECT USING (true)', t);

        EXECUTE format('DROP POLICY IF EXISTS "Nur Admins legen an" ON %I', t);
        EXECUTE format('CREATE POLICY "Nur Admins legen an" ON %I FOR INSERT WITH CHECK (public.ist_admin())', t);

        EXECUTE format('DROP POLICY IF EXISTS "Nur Admins ändern" ON %I', t);
        EXECUTE format('CREATE POLICY "Nur Admins ändern" ON %I FOR UPDATE USING (public.ist_admin())', t);

        EXECUTE format('DROP POLICY IF EXISTS "Nur Admins löschen" ON %I', t);
        EXECUTE format('CREATE POLICY "Nur Admins löschen" ON %I FOR DELETE USING (public.ist_admin())', t);
    END LOOP;
END $$;

-- Nachschlagen beim Zusammenmischen und beim Prüflauf.
CREATE INDEX IF NOT EXISTS idx_catalog_operas_composer ON catalog_operas (composer);
