# Sicherung der Datenbank

Supabase bietet im Gratis-Tarif keine Sicherung an, die sich herunterladen
ließe. Deshalb zieht `.github/workflows/sicherung.yml` jeden Sonntag um
02:43 UTC die Datenbank ab, verschlüsselt sie und legt sie in Google Drive
ab, im Ordner **OpernLog-Sicherungen** unter „Meine Ablage“. Sicherungen, die
älter als 60 Tage sind, löscht der Lauf dort endgültig, am Papierkorb vorbei.
So stimmt der Satz auf der Datenschutzseite, dass Gelöschtes höchstens 60
Tage in den Sicherungen steht.

Eine Sicherung ist eine Datei `opernlog-JJJJ-MM-TT.tar.gz.age`. Entschlüsselt
enthält sie:

| Datei | Inhalt |
| --- | --- |
| `rollen.sql` | eigene Datenbankrollen |
| `schema.sql` | Tabellen, Regeln (RLS), Rechte, Funktionen, Trigger |
| `daten.sql` | alle Zeilen, auch Konten und Passkeys (`auth.*`) |
| `cron-jobs.csv` | die pg_cron-Zeitpläne |

**Nicht enthalten** sind die Einstellungen im Supabase-Dashboard (Anmeldung,
Google, Weiterleitungsadressen, E-Mail-Vorlagen), die Edge Functions (sie
stehen im Repo unter `supabase/functions/`) und die Geheimnisse im Vault: der
Schlüssel für die Mitteilungen (VAPID) und `push_geheimnis`. Sie sind an das
Projekt gebunden und ließen sich in einem anderen ohnehin nicht öffnen.

