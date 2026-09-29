-- Bildausschnitte: welcher Teil eines Katalogbilds zu sehen ist.
--
-- Die Bilder füllen ihre Fläche ganz aus (background-size: cover). Was nicht
-- passt, wird abgeschnitten – bisher immer gleich viel links wie rechts, oben
-- wie unten. Bei einem Querformat im Kopf einer Werkseite fällt so oft genau
-- das Gesicht oder die Bühne weg, um die es geht.
--
-- Ein Admin kann auf der Seite eines Werks oder Hauses den Ausschnitt
-- verschieben. Gespeichert wird der Bildpunkt als Prozentwerte, so wie CSS
-- ihn in background-position versteht: 0 0 ist oben links, 50 50 die Mitte.
-- Er gilt überall, wo das Bild erscheint – Kopf, Karten, Listen.
--
-- Eine eigene Tabelle statt einer Spalte in catalog_operas und
-- catalog_houses: die meisten Werke und Häuser stehen als Datei im Repo und
-- haben dort gar keine Zeile. Die Kennung ist die aus dem Katalog, egal aus
-- welcher Quelle der Eintrag stammt. Fehlt eine Zeile, bleibt es die Mitte.
--
-- Mehrfaches Ausführen ist gefahrlos.

CREATE TABLE IF NOT EXISTS bild_ausschnitte (
    art           TEXT NOT NULL CHECK (art IN ('werk', 'haus')),
    id            TEXT NOT NULL,
    x             REAL NOT NULL CHECK (x >= 0 AND x <= 100),
    y             REAL NOT NULL CHECK (y >= 0 AND y <= 100),
    geaendert_von UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
    geaendert     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (art, id)
);

ALTER TABLE bild_ausschnitte ENABLE ROW LEVEL SECURITY;

-- Lesen darf jeder, auch ohne Anmeldung – der Ausschnitt gehört zum Bild wie
-- das Bild zum Katalog. Schreiben nur, wer in admins steht; wie beim Katalog.
DROP POLICY IF EXISTS "Bildausschnitte sind öffentlich lesbar" ON bild_ausschnitte;
CREATE POLICY "Bildausschnitte sind öffentlich lesbar" ON bild_ausschnitte
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Nur Admins legen Ausschnitte an" ON bild_ausschnitte;
CREATE POLICY "Nur Admins legen Ausschnitte an" ON bild_ausschnitte
    FOR INSERT WITH CHECK (public.ist_admin());

DROP POLICY IF EXISTS "Nur Admins ändern Ausschnitte" ON bild_ausschnitte;
CREATE POLICY "Nur Admins ändern Ausschnitte" ON bild_ausschnitte
    FOR UPDATE USING (public.ist_admin()) WITH CHECK (public.ist_admin());

DROP POLICY IF EXISTS "Nur Admins löschen Ausschnitte" ON bild_ausschnitte;
CREATE POLICY "Nur Admins löschen Ausschnitte" ON bild_ausschnitte
    FOR DELETE USING (public.ist_admin());

-- Ab dem 30.10.2026 bekommen neue Tabellen keine Rechte mehr von selbst.
-- Die Regeln oben entscheiden, wer wirklich darf; ohne GRANT käme niemand
-- bis zu ihnen. Bis dahin gibt Supabase jeder neuen Tabelle noch alles –
-- auch anon das Schreiben. Das REVOKE setzt auf genau das zurück, was hier
-- gebraucht wird.
REVOKE ALL ON bild_ausschnitte FROM anon, authenticated;
GRANT SELECT ON bild_ausschnitte TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON bild_ausschnitte TO authenticated;
