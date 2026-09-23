# Tests

Ohne Build-Schritt und ohne Abhängigkeiten für den größten Teil: die
Unit-Tests und die Prüfungen laufen mit dem Testläufer, den Node selbst
mitbringt.

```sh
# alles außer dem Browser – gut eine Sekunde
node --test "tests/unit/*.test.js" "tests/checks/*.test.js"

# mit Browser (braucht Playwright, siehe unten)
node --test "tests/**/*.test.js"
```

## Was hier wo geprüft wird

**`unit/`** – die reinen Datenmodule, ohne Browser und ohne Netz.

| Datei | prüft |
| --- | --- |
| `seenOperas.test.js` | geloggte und markierte Werke, Zahl und Liste aus einer Quelle |
| `visitedHouses.test.js` | besuchte Häuser je Besuch |
| `blindSpots.test.js` | Markierungen zählen als gesehen, aber nicht als Abend |
| `season.test.js` | Spielzeitgrenze 1. August, Saisonrückblick, bester Abend |
| `tagebuch.test.js` | Reihenfolge im Tagebuch – und die Blöcke, die ihr folgen müssen |
| `geo.test.js` | Entfernung und Vorauswahl des nächsten Opernhauses |
| `credits.test.js` | Mitwirkende in beiden Schreibweisen, Kurzfassung der Besetzung |
| `passkey.test.js` | wann es Passkeys gibt, welcher Fehler welchen Satz bekommt |
| `sterne.test.js` | Sterne als Text, auch bei Noten außerhalb von 0 bis 5 |
| `webpush.test.js` | Verschlüsselung Byte für Byte gegen RFC 8291, VAPID-Ausweis, nur bekannte Push-Dienste |
| `push.test.js` | Push auf dem Gerät: iPhone im Safari-Tab, Ein- und Ausschalten, Abmelden |
| `swPush.test.js` | der Service Worker zeigt Mitteilungen an und führt beim Tippen an die richtige Stelle |
| `swBilder.test.js` | der Service Worker holt Bilder mit CORS (echte Größe statt rund 7 MB je Bild) und zeigt sie auch, wenn das Speichern scheitert |
| `suche.test.js` | die Suche findet ohne Umlaute und Akzente („zauberflote“, „Haensel“, „zurich“); „heute“ ist der Tag in Ortszeit |
| `standort.test.js` | Standortabfrage: eine Freigabe im Browser zählt mehr als eine gemerkte frühere Ablehnung; „Standort verwenden“ fragt immer; der Grund eines Fehlschlags samt Hinweis |
| `naehe.test.js` | „In der Nähe“: jeder Abend einzeln nach Datum und Beginn, nur im Umkreis und Zeitraum, nur Werke der Wunschliste; Zoomen rastet auf die Stufen des Umkreises, ganz heraus heißt alle Häuser |
| `landkarte.test.js` | die Ländergrenzen unter der Karte (Natural Earth): Deutschland, Österreich, Schweiz, Liechtenstein als Kern, jedes Haus darin oder dicht an der Grenze, die Datei bleibt klein |
| `installHinweis.test.js` | wann der Hinweis aufs Installieren steht und wann die Frage nach Mitteilungen kommt |
| `kalender.test.js` | Kalenderdatei zu einem Termin: Zeitzone, Ende nach Mitternacht, ganztägig ohne Uhrzeit, Maskierung und Faltung; wohin sie auf iPhone und iPad geht (Safari-Tab: eigenes Fenster, installierte App: echtes Safari) |
| `neuigkeiten.test.js` | wann „Neu in OpernLog“ fällig ist: Konten von vorher, einmal je Gerät, ohne Speicher lieber nicht |
| `spielplanTermine.test.js` | Termine aus Spielplantexten: Schreibweisen, Jahr aus dem Zusammenhang, Kalender über mehrere Zeilen, Uhrzeit, Monatsnavigation; was kein Termin ist (Uraufführung, Spanne, Matinee, Vorverkauf, Gastspiel) |
| `spielplanAbfrage.test.js` | welche Häuser ein Werk demnächst spielen, nach Nähe oder Datum; Übernahme eines Laufs ohne Daten, die zur Seite gehören statt zum Stück |

**`checks/`** – nicht die Logik, sondern der Zustand des Projekts. Diese
Prüfungen fangen die Art Fehler, die sich in keinem Modul zeigt.

| Datei | prüft |
| --- | --- |
| `appShell.test.js` | jede Datei unter `src/` steht in der Liste im Service Worker |
| `css.test.js` | kein `var(--x)` auf eine nirgends definierte Eigenschaft |
| `katalog.test.js` | eindeutige Ids, brauchbare Koordinaten, Bilder von bekannten Hosts |
| `rls.test.js` | nur die bewusst öffentlichen Tabellen sind für jeden lesbar |
| `visitsPruefungen.test.js` | Datenbank und App prüfen Werk- und Hauskennungen gleich |
| `push.test.js` | Datenbank und Edge Function erlauben dieselben Push-Dienste; jeder Anlass hat einen Auslöser |
| `spielplan.test.js` | die erzeugte Spielplandatei passt zum Katalog: Werke, Häuser, Daten, Links |
| `kalenderDateien.test.js` | unter `kalender/` liegt zu jedem Termin im Spielplan genau eine Kalenderdatei, mit dem Inhalt, den die App selbst erzeugen würde; auch für Werke, die nur in der Datenbank stehen |
| `spielplanDaten.test.js` | `daten/spielplan.json` passt zum Spielplan; die Datenbank holt genau diese Datei, jeden Morgen erst holen, dann abgleichen; der erste Abgleich meldet nichts, eine kaputte Datei ändert nichts |

