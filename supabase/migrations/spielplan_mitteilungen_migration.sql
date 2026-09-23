-- Mitteilungen zur Wunschliste: „Neu im Spielplan“.
--
-- Steht ein Werk der Wunschliste neu im Spielplan eines Hauses, bekommt man
-- eine Mitteilung – eine je Person und Lauf, mit allen neuen Häusern darin.
--
-- Der Spielplan liegt nicht in der Datenbank, sondern als Datei im Repo
-- (src/data/spielplan.js, dazu daten/spielplan.json für hier). Der Weg:
--
--   1. Jeden Morgen um 7 Uhr UTC holt spielplan_holen() über pg_net die
--      Datei https://opernlog.vercel.app/daten/spielplan.json.
--   2. Fünf Minuten später vergleicht spielplan_abgleichen() sie mit
--      spielplan_paare, den Paaren aus Werk und Haus, die schon bekannt sind
--      und noch Termine vor sich haben. Was neu ist und auf einer
--      Wunschliste steht, wird gemeldet; danach ist es bekannt.
--
-- Der erste Abgleich meldet nichts: die Tabelle ist leer, alles wäre neu.
-- Er legt nur den Grundstock an.
--
-- Mehrfaches Ausführen ist gefahrlos.

-- ── Tabellen ─────────────────────────────────────────────────────────────
--
-- Nur die Funktionen hier lesen und schreiben sie; niemand sonst braucht sie.

CREATE TABLE IF NOT EXISTS spielplan_paare (
    werk TEXT NOT NULL,
    haus TEXT NOT NULL,
    stand DATE,
    bekannt_seit TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (werk, haus)
);
ALTER TABLE spielplan_paare ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON spielplan_paare FROM anon, authenticated;

