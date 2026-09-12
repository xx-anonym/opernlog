-- Wer sein Konto löscht, muss es auch löschen können.
--
-- catalog_operas.created_by und die beiden Schwestertabellen zeigten mit
-- NO ACTION auf auth.users. Damit hätte der Admin sein Konto nicht mehr
-- löschen können, sobald er ein Werk angelegt hat – die Datenbank hätte es
-- schlicht verweigert.
--
-- SET NULL statt CASCADE: der Katalogeintrag gehört nach dem Anlegen allen.
-- Ein Werk soll nicht aus dem Katalog verschwinden, weil derjenige geht, der
-- es eingetragen hat. Nur die Urheberangabe fällt weg.

ALTER TABLE catalog_operas DROP CONSTRAINT IF EXISTS catalog_operas_created_by_fkey;
ALTER TABLE catalog_houses DROP CONSTRAINT IF EXISTS catalog_houses_created_by_fkey;
ALTER TABLE catalog_composers DROP CONSTRAINT IF EXISTS catalog_composers_created_by_fkey;

ALTER TABLE catalog_operas ADD CONSTRAINT catalog_operas_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE catalog_houses ADD CONSTRAINT catalog_houses_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE catalog_composers ADD CONSTRAINT catalog_composers_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Das eigene Konto löschen.
--
-- Nur der Eigentümer selbst, immer nur das eigene: die Funktion nimmt keine
-- Kennung entgegen, sondern nimmt die des Aufrufers. Eine Kennung als
-- Argument wäre ein Formular, in das man eine fremde eintragen könnte.
--
-- auth.users lässt sich mit dem anon-Schlüssel nicht anfassen, deshalb
-- SECURITY DEFINER. Alles Weitere erledigen die Fremdschlüssel: profiles hängt
-- mit CASCADE an auth.users, und die elf Tabellen mit Nutzerdaten hängen mit
-- CASCADE an profiles.
--
-- Von Hand aufgeräumt werden nur die beiden Stellen ohne Fremdschlüssel:
-- comments.target_id und likes.target_id zeigen auf einen Besuch, ohne dass
-- die Datenbank das weiß. Ohne diesen Schritt blieben fremde Kommentare zu
-- gelöschten Abenden als unerreichbare Zeilen zurück.
CREATE OR REPLACE FUNCTION public.konto_loeschen()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    ich uuid := (SELECT auth.uid());
    meine_abende uuid[];
BEGIN
    IF ich IS NULL THEN
        RAISE EXCEPTION 'Nicht angemeldet';
    END IF;

    SELECT array_agg(id) INTO meine_abende FROM public.visits WHERE user_id = ich;

    IF meine_abende IS NOT NULL THEN
        DELETE FROM public.comments WHERE target_id = ANY(meine_abende);
        DELETE FROM public.likes    WHERE target_id = ANY(meine_abende);
    END IF;

    -- Der eine Löschbefehl. Alles Übrige fällt über die Fremdschlüssel mit.
    DELETE FROM auth.users WHERE id = ich;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.konto_loeschen() FROM anon;