**`browser/`** – die Stellen, an denen ein Fehler erst im Zusammenspiel
auftaucht: im Layout, im Verlauf, ohne Netz. Sie starten einen Dateiserver für
das Projektverzeichnis; es geht nichts ins Netz und nichts in die echte
Datenbank.

| Datei | prüft |
| --- | --- |
| `oberflaeche.test.js` | Profilkacheln, Listenfenster, Navigation |
| `scrollposition.test.js` | zurück zu einer Liste landet an derselben Stelle |
| `offline.test.js` | im Flugmodus kommt die App hoch und zeigt lokale Daten |
| `tagebuchSortierung.test.js` | nach Bewertung sortiert stehen Noten über den Blöcken, keine Monate |
| `besetzung.test.js` | lange Besetzung eingeklappt, Aufklappen springt nicht zum Besuch |
| `passkeys.test.js` | Anmeldeknopf, Verwaltung im Profil, Freischaltung in der echten Bibliothek |
| `fremdeDaten.test.js` | fremde Namen, Werke und Noten richten nichts an; Abmelden gilt nur für dieses Gerät |
| `mitteilungen.test.js` | Mitteilungen im Bearbeiten-Fenster und die Frage beim ersten Start neuer Konten |
| `installHinweis.test.js` | der Hinweis in der Leiste bleibt oben und verdeckt weder Inhalt noch Menü noch Fenster |
| `zurueckGeste.test.js` | Zurück schließt das oberste Fenster; kein toter Schritt, kein Zurückwerfen nach einem Seitenwechsel |
| `wunschlisteSpielplan.test.js` | „Läuft demnächst“ auf der Wunschliste: nur Kommendes, Links aufs Haus, nichts als HTML, Ordnung nach dem Standort |
| `neuigkeit.test.js` | „Neu in OpernLog“: einmal je Gerät für Konten von vorher, gesehen erst nach dem Schließen, nie für neue Konten |
| `kalender.test.js` | „In den Kalender“: Knopf neben dem Haus, Wahl des Abends, heruntergeladene Datei; auf dem iPhone ein eigenes Fenster mit der Datei vom Server statt Download, und die liegt dort wirklich; in der installierten App kein Fenster |
| `werkTermine.test.js` | „Aktuelle Termine“ auf der Werkseite: erst auf Klick, nur wo es Termine gibt, nach dem Standort geordnet |
| `durchsicht.test.js` | Funde der Durchsicht vom 23.09.2026: gestaltete Anmeldefelder, kein Tagebuch-Versprechen ohne Konto, Suche ohne Umlaute, Datum kurz nach Mitternacht, angefangener Text und offene Termine überleben die Rückkehr in die App; abgemeldet keine Wunschliste, keine Markierung, keine Liste |
| `offlineLoggen.test.js` | Loggen ohne Netz: das Formular ist da, der Besuch wartet auf dem Gerät und geht mit derselben Kennung hoch, sobald Netz da ist; kein Doppel, wenn ein Versuch doch ankam; Abmelden fragt vorher |
| `naehe.test.js` | „In der Nähe“: Umkreis und Zeitraum, ohne Standort alle Häuser, Wunschliste mit Stern, Kalender für genau den Abend, Eintrag in der Navigation; Karte mit Umkreis, ein Tipp auf ein Haus schränkt die Liste ein; Umkreis frei per Schieber, mit zwei Fingern und per Trackpad; Ländergrenzen, Punktgröße nach Abenden, Städtenamen |

`umgebung.js` startet Server und Browser. `ersetzeSupabase(page)` liefert statt
der Bibliothek den Ersatz aus `supabaseStub.js` aus – **eine** Stelle dafür,
weil ihre Adresse sich schon einmal geändert hat und die Tests, die noch auf
die alte zeigten, still die echte Bibliothek luden.

Die Offline-Tests nehmen ausdrücklich die echte Bibliothek: dass sie fehlte,
war ja der Fehler. Sie öffnen die App einmal online, warten den Service Worker
ab, schalten dann das Netz ab und laden neu – alles muss aus dem Cache kommen.

## Playwright

Fehlt Playwright, überspringen sich die Browser-Tests, statt fehlzuschlagen.

```sh
cd tests/browser && npm install && npx playwright install chromium
```

Die `package.json` liegt absichtlich in `tests/browser/` und nicht im
Wurzelverzeichnis: eine `package.json` neben der `index.html` würde Vercel
dazu bringen, das Projekt als Node-Anwendung zu behandeln statt als statische
Seite auszuliefern.

## Wenn ein Test fehlschlägt

Erst prüfen, ob der Test recht hat. Beim Schreiben dieser Sammlung war in
mehreren Fällen der Test falsch und nicht der Code – ein Filter, der die
Überlagerung des Listenfensters für die Kopfzeile hielt; eine Liste, die kurz
genug war, dass der geprüfte Fehler gar nicht auftreten konnte. Ein Test, der
grün ist, weil er nichts ausübt, ist schlimmer als keiner.

Deshalb: nach jeder Änderung an einem Test einmal die Gegenprobe machen –
Fehler absichtlich wieder einbauen, Test muss rot werden, Fehler zurücknehmen.
