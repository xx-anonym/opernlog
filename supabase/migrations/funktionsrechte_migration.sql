-- Wer die älteren Funktionen mit Besitzerrechten (SECURITY DEFINER) aufrufen
-- darf.
--
-- Postgres gibt jede neue Funktion PUBLIC zum Ausführen frei – also jedem,
-- auch ohne Anmeldung über /rest/v1/rpc/…. Die Funktionen für Mitteilungen
-- und Spielplan nehmen das in ihren Migrationen zurück; diese älteren nicht.
-- katalog_verweise und konto_loeschen entzogen es zwar anon, aber anon erbt
-- das Recht über PUBLIC weiter – das REVOKE FROM anon allein wirkte nicht.
--
-- Ohne Anmeldung taten sie nichts Schlimmes (sie fragen nach auth.uid()),
-- aber sie gehören nicht in die offene Schnittstelle. Supabases
-- Sicherheitsprüfung meldete sie am 30.9.2026.
--
-- tests/checks/rls.test.js prüft, dass jede solche Funktion PUBLIC das Recht
-- nimmt und nur die ausdrücklich genannten anon eines lassen.
--
-- Mehrfaches Ausführen ist gefahrlos.

-- Nur für Angemeldete: die App ruft sie erst nach der Anmeldung.
REVOKE ALL ON FUNCTION public.accept_friend_request(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decline_friend_request(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.send_friend_request(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unfriend(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_invite(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.katalog_verweise(TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.konto_loeschen() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_friend_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_friend_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.send_friend_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unfriend(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invite(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.katalog_verweise(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.konto_loeschen() TO authenticated;

-- Nur als Trigger bei der Registrierung (auth.users). Postgres prüft das
-- Ausführungsrecht beim Anlegen des Triggers, nicht bei jedem Auslösen –
-- über die Schnittstelle braucht sie niemand.
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Absichtlich auch ohne Anmeldung: der Lauf "Offene Vorschläge melden"
-- (.github/workflows/vorschlaege-melden.yml) ruft sie mit dem öffentlichen
-- Schlüssel. Sie gibt nur zwei Zahlen heraus, keine Namen.
REVOKE ALL ON FUNCTION public.pending_suggestion_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pending_suggestion_counts() TO anon, authenticated;
