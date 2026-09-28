// Datenschutzerklärung (#/datenschutz).
//
// Bewusst unauffällig verlinkt (Jonas, 27.09.2026): ein kleiner Link unter
// der Anmeldung und einer unter "Konto löschen" – nicht in der Navigation.
// Erreichbar auch ohne Anmeldung, denn gelesen werden soll sie vor dem
// Registrieren.
//
// Der Inhalt beschreibt, was die App tatsächlich tut. Ändert sich daran etwas
// – ein neuer Dienst, eine neue Tabelle, die jemand anderes lesen darf –,
// gehört es hier nachgetragen, samt neuem Stand.
//
// Ohne Namen des Betreibers (sein Wunsch); erreichbar ist er über KONTAKT.

import { escapeHTML } from '../utils.js';

export const KONTAKT = 'uwematthias@icloud.com';
export const STAND = '28. September 2026';

export function DatenschutzPage() {
    const page = document.createElement('div');
    page.className = 'page rechtstext fade-in';
    const mail = escapeHTML(KONTAKT);
    page.innerHTML = `
      <a href="javascript:void(0)" class="back-link" onclick="history.back()">← Zurück</a>
      <h1>Datenschutz</h1>
      <p class="rechtstext__stand">Stand: ${STAND}</p>

      <p>OpernLog ist ein privates, nicht kommerzielles Projekt. Es gibt keine Werbung, kein Tracking
      und keine Cookies zur Analyse. Gespeichert wird nur, was die App zum Funktionieren braucht.</p>

      <h2>Verantwortlich</h2>
      <p>Der Betreiber von OpernLog, erreichbar unter <a href="mailto:${mail}">${mail}</a>.</p>

      <h2>Was gespeichert wird</h2>
      <p>Mit einem Konto:</p>
      <ul>
        <li><strong>Konto:</strong> E-Mail-Adresse und Passwort (nur als verschlüsselter Hash). Wer sich mit
          Google anmeldet, dazu die Angaben, die Google dabei übermittelt. Angelegte Passkeys (öffentlicher
          Schlüssel, Name des Passwortmanagers, Datum der Nutzung).</li>
        <li><strong>Profil:</strong> Benutzername, Kürzel, Profilbild-Symbol, Beschreibung und wer dir
          Freundschaftsanfragen schicken darf.</li>
        <li><strong>Inhalte:</strong> deine Abende (Werk, Haus, Datum, Bewertung, Review, Dirigent, Regie,
          Besetzung), vorgemerkte Abende, Listen und Wunschliste, Markierungen „schon gesehen“, Kommentare,
          Likes, Freundschaften und Anfragen, Einladungslinks und Vorschläge für den Katalog.</li>
        <li><strong>Mitteilungen:</strong> wenn du sie einschaltest, die Push-Adresse deines Geräts und wann
          welche Mitteilung verschickt wurde.</li>
      </ul>
      <p>Rechtsgrundlage ist die Nutzung der App, um die du bittest (Art. 6 Abs. 1 lit. b DSGVO);
      Mitteilungen und Standort nur mit deiner Erlaubnis (lit. a).</p>

      <h2>Wer was sehen kann</h2>
      <p>OpernLog ist ein offenes Tagebuch: dein Profil, deine Abende mit Bewertungen und Reviews,
      Kommentare, Likes, Freundschaften und öffentliche Listen kann jeder sehen, auch ohne Konto.
      Nicht öffentlich sind deine E-Mail-Adresse, vorgemerkte Abende, Markierungen „schon gesehen“, private Listen,
      Einladungslinks, Vorschläge und Mitteilungseinstellungen.</p>

      <h2>Auf deinem Gerät</h2>
      <p>Die App legt deine Anmeldung und eine Kopie deiner Daten im Speicher des Browsers ab, damit sie
      schnell startet und auch ohne Netz funktioniert. Das bleibt auf deinem Gerät.</p>

      <h2>Dienste, die dabei mitarbeiten</h2>
      <ul>
        <li><strong>Vercel</strong> (Vercel Inc., USA) liefert die App aus. Dabei fallen technisch notwendige
          Daten wie deine IP-Adresse an, die nur kurz in Protokollen stehen.</li>
        <li><strong>Supabase</strong> (Supabase Inc., USA; Server in Irland) speichert Konto und Inhalte,
          übernimmt die Anmeldung und verschickt Mitteilungen.</li>
        <li><strong>Google Drive</strong> (Google Ireland Ltd.) verwahrt eine wöchentliche Sicherung der
          Datenbank, verschlüsselt – lesen kann sie nur der Betreiber.</li>
        <li><strong>Wikimedia Commons</strong> (Wikimedia Foundation, USA): Bilder von Werken, Häusern und
          Komponisten lädt dein Browser direkt von dort; Wikimedia sieht dabei deine IP-Adresse.</li>
        <li><strong>Google</strong>, nur wenn du dich mit Google anmeldest.</li>
        <li><strong>Push-Dienste</strong> von Apple, Google oder Mozilla (je nach Browser) stellen
          Mitteilungen zu, wenn du sie eingeschaltet hast.</li>
        <li><strong>Have I Been Pwned:</strong> Beim Registrieren und beim Ändern des Passworts prüft die App, ob es aus
          bekannten Datenlecks stammt. Dorthin geht nur ein fünfstelliges Bruchstück seines Hash-Werts,
          nie das Passwort und nicht deine IP-Adresse.</li>
        <li><strong>Standort:</strong> Den Standort deines Geräts nutzt die App nur mit deiner Erlaubnis
          und nur auf dem Gerät, um nahe Häuser zu zeigen. Ohne Erlaubnis und ohne Einträge im Tagebuch
          fragt „Besuch loggen“ einmal ipwho.is oder geojs.io nach der ungefähren Lage deiner IP-Adresse,
          um das nächste Haus vorzuschlagen.</li>
      </ul>
      <p>Übermittlungen in die USA stützen sich auf das EU-US Data Privacy Framework bzw.
      EU-Standardvertragsklauseln. Links zu Opernhäusern öffnen deren Seiten erst, wenn du sie antippst.</p>

      <h2>Fehlerprotokoll</h2>
      <p>Stürzt die App ab, speichert sie Fehlermeldung, Seite, App-Version, Browserkennung und ob jemand
      angemeldet war – ohne Bezug zu deinem Konto –, um den Fehler zu finden (Art. 6 Abs. 1 lit. f DSGVO).</p>

      <h2>Wie lange</h2>
      <p>Bis du dein Konto löschst; dann verschwindet alles, was dazu gehört, auch Kommentare und Likes an
      deinen Abenden. Registrierungen, die nie bestätigt wurden, werden nach 30 Tagen gelöscht. In den
      Sicherungen steht Gelöschtes noch bis zu 60 Tage.</p>

      <h2>Deine Rechte</h2>
      <p>Du kannst Auskunft, Berichtigung, Löschung, Einschränkung und Datenübertragbarkeit verlangen und der
      Verarbeitung widersprechen (Art. 15–21 DSGVO). Vieles geht direkt in der App: Einträge bearbeiten und
      löschen, unter „Profil bearbeiten“ <em>Meine Daten herunterladen</em> und <em>Konto löschen</em>.
      Für alles andere genügt eine E-Mail. Außerdem kannst du dich bei einer
      Datenschutz-Aufsichtsbehörde beschweren.</p>
    `;
    return page;
}
