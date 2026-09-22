-- Prüfungen für Besuche: Note und Katalogkennungen.
--
-- Bis hierhin nahm die Datenbank für einen Besuch jede Note von -9,9 bis 9,9
-- und als Werk und Haus beliebigen Text. Die App schickt so etwas nie, aber
-- die Schnittstelle ist offen: jedes Konto kann an der App vorbei schreiben.
-- Zwei Dinge sind damit tatsächlich passiert, nachgestellt am 22.09.2026:
--
-- * Ein Werk wie '<img src=x onerror=...>' lief im Freunde-Feed als Code, bei
--   jedem, der dem Schreibenden folgt.
-- * Eine einzige Note über 5 legte den Freunde-Feed lahm – '☆'.repeat() wirft
--   bei einer negativen Zahl.
--
-- Die App maskiert und begrenzt jetzt selbst. Diese Regeln sorgen dafür, dass
-- solche Zeilen gar nicht erst entstehen – auch für jede spätere Stelle, die
-- einen Besuch anzeigt und das vergisst.
--
-- Die Note: 0,5 bis 5 in halben Schritten, genau das, was die Sterne im
-- Formular hergeben. 0 gibt es nicht, das Formular verlangt eine Note.
--
-- Die Kennungen: dasselbe Muster wie ID_MUSTER in src/data/katalogRegeln.js –
-- Kleinbuchstaben, Ziffern, Bindestrich. Jede Kennung im Katalog hat diese
-- Form, und der Admin kann keine andere anlegen.
--
-- Vor dem Einspielen geprüft: alle 8 vorhandenen Besuche erfüllen beides.
-- Mehrfaches Ausführen ist gefahrlos.

ALTER TABLE public.visits DROP CONSTRAINT IF EXISTS visits_rating_bereich;
ALTER TABLE public.visits ADD CONSTRAINT visits_rating_bereich
    CHECK (rating >= 0.5 AND rating <= 5 AND rating * 2 = trunc(rating * 2));

ALTER TABLE public.visits DROP CONSTRAINT IF EXISTS visits_opera_id_kennung;
ALTER TABLE public.visits ADD CONSTRAINT visits_opera_id_kennung
    CHECK (opera_id ~ '^[a-z0-9-]+$');

ALTER TABLE public.visits DROP CONSTRAINT IF EXISTS visits_house_id_kennung;
ALTER TABLE public.visits ADD CONSTRAINT visits_house_id_kennung
    CHECK (house_id ~ '^[a-z0-9-]+$');