Die Datei ist mit [age](https://age-encryption.org) verschlüsselt. Öffnen
kann sie nur, wer den privaten Schlüssel hat. Google sieht nur unlesbare
Daten, und GitHub bekommt nur den öffentlichen Schlüssel.

## Einrichtung (einmal)

Die Werkzeuge auf dem Mac:

```bash
brew install age rclone
```

### 1. Schlüssel erzeugen

```bash
mkdir -p ~/.opernlog && age-keygen -o ~/.opernlog/sicherung-schluessel.txt
```

Die Ausgabe `Public key: age1…` ist der öffentliche Schlüssel, er kommt in
Schritt 4 zu GitHub. Die Datei enthält den **privaten** Schlüssel
(`AGE-SECRET-KEY-1…`). Ihren Inhalt zusätzlich im Passwortmanager ablegen,
etwa als sichere Notiz. Ohne ihn sind alle Sicherungen wertlos. Er gehört
nie zu GitHub, nie in Drive und nie ins Repo.

Den öffentlichen Schlüssel zeigt später jederzeit:

```bash
age-keygen -y ~/.opernlog/sicherung-schluessel.txt
```

### 2. Google Drive verbinden

```bash
rclone config
```

Die Fragen der Reihe nach:

- `n` für eine neue Verbindung, Name `drive`.
- Als Speicher **Google Drive** (`drive`) wählen.
- `client_id` und `client_secret` leer lassen, also Enter drücken. So nimmt
  rclone seinen eigenen, von Google freigegebenen Zugang, und der
  Anmeldeschlüssel läuft nicht nach 7 Tagen ab.
- Als `scope` **drive.file** wählen. Damit sieht rclone in Drive nur die
  Dateien, die es selbst angelegt hat, sonst nichts.
- `service_account_file` leer lassen, die erweiterten Einstellungen mit `n`
  überspringen.
- Die Anmeldung im Browser mit `y` bestätigen. Dann im Browser mit dem
  Google-Konto anmelden und den Zugriff erlauben.
- Die Frage nach einer geteilten Ablage (Shared Drive) mit `n` beantworten,
  zum Schluss mit `y` speichern und mit `q` beenden.

Den Anmeldeschlüssel für GitHub in die Zwischenablage legen, ohne dass er
auf dem Bildschirm erscheint:

```bash
rclone config show drive | sed -n 's/^token = //p' | pbcopy
```

### 3. Verbindungsadresse der Datenbank

Im Supabase-Dashboard das Projekt OpernLog öffnen, oben auf **Connect**
klicken, dort **Session pooler** wählen und die Adresse kopieren. Sie sieht
so aus:

```
postgresql://postgres.gqdblqymteclmdlushox:[YOUR-PASSWORD]@aws-….pooler.supabase.com:5432/postgres
```

In der Adresse `[YOUR-PASSWORD]` durch das Datenbank-Passwort ersetzen.

- Es muss der **Session pooler** sein, Port 5432. Die direkte Adresse
  (`db.….supabase.co`) erreicht GitHub nicht, weil sie nur IPv6 spricht.
  Der Transaction pooler (Port 6543) taugt nicht für Abzüge.
- Wer das Passwort nicht mehr weiß, setzt es unter Project Settings →
  Database → *Reset database password* neu. Die App merkt davon nichts: sie
  und die Edge Functions arbeiten mit API-Schlüsseln, nicht mit diesem
  Passwort.
- Enthält das Passwort andere Zeichen als Buchstaben und Ziffern, müssen
  diese in der Adresse kodiert werden (`@` als `%40`, `#` als `%23` …).
  Einfacher ist ein neues Passwort nur aus Buchstaben und Ziffern.

### 4. Drei Geheimnisse bei GitHub

Im Repo unter Settings → Secrets and variables → Actions → *New repository
secret* diese drei Geheimnisse anlegen:

| Name | Inhalt |
| --- | --- |
| `SUPABASE_DB_URL` | die Adresse aus Schritt 3 |
| `SICHERUNG_AGE_EMPFAENGER` | der öffentliche Schlüssel `age1…` aus Schritt 1 |
| `SICHERUNG_DRIVE_TOKEN` | der Anmeldeschlüssel aus Schritt 2 (Zwischenablage) |

Der Lauf prüft, dass im zweiten Feld wirklich ein öffentlicher Schlüssel
steht, und bricht ab, falls dort aus Versehen der private liegt.

### 5. Erster Lauf mit Probe

Unter Actions → *Datenbank sichern* → *Run workflow* den Haken bei
„Zusätzlich in eine leere Supabase-Datenbank zurückspielen“ setzen und den
Lauf starten. Er braucht etwa fünf Minuten. Die Probe baut auf GitHubs
Rechner eine leere Supabase-Datenbank auf, spielt die Sicherung hinein und
vergleicht die Zeilen jeder Tabelle mit dem Original. Ist alles grün, steht
am Lauf „Wiederherstellung geprobt: … alle Zeilen da“, und in Drive liegt
die erste Datei.

### 6. Einmal selbst öffnen

Die Datei aus Drive herunterladen und prüfen, ob der Schlüssel sie öffnet:

```bash
age -d -i ~/.opernlog/sicherung-schluessel.txt ~/Downloads/opernlog-*.tar.gz.age | tar -tzv
```

Es müssen die vier Dateien aus der Tabelle oben erscheinen. Danach die
heruntergeladene Datei wieder löschen.

## Wenn der Lauf scheitert

GitHub schickt dann eine E-Mail. Die Ursache steht im Lauf in der roten
Zeile:

- **„Geheimnisse fehlen“:** Schritt 4 ist noch nicht erledigt.
- **`password authentication failed`:** Das Datenbank-Passwort hat sich
  geändert. `SUPABASE_DB_URL` mit dem neuen Passwort neu eintragen.
- **`invalid_grant`, `token … expired or revoked`:** Der Zugriff auf Drive
  wurde entzogen, etwa in den Google-Kontoeinstellungen. Die Verbindung mit
  `rclone config reconnect drive:` erneuern, dann den Befehl aus Schritt 2
  wiederholen und `SICHERUNG_DRIVE_TOKEN` neu eintragen.
- **`supabase db dump` scheitert, nachdem Supabase die Datenbank auf eine
  neue Postgres-Version umgestellt hat:** Die Version der CLI im Workflow
  (`setup-cli`, `version:`) erhöhen.
- **E-Mail „scheduled workflow disabled“:** 60 Tage lang gab es keinen
  Commit. Im Actions-Reiter *Enable workflow* klicken.

Ab und zu, etwa einmal im Jahr, lohnt der Lauf mit Probe (Schritt 5).

## Wiederherstellen

Zuerst entschlüsseln und auspacken:

```bash
mkdir sicherung && age -d -i ~/.opernlog/sicherung-schluessel.txt opernlog-JJJJ-MM-TT.tar.gz.age | tar -xz -C sicherung
```

Die Dateien enthalten fremde Daten. Sind sie nicht mehr nötig, den Ordner
löschen.

**Einzelnes zurückholen**, etwa einen versehentlich gelöschten Abend: in
`sicherung/daten.sql` den Block `COPY "public"."visits"` suchen, die Zeile
heraussuchen und im SQL-Editor wieder einfügen.

**Alles verloren:** Ein neues Supabase-Projekt anlegen und die Sicherung mit
einem psql ab Version 17 hineinspielen (`brew install libpq`, danach liegt
psql unter `$(brew --prefix libpq)/bin/psql`):

```bash
psql --single-transaction -v ON_ERROR_STOP=1 -f sicherung/rollen.sql -f sicherung/schema.sql -c 'SET session_replication_role = replica' -f sicherung/daten.sql -d "ADRESSE_DES_NEUEN_PROJEKTS"
```

Danach:

- Die Zeitpläne aus `cron-jobs.csv` im SQL-Editor neu anlegen, je Zeile mit
  `select cron.schedule('name', 'zeitplan', $$befehl$$);`.
- Im Dashboard die Anmeldung einrichten: Google, Weiterleitungsadressen,
  E-Mail-Vorlagen. Die Edge Functions aus `supabase/functions/` deployen.
- Neue Schlüssel für die Mitteilungen in den Vault legen. Wer Mitteilungen
  eingeschaltet hatte, muss sie einmal neu einschalten.
- In `src/config.js` die Adresse und den anon-Schlüssel des neuen Projekts
  eintragen. Der Wachhalte-Lauf (`supabase-keepalive.yml`) liest sie von
  dort.

Passkeys bleiben gültig, solange die App unter `opernlog.vercel.app` läuft:
sie hängen an der Domain, nicht am Supabase-Projekt.
