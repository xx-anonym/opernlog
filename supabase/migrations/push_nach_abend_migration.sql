-- Mitteilung am Morgen nach einem vorgemerkten Abend: "Wie war Tosca
-- gestern?" Ein Tipp öffnet das Formular mit Werk, Haus und Datum.
--
-- Nur danach, nie davor – Jonas' Vorgabe: keine Erinnerung vor dem Abend.
-- Nur, wenn für den Tag noch gar nichts im Tagebuch steht – auch kein anderes
-- Werk oder Haus: wer spontan in eine andere Vorstellung ging oder das Haus
-- anders eintrug, hat den Abend schon geloggt. Je Plan höchstens einmal.
-- Was die Startseite als "Wie war …?" zeigt, kommt so auch aufs Gerät, ohne
-- dass man die App öffnen muss.
--
-- Werk und Haus stehen in geplante_besuche nur als Kennung. Die Namen kommen
-- aus der Spielplan-Datei, die spielplan_holen() um 7:00 UTC abruft (siehe
-- spielplan_mitteilungen_migration.sql). spielplan_abgleichen() löscht den
-- Abruf um 7:05 – deshalb läuft diese Funktion um 7:04. Fehlt der Abruf oder
-- das Werk darin, hilft der Katalog in der Datenbank; sonst heißt es
-- allgemein "Wie war dein Abend gestern?".
--
-- 7:04 UTC ist 9:04 Uhr deutscher Sommer-, 8:04 Uhr Winterzeit. "Gestern"
-- ist der Vortag in UTC; um diese Uhrzeit derselbe wie in Deutschland.
--
-- p_heute und p_daten nur für Tests; p_nur_zeigen: nichts senden, nur
-- zurückgeben, wer welche Mitteilung bekäme.
--
-- Mehrfaches Ausführen ist gefahrlos.

CREATE OR REPLACE FUNCTION public.push_nach_abend(
    p_heute DATE DEFAULT current_date,
    p_daten JSONB DEFAULT NULL,
    p_nur_zeigen BOOLEAN DEFAULT false)
RETURNS TABLE (empfaenger UUID, betreff TEXT, nachricht TEXT, ziel TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    daten JSONB := p_daten;
    r RECORD;
BEGIN
    IF daten IS NULL THEN
        SELECT antwort.content::jsonb INTO daten
        FROM public.spielplan_abruf a
        JOIN net._http_response antwort ON antwort.id = a.id
        WHERE antwort.status_code = 200
        ORDER BY a.id DESC
        LIMIT 1;
    END IF;

    FOR r IN
        WITH namen AS (
            SELECT e->>'werk' AS werk, e->>'titel' AS titel, e->>'haus' AS haus, e->>'hausName' AS haus_name
            FROM jsonb_array_elements(CASE WHEN jsonb_typeof(daten->'eintraege') = 'array'
                                           THEN daten->'eintraege' ELSE '[]'::jsonb END) e
        )
        SELECT g.id, g.user_id, g.opera_id, g.house_id, g.datum,
               coalesce((SELECT n.titel FROM namen n WHERE n.werk = g.opera_id AND n.titel <> '' LIMIT 1),
                        (SELECT o.title FROM public.catalog_operas o WHERE o.id = g.opera_id)) AS titel,
               coalesce((SELECT n.haus_name FROM namen n WHERE n.haus = g.house_id AND n.haus_name <> '' LIMIT 1),
                        (SELECT h.name FROM public.catalog_houses h WHERE h.id = g.house_id)) AS haus_name
        FROM public.geplante_besuche g
        WHERE g.datum = p_heute - 1
          AND NOT EXISTS (SELECT 1 FROM public.visits v WHERE v.user_id = g.user_id AND v.date = g.datum)
        ORDER BY g.user_id, g.zeit NULLS LAST, g.id
    LOOP
        empfaenger := r.user_id;
        betreff := CASE WHEN r.titel IS NULL THEN 'Wie war dein Abend gestern?'
                        ELSE 'Wie war ' || r.titel || ' gestern?' END;
        nachricht := coalesce(r.haus_name || ' – ', '') || 'jetzt ins Tagebuch eintragen.';
        ziel := '#/log?house=' || r.house_id || '&opera=' || r.opera_id || '&datum=' || r.datum;

        IF NOT p_nur_zeigen THEN
            BEGIN
                IF public.push_einmal('nach_abend', r.id::text, r.user_id, interval '30 days') THEN
                    PERFORM public.push_senden(ARRAY[r.user_id], betreff, nachricht, ziel, 'nach-abend-' || r.id);
                END IF;
            EXCEPTION WHEN OTHERS THEN
                RAISE WARNING 'push_nach_abend, Mitteilung: %', SQLERRM;
            END;
        END IF;
        RETURN NEXT;
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.push_nach_abend(DATE, JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('push-nach-abend', '4 7 * * *', 'SELECT count(*) FROM public.push_nach_abend()');
