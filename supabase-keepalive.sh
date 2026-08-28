#!/bin/bash
# ── Supabase Keep-Alive für OpernLog (lokale Rückfallebene) ──────────
#
# NICHT MEHR DIE HAUPTSACHE. Das Wachhalten erledigt seit August 2026 der
# GitHub-Workflow .github/workflows/supabase-keepalive.yml. Der läuft auf
# GitHubs Rechnern und ist von keinem Gerät abhängig.
#
# Dieses Skript war vorher der einzige Weg und lief per launchd auf einem
# MacBook. Genau darin lag der Fehler: stand der Rechner aus – Urlaub, Deckel
# zu –, lief nichts. Und genau dann war auch niemand da, der die App benutzt
# und sie dadurch von selbst wachgehalten hätte. Nach etwa einer Woche
# pausiert Supabase das Projekt, und die App zeigt für alle keine Daten mehr.
#
# Es kann als zusätzliche Absicherung weiterlaufen (zwei Abfragen alle paar
# Tage kosten nichts) oder abgeschaltet werden – siehe README-Hinweis im
# Workflow. Zum Abschalten den launchd-Eintrag entfernen:
#   launchctl list | grep -i supabase
#   launchctl bootout gui/$(id -u)/<Name des Eintrags>
#
# Adresse und Schlüssel stehen bewusst hier statt in src/config.js gelesen zu
# werden, damit das Skript auch außerhalb einer Arbeitskopie funktioniert. Der
# anon-Schlüssel ist öffentlich – er steckt ohnehin in jedem ausgelieferten
# Browser-Bundle.

SUPABASE_URL="https://gqdblqymteclmdlushox.supabase.co"
SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxZGJscXltdGVjbG1kbHVzaG94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyODI3NzQsImV4cCI6MjA4Nzg1ODc3NH0.VVl4bhy0A5N65uuW1T22jwd8LG4St68l6qd7UO5yn8Q"
LOG_FILE="$HOME/Library/Logs/supabase-keepalive.log"

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 \
  "${SUPABASE_URL}/rest/v1/profiles?select=id&limit=1" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}")

if [ "$HTTP_STATUS" -ge 200 ] && [ "$HTTP_STATUS" -lt 300 ]; then
  echo "[${TIMESTAMP}] OK (HTTP ${HTTP_STATUS})" >> "$LOG_FILE"
  exit 0
else
  echo "[${TIMESTAMP}] FEHLER (HTTP ${HTTP_STATUS})" >> "$LOG_FILE"
  exit 1
fi
