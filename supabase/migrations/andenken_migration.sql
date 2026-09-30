-- Andenken: Fotos zu einem Abend – Programmheft, Karte, Schlussapplaus.
--
-- Je Foto wählbar: privat (Standard) oder für Freunde. Die Spalte heißt
-- "oeffentlich", bedeutet aber nur "für Freunde sichtbar" – niemals für
-- Dritte und nie ohne Anmeldung (Jonas, 1.10.2026). Freunde sind, wer sich
-- gegenseitig folgt; so legt accept_friend_request() sie an. Einseitiges
-- Folgen reicht nicht: das kann jeder von sich aus eintragen. Standard ist
-- privat, weil eine fotografierte Karte oft Name, Platz oder Barcode trägt.
-- Höchstens sechs je Abend.
--
-- Die Dateien liegen im privaten Bucket "andenken" unter
-- <user_id>/<visit_id>/<id>.jpg, dazu eine kleine Vorschau <id>-klein.jpg
-- für Feed und Mosaik. Die App verkleinert vor dem Hochladen (höchstens
-- 1600 px bzw. 720 px, JPEG) und schreibt das Bild dabei neu – Metadaten wie
-- Aufnahmeort und -zeit fallen weg. Angezeigt wird über signierte Adressen,
-- die der Speicher nur ausgibt, wenn die Regel unten das Lesen erlaubt.
--
-- Löschen: Supabase verbietet, Dateien per SQL zu löschen (Trigger
-- protect_objects_delete); es geht nur über die Speicher-Schnittstelle. Die
-- App räumt deshalb selbst auf – beim Entfernen eines Fotos, eines Abends
-- und vor dem Löschen des Kontos (src/store/supabase.js,
-- andenkenDateienLoeschen). Die Zeilen hier verschwinden mit dem Abend.
--
-- Mehrfaches Ausführen ist gefahrlos.

CREATE TABLE IF NOT EXISTS andenken (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    visit_id    UUID NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
    pfad        TEXT NOT NULL UNIQUE
                CHECK (pfad ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'),
    oeffentlich BOOLEAN NOT NULL DEFAULT false,
    breite      INT CHECK (breite BETWEEN 1 AND 4000),
    hoehe       INT CHECK (hoehe BETWEEN 1 AND 4000),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Die Vorschau liegt neben dem Foto; ihr Name folgt aus dem Pfad, damit sie
-- nirgends anders hinzeigen kann. Fotos von vor dem 1.10.2026 haben keine.
ALTER TABLE andenken ADD COLUMN IF NOT EXISTS vorschau TEXT UNIQUE
    CHECK (vorschau = regexp_replace(pfad, '\.jpg$', '-klein.jpg'));

CREATE INDEX IF NOT EXISTS andenken_visit_idx ON andenken (visit_id, created_at);
CREATE INDEX IF NOT EXISTS andenken_user_idx ON andenken (user_id);

ALTER TABLE andenken ENABLE ROW LEVEL SECURITY;

-- Eigene alle; fremde nur, wenn freigegeben und man befreundet ist – in
-- beide Richtungen gefolgt. Ohne Anmeldung nichts (kein anon, siehe GRANT).
DROP POLICY IF EXISTS "Andenken lesen" ON andenken;
CREATE POLICY "Andenken lesen" ON andenken FOR SELECT TO authenticated
    USING (
        (SELECT auth.uid()) = user_id
        OR (oeffentlich
            AND EXISTS (SELECT 1 FROM follows f
                        WHERE f.follower_id = andenken.user_id AND f.following_id = (SELECT auth.uid()))
            AND EXISTS (SELECT 1 FROM follows f
                        WHERE f.follower_id = (SELECT auth.uid()) AND f.following_id = andenken.user_id)));

-- Nur zu eigenen Abenden, und der Pfad muss im eigenen Ordner unter diesem
-- Abend liegen – sonst ließe sich eine fremde Datei als eigenes Andenken
-- ausgeben.
DROP POLICY IF EXISTS "Andenken anlegen" ON andenken;
CREATE POLICY "Andenken anlegen" ON andenken FOR INSERT
    WITH CHECK (
        (SELECT auth.uid()) = user_id
        AND EXISTS (SELECT 1 FROM visits v WHERE v.id = visit_id AND v.user_id = (SELECT auth.uid()))
        AND split_part(pfad, '/', 1) = (SELECT auth.uid())::text
        AND split_part(pfad, '/', 2) = visit_id::text);

-- Ändern lässt sich nur "öffentlich" (siehe GRANT unten).
DROP POLICY IF EXISTS "Andenken ändern" ON andenken;
CREATE POLICY "Andenken ändern" ON andenken FOR UPDATE
    USING ((SELECT auth.uid()) = user_id)
    WITH CHECK ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Andenken löschen" ON andenken;
CREATE POLICY "Andenken löschen" ON andenken FOR DELETE
    USING ((SELECT auth.uid()) = user_id);

-- Höchstens sechs je Abend. Als Trigger statt in der Regel: so gibt es eine
-- verständliche Meldung statt "violates row-level security policy".
CREATE OR REPLACE FUNCTION public.andenken_hoechstens_sechs()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF (SELECT count(*) FROM public.andenken WHERE visit_id = NEW.visit_id) >= 6 THEN
        RAISE EXCEPTION 'Höchstens 6 Momentaufnahmen je Abend' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS andenken_hoechstens_sechs ON andenken;
CREATE TRIGGER andenken_hoechstens_sechs BEFORE INSERT ON andenken
    FOR EACH ROW EXECUTE FUNCTION public.andenken_hoechstens_sechs();

REVOKE ALL ON andenken FROM anon, authenticated;
GRANT SELECT ON andenken TO authenticated;
GRANT INSERT, DELETE ON andenken TO authenticated;
GRANT UPDATE (oeffentlich) ON andenken TO authenticated;

-- ── Speicher ─────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('andenken', 'andenken', false, 2097152, ARRAY['image/jpeg'])
ON CONFLICT (id) DO UPDATE
    SET public = false, file_size_limit = 2097152, allowed_mime_types = ARRAY['image/jpeg'];

DROP POLICY IF EXISTS "Andenken hochladen" ON storage.objects;
CREATE POLICY "Andenken hochladen" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'andenken' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);

-- Ansehen: die eigenen, und Foto oder Vorschau einer Zeile, die man lesen
-- darf. Die Abfrage auf public.andenken läuft selbst unter der Regel "Andenken
-- lesen" – sie findet also nur Zeilen von Freunden, die freigegeben sind. So
-- steht die Freundschaftsbedingung an einer Stelle.
DROP POLICY IF EXISTS "Andenken ansehen" ON storage.objects;
CREATE POLICY "Andenken ansehen" ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'andenken' AND (
        (storage.foldername(name))[1] = (SELECT auth.uid())::text
        OR EXISTS (SELECT 1 FROM public.andenken a WHERE a.pfad = objects.name OR a.vorschau = objects.name)));

DROP POLICY IF EXISTS "Andenken wegräumen" ON storage.objects;
CREATE POLICY "Andenken wegräumen" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'andenken' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text);
