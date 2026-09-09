-- Einladungscodes sind nicht mehr für alle lesbar
--
-- Bisher galt auf invites: FOR SELECT USING (true). Der anon-Schlüssel steht
-- öffentlich im ausgelieferten Browser-Bundle – er muss das, sonst könnte die
-- Seite gar nicht mit Supabase sprechen. Wer ihn nimmt, konnte damit die
-- gesamte Tabelle abfragen:
--
--   curl "$URL/rest/v1/invites?select=code" -H "apikey: $ANON_KEY"
--
-- und bekam jeden gültigen Code. Codes laufen zwar nach 30 Tagen ab, sind aber
-- bis dahin beliebig oft einlösbar, und accept_invite() legt ein gegenseitiges
-- Folgen an. Ein Fremder konnte sich also zum wechselseitigen Kontakt jedes
-- Nutzers machen, der je einen Einladungslink erzeugt hat.
--
-- Die Anwendung braucht das Leserecht nicht: sie legt Einladungen nur an
-- (src/store/supabase.js, createInvite) und löst sie über die RPC-Funktion ein.
-- accept_invite() ist SECURITY DEFINER und liest invites mit Besitzerrechten –
-- unabhängig davon, was der Aufrufer darf.
--
-- Zum Ausführen: Supabase-Dashboard → SQL Editor → einfügen → Run.

BEGIN;

DROP POLICY IF EXISTS "Invites sind öffentlich lesbar" ON invites;

-- Der Ersteller darf seine eigenen Einladungen weiterhin sehen. Aktuell zeigt
-- die Oberfläche sie nirgends an, aber eine Übersicht "meine offenen Links"
-- wäre naheliegend, und diese Regel gibt genau so viel frei, wie sie dafür
-- bräuchte – und keinen fremden Code.
DROP POLICY IF EXISTS "User sieht eigene Invites" ON invites;
CREATE POLICY "User sieht eigene Invites" ON invites
  FOR SELECT USING (auth.uid() = created_by);

COMMIT;

-- Prüfen, dass genau die beabsichtigten Regeln übrig sind:
--
--   SELECT policyname, cmd, qual FROM pg_policies WHERE tablename = 'invites';
--
-- Erwartet: "User kann Invites erstellen" (INSERT) und
--           "User sieht eigene Invites" (SELECT, qual = auth.uid() = created_by)
