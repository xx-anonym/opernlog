// ── Supabase Konfiguration ──────────────────────────────

export const SUPABASE_URL = 'https://gqdblqymteclmdlushox.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxZGJscXltdGVjbG1kbHVzaG94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyODI3NzQsImV4cCI6MjA4Nzg1ODc3NH0.VVl4bhy0A5N65uuW1T22jwd8LG4St68l6qd7UO5yn8Q';

// Postfach für Rückmeldungen und Fehler (iCloud+, seit 17.11.2026). Steht auf
// der Datenschutzseite und in den Links "Feedback oder Fehler melden".
export const SUPPORT_ADRESSE = 'support@opernlog.de';

// Ist Supabase konfiguriert?
export const isSupabaseConfigured = () =>
    SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
