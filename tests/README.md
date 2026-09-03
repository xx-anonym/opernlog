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
| `geo.test.js` | Entfernung und Vorauswahl des nächsten Opernhauses |
| `credits.test.js` | Mitwirkende in beiden Schreibweisen |

**`checks/`** – nicht die Logik, sondern der Zustand des Projekts. Diese
Prüfungen fangen die Art Fehler, die sich in keinem Modul zeigt.

| Datei | prüft |
| --- | --- |
| `appShell.test.js` | jede Datei unter `src/` steht in der Liste im Service Worker |
| `css.test.js` | kein `var(--x)` auf eine nirgends definierte Eigenschaft |
| `katalog.test.js` | eindeutige Ids, brauchbare Koordinaten, Bilder von bekannten Hosts |
| `rls.test.js` | nur die bewusst öffentlichen Tabellen sind für jeden lesbar |

**`browser/`** – die Stellen, an denen ein Fehler erst im Zusammenspiel
auftaucht: im Layout, im Verlauf, ohne Netz. Sie starten einen Dateiserver für
das Projektverzeichnis; es geht nichts ins Netz und nichts in die echte
Datenbank.

| Datei | prüft |
| --- | --- |
| `oberflaeche.test.js` | Profilkacheln, Listenfenster, Navigation |
| `scrollposition.test.js` | zurück zu einer Liste landet an derselben Stelle |
| `offline.test.js` | im Flugmodus kommt die App hoch und zeigt lokale Daten |

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
