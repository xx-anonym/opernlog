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
- **Passkeys** melden mit Face ID, Fingerabdruck oder Geräte-PIN an. Anlegen
  kann einen nur, wer schon angemeldet ist – im Fenster „Profil bearbeiten“;
  registriert wird weiter per E-Mail oder Google. Supabase führt die Funktion
  als experimentell, die App schaltet sie in `getSupabase()` ausdrücklich frei.

  Den Knopf auf der Anmeldeseite gibt es nur, wenn das Gerät schon ein Konto
  mit Passkey gesehen hat. Browser verraten nicht, ob Passkeys gespeichert
  sind; deshalb merkt sich `src/passkey.js` die Konten in `localStorage`.

  Jeder Passkey ist an die Domain `opernlog.vercel.app` gebunden (Relying
  Party ID unter Authentication → Passkeys im Supabase-Dashboard). **Zieht die
  App auf eine andere Domain, taugt kein einziger Passkey mehr**, und jeder muss
  einen neuen anlegen.
- **Push-Mitteilungen** bei neuer Freundschaftsanfrage, angenommener
  Einladung, Like oder Kommentar auf die eigene Review und am 31. Juli zum
  Saisonrückblick. Eingeschaltet wird pro Gerät im Fenster „Profil
  bearbeiten“; auf dem iPhone nur, wenn OpernLog auf dem Home-Bildschirm liegt.
  Neue Konten (bis 30 Tage) fragt die App beim ersten Start auf einem Gerät
  einmal selbst, mit einem eigenen Fenster vor der Erlaubnisfrage des
  Systems – die stellt das iPhone nämlich nur ein einziges Mal.

  Auf dem Handy im Browser steht oben in der Leiste immer ein Hinweis, die
  App auf den Home-Bildschirm zu legen (`src/installHinweis.js`); auf Android
  mit Knopf, sobald der Browser das Installieren anbietet.

  Der Weg: Auslöser in der Datenbank (`supabase/migrations/push_migration.sql`)
  legen über pg_net eine Anfrage an die Edge Function `push-senden`; die
  verschlüsselt für jedes Gerät (RFC 8291) und schickt an Apple, Google oder
  Mozilla. Die Verschlüsselung steht ohne Fremdbibliothek in
  `supabase/functions/push-senden/webpush.js` und wird gegen das Rechenbeispiel
  aus dem RFC geprüft. Den Saisonrückblick verschickt pg_cron.

  Im Supabase Vault liegen das Geheimnis, mit dem sich die Datenbank bei der
  Funktion ausweist, und der private VAPID-Schlüssel. **Den VAPID-Schlüssel nie
  austauschen**: jedes Abo hängt an ihm, ein neuer machte alle auf einen
  Schlag wertlos.
- **Spielpläne:** Auf der Wunschliste steht bei jedem Werk, an welchen Häusern
  des Katalogs es in dieser Spielzeit noch läuft, mit Link auf die Seite des
  Hauses; auf der Seite eines Werks klappt „Aktuelle Termine“ dasselbe auf.
  „In der Nähe“ (`#/naehe`) dreht die Frage um: was läuft demnächst im
  gewählten Umkreis, jeder Abend einzeln nach Datum, auf Wunsch nur Werke der
  Wunschliste; den Umkreis stellt ein Schieber von 5 bis 300 km ein, oder
  man zoomt die Karte mit zwei Fingern (am Rechner mit dem Trackpad). Die
  Karte darüber (dieselbe wie bei den Opernhäusern) zeigt den Umkreis, die
  Städte und je Haus einen Punkt, der mit der Zahl der Abende wächst; ein
  Tipp auf ein Haus zeigt nur dessen Abende. Die Ländergrenzen darunter
  stammen aus Natural Earth (gemeinfrei) und entstehen mit
  `node tests/werkzeug/landkarte-erzeugen.mjs ne_50m_admin_0_countries.geojson`.
  Steht ein Werk der Wunschliste neu im Spielplan eines Hauses, kommt eine
  Mitteilung („Neu im Spielplan“). Die Datenbank holt dafür jeden Morgen
  `daten/spielplan.json` von der Website und vergleicht mit dem, was sie schon
  kennt (`supabase/migrations/spielplan_mitteilungen_migration.sql`); die
  Datei schreibt das Übernahme-Werkzeug mit.
  Mit Standort stehen die nächsten Häuser vorn. Das Kalender-Symbol neben
  einem Haus macht aus einem gewählten Abend eine Kalenderdatei (.ics) mit
  Ort, Beginn, Ende und Link (`src/kalender.js`); die Uhrzeiten liest das
  Werkzeug mit, wo sie eindeutig neben dem Datum stehen. iPhone und iPad
  öffnen dieselbe Datei vom Server; dafür liegt jeder Abend einzeln unter
  `kalender/`. Aus der installierten App heraus geht die Adresse an das
  echte Safari (`x-safari-https:`), denn das Fenster, das iOS dort öffnet,
  bleibt bei Kalenderdateien leer. Werke, die nur in der Datenbank stehen,
  holt das Werkzeug für ihre Dateien von dort. Die Termine liegen als Datei im Repo (`src/data/spielplan.js`) und
  werden einmal je Spielzeit erneuert – im September, dazu ein kleiner Lauf im
  Januar, weil viele Stadttheater die Frühjahrstermine erst im Winter
  veröffentlichen:

  ```sh
  node tests/werkzeug/spielplaene-lesen.mjs lauf.json --straenge 6   # liest alle Häuser, etwa 40 Minuten
  node tests/werkzeug/spielplan-uebernehmen.mjs lauf.json             # schreibt src/data/spielplan.js, kalender/ und daten/spielplan.json
  ```

  Kommt ein Werk neu in den Katalog – auch über das Admin-Formular, das
  Werkzeug liest die Datenbank mit –, reicht ein Nachtrag für dieses Werk:

  ```sh
  node tests/werkzeug/spielplaene-lesen.mjs nachtrag.json --werke rienzi --straenge 6
  node tests/werkzeug/spielplan-uebernehmen.mjs nachtrag.json --dazu
  ```

  `--dazu` ersetzt nur die Einträge der gesuchten Werke und lässt alle
  anderen stehen. Ändert sich nur das Format der Kalenderdateien
  (`src/kalender.js`), erneuert `node tests/werkzeug/kalender-dateien.mjs`
  den Ordner `kalender/`.

  Das Lesen nimmt nur Termine mit Uhrzeit, wo es welche gibt, und lässt
  Spannen, Matineen, Vorverkaufsdaten und Uraufführungsjahre weg. Dazwischen
  wird trotzdem durchgesehen: Was kein Opernabend ist (Schauspiel-„Faust“,
  Ballett-„Carmen“) oder falsch gelesen wurde, kommt nach
  `tests/werkzeug/spielplan-korrekturen.json` – nie von Hand in die erzeugte
  Datei, sonst ist es beim nächsten Lauf weg. Die Einstiegsseiten je Haus
  stehen in `tests/werkzeug/spielplan-quellen.json`; ändert ein Haus seine
  Webseite, ist das die Stelle. Häuser, die das Werkzeug nicht lesen kann
  (Basel sperrt Programme aus, das Salzburger Landestheater antwortet dem
  Browser nicht), bekommen ihre Termine aus dem Spielzeitheft: von Hand unter
  `ergaenzen` in den Korrekturen, mit Quelle. Diese Termine veralten von
  selbst und müssen jede Spielzeit neu eingetragen werden.
- **Konto löschen** geht aus dem Fenster „Profil bearbeiten“ heraus, endgültig und ohne Sicherung.
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
