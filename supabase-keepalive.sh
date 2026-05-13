#!/bin/bash
# ── Supabase Keep-Alive für OpernLog ──────────────────────
# Sendet alle 5 Tage einen minimalen Request an die Supabase REST-API,
# um zu verhindern, dass das Projekt wegen Inaktivität pausiert wird.

SUPABASE_URL="https://gqdblqymteclmdlushox.supabase.co"
SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxZGJscXltdGVjbG1kbHVzaG94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyODI3NzQsImV4cCI6MjA4Nzg1ODc3NH0.VVl4bhy0A5N65uuW1T22jwd8LG4St68l6qd7UO5yn8Q"
LOG_FILE="$HOME/Library/Logs/supabase-keepalive.log"

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "${SUPABASE_URL}/rest/v1/profiles?select=id&limit=1" \
  -H "apikey: ${SUPABASE_ANON_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_ANON_KEY}")

if [ "$HTTP_STATUS" -ge 200 ] && [ "$HTTP_STATUS" -lt 300 ]; then
  echo "[${TIMESTAMP}] ✅ Keep-alive OK (HTTP ${HTTP_STATUS})" >> "$LOG_FILE"
else
  echo "[${TIMESTAMP}] ❌ Keep-alive FEHLER (HTTP ${HTTP_STATUS})" >> "$LOG_FILE"
fi
