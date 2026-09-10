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
- **Nichts von Dritten.** Schriften und die Supabase-Bibliothek liegen im
  Projekt. Beides kam einmal von fremden Hosts und war damit zweimal ein
  Problem: der Service Worker überspringt sie, also fehlten sie offline – und
  jeder Aufruf von fonts.googleapis.com überträgt die IP des Besuchers an
  Google. Nachzuholen mit `tests/werkzeug/schriften-holen.mjs`.

  Der Abgleich gegen geleakte Passwörter braucht zwangsläufig einen Dritten.
  Deshalb fragt nicht der Browser bei HaveIBeenPwned nach, sondern die Edge
  Function `passwort-pruefen` – der Browser spricht weiter nur mit Supabase.
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
| `fonts/` | DM Sans und Playfair Display, im Projekt statt von Google |
| `supabase/` | `schema.sql` und `migrations/` – von Hand im Supabase-Dashboard eingespielt; `functions/` sind Edge Functions |
| `scripts/` | Hilfsskripte am Rande (lokale Supabase-Rückfallebene) |
| `tests/` | Tests und Katalog-Werkzeuge |
| `.github/workflows/` | Tests, Katalogprüfung, Supabase wachhalten, offene Vorschläge melden |

## Version erhöhen

Die Version ist eine Kalenderversion (`JJJJ.MM.TT`) und steht im
Ladebildschirm. Erhöhen heißt: **zwei** Stellen anfassen.

1. `src/version.js` – `VERSION` auf das heutige Datum setzen
2. `sw.js` – `CACHE_NAME` auf `opernlog-<dieselbe Version>` setzen

Der Cache-Name ist kein Beiwerk: `activate` löscht jeden Cache, der anders
heißt, und ist damit der einzige Hebel, mit dem eine neue App-Shell bei den
Nutzern ankommt. Bleibt er stehen, zeigt der Ladebildschirm eine neue Nummer,
während alle weiter die alten Dateien benutzen. Der Bilder-Cache hängt bewusst
nicht an der Version – sonst würfe jede Erhöhung die geladenen Bilder weg.

Zusammenlegen lässt sich das nicht: `sw.js` läuft als klassischer Worker und
kann kein ES-Modul importieren. Dass beide Stellen übereinstimmen, prüft
`tests/checks/version.test.js`.

## Datenbank

Die Migrationen unter `supabase/migrations/` sind nicht automatisiert; sie
werden von Hand im SQL-Editor des Supabase-Dashboards ausgeführt.
`tests/checks/rls.test.js` liest Schema und Migrationen und stellt sicher, dass
nur die bewusst öffentlichen Tabellen für jeden lesbar sind.
