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
- **Der Katalog steht an zwei Orten.** Die 121 Werke, 92 Häuser und 55
  Komponisten liegen als Dateien unter `src/data/`; was der Admin aus der App
  heraus anlegt, liegt in drei Supabase-Tabellen und wird beim Start
  daruntergemischt (`src/data/katalogZusatz.js`). Schreiben darf nur, wer in
  der Tabelle `admins` steht – die niemand über die API beschreiben kann.

  Die Dateien bewacht `tests/checks/katalog.test.js`, bevor etwas ankommt. Für
  die Tabellen gibt es dieses Vorher nicht, deshalb prüft das Formular schon
  beim Absenden gegen dieselben Regeln (`src/data/katalogRegeln.js`) und ein
  täglicher Lauf noch einmal hinterher.

  Entfernen lässt sich nur, was in den Tabellen steht – eine Datei im Repo
  ändert man mit einem Commit. Vorher zählt die Datenbank, was an dem Eintrag
  hängt; hängt etwas dran, wird nicht gelöscht.
- **Konto löschen** geht aus dem Profil heraus, endgültig und ohne Sicherung.
  `konto_loeschen()` nimmt keine Kennung entgegen, sondern die des Aufrufers –
  ein fremdes Konto lässt sich darüber nicht treffen. Selbst angelegte
  Katalogeinträge bleiben stehen, nur die Urheberangabe fällt weg.
- **Vercel** liefert das Wurzelverzeichnis als statische Seite aus. Deshalb
  liegt die einzige `package.json` unter `tests/browser/` und nicht hier – eine
  `package.json` neben der `index.html` würde Vercel das Projekt als
  Node-Anwendung behandeln lassen. Was nicht zur App gehört, hält
  `.vercelignore` zurück: ohne sie lag das Datenbankschema samt aller
  RLS-Regeln unter `/supabase/schema.sql` im Netz. `vercel.json` setzt drei
  Sicherheits-Header und sonst nichts – stünde dort ein `buildCommand`, wäre
  es keine statische Seite mehr.

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
| `.github/workflows/` | Tests, Katalogprüfung, selbst angelegte Einträge prüfen, Supabase wachhalten, offene Vorschläge melden |
| `.vercelignore`, `vercel.json` | was Vercel nicht ausliefert, und die Sicherheits-Header |

## Version erhöhen

Die Version ist eine Kalenderversion (`JJJJ.MM.TT`) und steht im
Ladebildschirm. Erhöhen heißt: **zwei** Stellen anfassen.

1. `src/version.js` – `VERSION` auf das heutige Datum setzen
2. `sw.js` – `CACHE_NAME` auf `opernlog-<dieselbe Version>` setzen

Vergessen fällt auf: bei jedem Push auf `main` prüft
`tests/werkzeug/version-pruefen.mjs`, ob ausgelieferte Dateien geändert wurden,
während die Version älter ist als der Commit. Ändern sich nur Tests, README
oder Workflows, darf sie stehen bleiben.

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
