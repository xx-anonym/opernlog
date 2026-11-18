-- Höchstens 10 Momentaufnahmen je Kalenderjahr (Jonas, 18.11.2026),
-- ausgenommen "Patreon"-Nutzer. Alle, die am 18.11.2026 schon ein Konto
-- hatten, bekommen Patreon von selbst; wer danach kommt, nicht. In der App
-- steht davon nichts – die Nutzer wissen nicht, dass sie die Ausnahme haben.
--
-- Gezählt werden die Fotos, die jemand im laufenden Kalenderjahr (deutsche
-- Zeit) hochgeladen hat und die noch da sind: wer eins löscht, hat wieder
-- Platz. Die Vorschau zählt nicht extra, sie gehört zum Foto.
--
-- Durchgesetzt wird an zwei Stellen, weil die App erst die Dateien hochlädt
-- und dann die Zeile anlegt:
--   - beim Hochladen in den Speicher (Regel "Andenken hochladen"), damit
--     niemand am Zähler vorbei Dateien ablegt,
--   - beim Anlegen der Zeile (Trigger), mit verständlicher Meldung.
--
-- Patreon vergeben oder entziehen geht nur per SQL:
--   INSERT INTO public.patreon (user_id, grund) VALUES ('<uuid>', 'patreon');
--   DELETE FROM public.patreon WHERE user_id = '<uuid>';
--
-- Mehrfaches Ausführen ist gefahrlos – ausgenommen der Bestand: Wer beim
-- erneuten Ausführen schon ein Konto hat, bekäme Patreon. Der INSERT darunter
-- nimmt deshalb nur Konten, die vor dem Stichtag angelegt wurden.

CREATE TABLE IF NOT EXISTS patreon (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    grund   TEXT NOT NULL DEFAULT 'patreon' CHECK (grund IN ('bestand', 'patreon')),
    seit    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Niemand liest oder schreibt die Tabelle über die Schnittstelle; nur die
-- Funktionen unten sehen hinein. Ohne Regel lässt RLS nichts durch.
ALTER TABLE patreon ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON patreon FROM anon, authenticated;

-- Der Bestand: alle Konten bis zum Stichtag (18.11.2026, 23:30 deutscher Zeit).
INSERT INTO public.patreon (user_id, grund, seit)
SELECT id, 'bestand', now() FROM auth.users
WHERE created_at < '2026-11-18 22:30:00+00'
ON CONFLICT (user_id) DO NOTHING;

-- Wie viele Fotos darf diese Person in diesem Jahr noch hochladen?
-- NULL heißt: keine Grenze.
CREATE OR REPLACE FUNCTION public.andenken_frei_fuer(nutzer UUID)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT CASE
        WHEN nutzer IS NULL THEN 0
        WHEN EXISTS (SELECT 1 FROM public.patreon p WHERE p.user_id = nutzer) THEN NULL
        ELSE greatest(0, 10 - (
            SELECT count(*)::int FROM public.andenken a
            WHERE a.user_id = nutzer
              AND a.created_at >= (date_trunc('year', now() AT TIME ZONE 'Europe/Berlin') AT TIME ZONE 'Europe/Berlin')))
    END;
$$;
REVOKE ALL ON FUNCTION public.andenken_frei_fuer(UUID) FROM PUBLIC, anon, authenticated;

-- Für die App: was ist für mich noch frei? Antwort { frei: Zahl | null }.
CREATE OR REPLACE FUNCTION public.andenken_kontingent()
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT json_build_object('frei', public.andenken_frei_fuer((SELECT auth.uid())));
$$;
REVOKE ALL ON FUNCTION public.andenken_kontingent() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.andenken_kontingent() TO authenticated;

-- Die Zeile: zusätzlich zum Trigger "höchstens 6 je Abend".
CREATE OR REPLACE FUNCTION public.andenken_jahresgrenze()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    frei INT;
BEGIN
    -- Zwei Uploads gleichzeitig dürfen nicht beide den letzten Platz nehmen.
    PERFORM pg_advisory_xact_lock(hashtext('andenken_jahresgrenze:' || NEW.user_id::text));
    frei := public.andenken_frei_fuer(NEW.user_id);
    IF frei IS NOT NULL AND frei <= 0 THEN
        RAISE EXCEPTION 'Höchstens 10 Momentaufnahmen im Jahr' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.andenken_jahresgrenze() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS andenken_jahresgrenze ON public.andenken;
CREATE TRIGGER andenken_jahresgrenze BEFORE INSERT ON public.andenken
    FOR EACH ROW EXECUTE FUNCTION public.andenken_jahresgrenze();

-- Der Speicher: hochladen nur in den eigenen Ordner und nur mit freiem Platz.
-- Die Vorschau kommt gleich nach dem Foto, vor der Zeile – solange der Zähler
-- noch nicht voll ist, geht sie also mit durch.
CREATE OR REPLACE FUNCTION public.andenken_platz_frei()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT coalesce(public.andenken_frei_fuer((SELECT auth.uid())) > 0, true);
$$;
REVOKE ALL ON FUNCTION public.andenken_platz_frei() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.andenken_platz_frei() TO authenticated;

DROP POLICY IF EXISTS "Andenken hochladen" ON storage.objects;
CREATE POLICY "Andenken hochladen" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'andenken'
        AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
        AND public.andenken_platz_frei());
