# OpernLog

Ein persönliches Operntagebuch: Opernbesuche in deutschsprachigen Opernhäusern
loggen, bewerten und teilen. Wie Letterboxd, nur für Oper.

## Technik

- **Kein Build-Schritt.** Statisches HTML plus ES-Module, die der Browser
  direkt lädt. Kein Bundler, kein Framework.
- **PWA.** `manifest.json` und ein Service Worker (`sw.js`) mit App-Shell-Cache;
  Tagebuch, Profil und Katalog funktionieren offline.
- **Supabase** als Backend (Auth, Postgres mit Row Level Security). Adresse und
  öffentlicher `anon`-Schlüssel stehen in `src/config.js`.
- **Vercel** liefert das Wurzelverzeichnis als statische Seite aus. Deshalb
  liegt die einzige `package.json` unter `tests/browser/` und nicht hier – eine
  `package.json` neben der `index.html` würde Vercel das Projekt als
  Node-Anwendung behandeln lassen.

## Lokal starten

Ein Dateiserver aus dem Wurzelverzeichnis genügt; wegen ES-Modulen und Service
Worker geht `file://` nicht.

```sh
python3 -m http.server 8000
# http://localhost:8000
```

## Tests

```sh
# Unit-Tests und Projektprüfungen – ohne Abhängigkeiten, gut eine Sekunde
node --test "tests/unit/*.test.js" "tests/checks/*.test.js"

# mit Browser-Tests (Playwright, siehe tests/README.md)
node --test "tests/**/*.test.js"
```

Was wo geprüft wird, steht in [`tests/README.md`](tests/README.md). Die
Werkzeuge unter `tests/werkzeug/` gehören nicht zum Testlauf – sie gleichen den
Katalog gegen Wikidata und Wikimedia Commons ab und werden von der CI oder von
Hand gestartet.

## Aufbau

| Pfad | Inhalt |
| --- | --- |
| `index.html`, `style.css`, `sw.js`, `manifest.json`, `icons/` | die ausgelieferte Seite |
| `src/` | Anwendung: `pages/`, `components/`, `store/`, `data/` (Katalog), Router in `main.js` |
| `vendor/` | mitgelieferte Fremdbibliotheken (Supabase-JS, versioniert statt vom CDN) |
| `supabase/` | `schema.sql` und `migrations/` – von Hand im Supabase-Dashboard eingespielt |
| `scripts/` | Hilfsskripte am Rande (lokale Supabase-Rückfallebene) |
| `tests/` | Tests und Katalog-Werkzeuge |
| `.github/workflows/` | Tests, Katalogprüfung, Supabase wachhalten, offene Vorschläge melden |

## Datenbank

Die Migrationen unter `supabase/migrations/` sind nicht automatisiert; sie
werden von Hand im SQL-Editor des Supabase-Dashboards ausgeführt.
`tests/checks/rls.test.js` liest Schema und Migrationen und stellt sicher, dass
nur die bewusst öffentlichen Tabellen für jeden lesbar sind.
