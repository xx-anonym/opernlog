-- Registrierungen, die nie bestätigt wurden, nach 30 Tagen löschen.
--
-- Von Jonas am 27.09.2026 im SQL-Editor angelegt (pg_cron-Auftrag 4); diese
-- Datei ist das Protokoll dazu.
--
-- Wer sich registriert, bekommt eine Mail mit einem Bestätigungslink. Klickt
-- er ihn nie, blieb in auth.users trotzdem ein Konto mit E-Mail-Adresse
-- liegen – für immer, obwohl sich damit niemand anmelden kann. Am 27.09.2026
-- waren es vier, das älteste vom März. Solche Daten aufzuheben hat keinen
-- Zweck (Datensparsamkeit, Art. 5 DSGVO).
--
-- Gelöscht wird nur, was nie benutzt wurde:
--   - E-Mail und Telefon unbestätigt,
--   - nie angemeldet (last_sign_in_at leer),
--   - älter als 30 Tage.
-- Anmeldungen über Google kommen mit bestätigter Adresse an und fallen nie
-- darunter. Das Profil, das handle_new_user() schon beim Registrieren
-- anlegt, verschwindet über ON DELETE CASCADE mit; Abende, Listen oder
-- Kommentare kann ein Konto ohne Anmeldung nicht haben.
--
-- Wer sich später doch noch bestätigen will, registriert sich neu – der
-- Link aus der Mail ist nach 30 Tagen ohnehin längst abgelaufen.
--
-- Läuft jede Nacht um 03:30 UTC. cron.schedule mit einem vorhandenen Namen
-- ersetzt den Auftrag, mehrfaches Ausführen ist also gefahrlos.

SELECT cron.schedule('unbestaetigte-konten-loeschen', '30 3 * * *',
  $$DELETE FROM auth.users
    WHERE email_confirmed_at IS NULL AND phone_confirmed_at IS NULL
      AND last_sign_in_at IS NULL AND NOT is_anonymous
      AND created_at < now() - interval '30 days'$$);