-- Die Kennungen der Abrufe über pg_net, bis ihre Antwort verarbeitet ist.
CREATE TABLE IF NOT EXISTS spielplan_abruf (
    id BIGINT PRIMARY KEY,
    angelegt TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE spielplan_abruf ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON spielplan_abruf FROM anon, authenticated;

-- ── Abruf ─────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.spielplan_holen()
RETURNS BIGINT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    abruf BIGINT;
BEGIN
    DELETE FROM public.spielplan_abruf WHERE angelegt < now() - interval '2 days';
    abruf := net.http_get(
        url := 'https://opernlog.vercel.app/daten/spielplan.json',
        timeout_milliseconds := 20000);
    INSERT INTO public.spielplan_abruf (id) VALUES (abruf);
    RETURN abruf;
END;
$$;

-- ── Abgleich ──────────────────────────────────────────────────────────────
--
-- p_daten: ohne, die jüngste erfolgreiche Antwort eines Abrufs. Mit, genau
-- diese Daten – für Tests.
-- p_nur_zeigen: nichts senden, nichts speichern, nur zurückgeben, wer welche
-- Mitteilung bekäme.

CREATE OR REPLACE FUNCTION public.spielplan_abgleichen(p_daten JSONB DEFAULT NULL, p_nur_zeigen BOOLEAN DEFAULT false)
RETURNS TABLE (empfaenger UUID, betreff TEXT, nachricht TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    daten JSONB := p_daten;
    abruf BIGINT;
    erster_lauf BOOLEAN;
    monate TEXT[] := ARRAY['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
                           'August', 'September', 'Oktober', 'November', 'Dezember'];
    r RECORD;
BEGIN
    IF daten IS NULL THEN
        SELECT a.id, antwort.content::jsonb INTO abruf, daten
        FROM public.spielplan_abruf a
        JOIN net._http_response antwort ON antwort.id = a.id
        WHERE antwort.status_code = 200
        ORDER BY a.id DESC
        LIMIT 1;
        IF daten IS NULL THEN RETURN; END IF;
    END IF;

    -- Schutz vor einer kaputten oder leeren Datei: sie ließe alle Paare
    -- verschwinden, und am Tag darauf wäre alles "neu".
    IF jsonb_typeof(daten->'eintraege') IS DISTINCT FROM 'array'
       OR jsonb_array_length(daten->'eintraege') < 50 THEN
        RAISE WARNING 'spielplan_abgleichen: Datei unbrauchbar, nichts geändert';
        RETURN;
    END IF;

    erster_lauf := NOT EXISTS (SELECT 1 FROM public.spielplan_paare);

    IF NOT erster_lauf THEN
        FOR r IN
            WITH aktuell AS (
                SELECT e->>'werk' AS werk, e->>'titel' AS titel, e->>'haus' AS haus, e->>'stadt' AS stadt,
                       (SELECT min(t.tag::date) FROM jsonb_array_elements_text(e->'termine') AS t(tag)
                         WHERE t.tag::date >= current_date) AS ab
                FROM jsonb_array_elements(daten->'eintraege') e
            ),
            neu AS (
                SELECT a.* FROM aktuell a
                WHERE a.ab IS NOT NULL
                  AND NOT EXISTS (SELECT 1 FROM public.spielplan_paare p WHERE p.werk = a.werk AND p.haus = a.haus)
            ),
            treffer AS (
                SELECT DISTINCT l.user_id, n.werk, n.titel, n.haus, n.stadt, n.ab
                FROM neu n
                JOIN public.lists l ON l.type = 'wishlist' AND n.werk = ANY (l.items)
                WHERE l.user_id IS NOT NULL
            )
            SELECT t.user_id,
                   count(*)::int AS anzahl,
                   array_agg(t.titel || ' in ' || t.stadt ORDER BY t.ab, t.titel) AS teile,
                   min(t.ab) AS ab,
                   string_agg(t.werk || '@' || t.haus, ',' ORDER BY t.werk, t.haus) AS schluessel
            FROM treffer t
            GROUP BY t.user_id
        LOOP
            empfaenger := r.user_id;
            betreff := 'Neu im Spielplan';
            nachricht := CASE
                WHEN r.anzahl = 1 THEN
                    r.teile[1] || ', ab ' || extract(day FROM r.ab)::int || '. ' || monate[extract(month FROM r.ab)::int]
                    || ' – ein Werk von deiner Wunschliste.'
                WHEN r.anzahl <= 3 THEN
                    array_to_string(r.teile[1:r.anzahl - 1], ', ') || ' und ' || r.teile[r.anzahl]
                    || ' – Werke von deiner Wunschliste.'
                ELSE
                    array_to_string(r.teile[1:2], ', ') || ' und ' || (r.anzahl - 2)
                    || ' weitere – Werke von deiner Wunschliste.'
            END;

            IF NOT p_nur_zeigen THEN
                BEGIN
                    -- Derselbe Befund meldet sich nicht zweimal, auch wenn ein
                    -- Abgleich doppelt läuft.
                    IF public.push_einmal('spielplan', r.user_id || ':' || md5(r.schluessel), r.user_id, interval '60 days') THEN
                        PERFORM public.push_senden(ARRAY[r.user_id], betreff, nachricht, '#/wishlist', 'spielplan');
                    END IF;
                EXCEPTION WHEN OTHERS THEN
                    RAISE WARNING 'spielplan_abgleichen, Mitteilung: %', SQLERRM;
                END;
            END IF;
            RETURN NEXT;
        END LOOP;
    END IF;

    IF p_nur_zeigen THEN RETURN; END IF;

    -- Bekannt ist ab jetzt, was noch Termine vor sich hat. Was nur noch
    -- Vergangenes hat, fällt heraus; kommt es mit neuen Terminen wieder,
    -- ist es wieder eine Meldung wert.
    DELETE FROM public.spielplan_paare p
    WHERE NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(daten->'eintraege') e
        WHERE e->>'werk' = p.werk AND e->>'haus' = p.haus
          AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(e->'termine') AS t(tag) WHERE t.tag::date >= current_date));
    INSERT INTO public.spielplan_paare (werk, haus, stand)
        SELECT e->>'werk', e->>'haus', (daten->>'stand')::date
        FROM jsonb_array_elements(daten->'eintraege') e
        WHERE EXISTS (SELECT 1 FROM jsonb_array_elements_text(e->'termine') AS t(tag) WHERE t.tag::date >= current_date)
        ON CONFLICT (werk, haus) DO NOTHING;

    IF abruf IS NOT NULL THEN
        DELETE FROM public.spielplan_abruf WHERE id <= abruf;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.spielplan_holen() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.spielplan_abgleichen(JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated;

-- ── Termine ──────────────────────────────────────────────────────────────
--
-- 7 Uhr UTC ist 9 Uhr deutscher Sommerzeit, 8 Uhr im Winter.

SELECT cron.schedule('spielplan-holen', '0 7 * * *', 'SELECT public.spielplan_holen()');
SELECT cron.schedule('spielplan-abgleichen', '5 7 * * *', 'SELECT count(*) FROM public.spielplan_abgleichen()');
