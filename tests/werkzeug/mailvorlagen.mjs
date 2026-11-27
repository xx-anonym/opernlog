// Baut die Mailvorlagen unter supabase/templates/ aus einem gemeinsamen Gerüst.
//
//   node tests/werkzeug/mailvorlagen.mjs
//
// Drei Mails verschickt Supabase im Namen der App: Registrierung,
// Anmeldecode, E-Mail ändern. Sie sollen aussehen wie die App und wie
// einander – Vorhang, goldene Kante, bordeauxroter Knopf.
//
// Registrierung und Anmeldung tragen keinen Link, sondern einen Einmalcode
// (seit 10.11.2026, `code: true`): OpernLog kennt kein Passwort mehr. Ein
// Link aus der Mail öffnete am iPhone Safari statt der installierten App,
// und manche Postfächer rufen Links zur Prüfung selbst auf und verbrauchen
// sie dabei. Den Code tippt man dort ein, wo man ihn angefordert hat. Von Hand gepflegt
// liefen drei Kopien desselben Gerüsts irgendwann auseinander; deshalb steht
// es nur hier, und je Mail nur, was sie sagt.
//
// Dazu die Mails, die nicht Supabase verschickt, sondern die Edge Function
// mail-senden: bei einer Freundschaftsanfrage, die Erinnerung an leere
// Konten und der Saisonrückblick. Sie landen als Modul in
// supabase/functions/mail-senden/vorlage.js; die Platzhalter (%%NAME%%,
// beim Saisonrückblick auch die Zahlen) füllt felder.js dort. Daneben
// entsteht katalog.js mit den Titeln der Werke und Häuser, die die Funktion
// für den Saisonrückblick braucht.
//
// Supabase liest die Dateien nicht aus dem Repo. Nach jedem Lauf den Inhalt
// der geänderten Datei im Dashboard einfügen (Authentication → Emails →
// Templates, Name und Betreff stehen im Kopf jeder Datei).
// tests/checks/mailvorlagen.test.js merkt, wenn eine Datei nicht mehr dem
// entspricht, was dieses Werkzeug erzeugt.
//
// Gebaut für Mailprogramme, nicht für Browser: Tabellen statt Flexbox, alles
// Wichtige als Inline-Style (Gmail wirft vieles aus <style> weg), Breite
// höchstens 600 px, Farben auch als bgcolor für Outlook. Die Schriften der App
// laden nur Programme, die das können (Apple Mail, iOS); die anderen nehmen
// Georgia und Helvetica. Bild und Schriften kommen von der eigenen Seite.
//
// Apple Mail (iPhone, iPad, Mac) spielt beim Öffnen eine kurze Animation:
// der Vorhang geht auf, die Masken schweben ein, die Rampe leuchtet, Text und
// Knopf treten auf. Sie ist reine Zugabe. Jede Animation endet genau beim
// unbewegten Bild, und versteckt wird nur innerhalb der @keyframes – ein
// Programm, das sie nicht kennt (Gmail, Outlook), zeigt die Mail wie sie ist.
// Wer "Bewegung reduzieren" eingeschaltet hat, bekommt sie ebenfalls ruhig.
// Sie steht in einem eigenen <style>-Block: verwirft ein Programm ihn, bleibt
// der Rest der Gestaltung.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const MAIL_ORDNER = path.join(WURZEL, 'supabase/templates');
export const FUNKTIONS_VORLAGE = path.join(WURZEL, 'supabase/functions/mail-senden/vorlage.js');
export const FUNKTIONS_KATALOG = path.join(WURZEL, 'supabase/functions/mail-senden/katalog.js');

// Bild und Schriften von der Absender-Domain (seit 27.11.2026, vorher
// opernlog.vercel.app): Absender opernlog.de, Bilder von einer anderen
// Domain – das werten strenge Filter wie web.de als Spam-Zeichen, und dort
// landeten die Codes im Spam. opernlog.de liefert seit dem Umzug direkt aus,
// ohne Weiterleitung.
const SEITE = 'https://opernlog.de';
const SANS = `'DM Sans', -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif`;
const SERIF = `'Playfair Display', Georgia, 'Times New Roman', serif`;

/** Kleine Überschrift in Gold über einem Abschnitt. */
const zwischentitel = (text) =>
    `<tr><td style="padding:22px 0 6px; font-family:${SERIF}; font-size:13px; letter-spacing:2px; text-transform:uppercase; color:#c9a84c;">${text}</td></tr>`;

/** "Was dich erwartet": Stern und Text in eigenen Spalten, damit Umbrüche bündig bleiben. */
function liste(titel, zeilen) {
    const zeile = (text, letzte) => `
              <tr><td style="padding:${letzte ? '6px 0 24px' : '6px 0'};">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td valign="top" width="24" style="width:24px; font-size:15px; line-height:1.5; color:#c9a84c;">&#10022;</td>
                  <td valign="top" style="font-family:${SANS}; font-size:15px; line-height:1.5; color:#c8cdd2;">${text}</td>
                </tr></table>
              </td></tr>`;
    return `
            <table class="mehr" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #2c343c;">
              ${zwischentitel(titel)}${zeilen.map((z, i) => zeile(z, i === zeilen.length - 1)).join('')}
            </table>`;
}

/** Ein Hinweis unter dem Knopf, etwa ein Tipp. */
function hinweis(titel, text) {
    return `
            <table class="mehr" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #2c343c;">
              ${zwischentitel(titel)}
              <tr><td style="padding:6px 0 24px; font-family:${SANS}; font-size:15px; line-height:1.6; color:#c8cdd2;">${text}</td></tr>
            </table>`;
}

/** Eine Kachel mit großer Zahl in Gold und kleinem Wort darunter. */
function kachel(zahl, wort, rand) {
    return `
                  <td width="33%" align="center" valign="top" style="width:33%; padding:18px 6px 16px;${rand ? ' border-left:1px solid #2c343c;' : ''}">
                    <div style="font-family:${SERIF}; font-size:38px; line-height:1; font-weight:700; color:#dfc06a;">${zahl}</div>
                    <div style="margin-top:8px; font-family:${SANS}; font-size:12px; letter-spacing:1.5px; text-transform:uppercase; color:#8a96a3;">${wort}</div>
                  </td>`;
}

/**
 * Der Saisonrückblick vor dem Knopf: drei Kacheln mit den Zahlen, darunter
 * die Werke zum ersten Mal, dann der Abend der Saison und das Haus, in dem
 * man am häufigsten war. Alles als Tabellen, damit es in Gmail und Outlook
 * hält; die Platzhalter füllt die Edge Function (felder.js).
 */
function saisonZahlen() {
    return `
            <!-- Die Spielzeit in Zahlen -->
            <table class="knopftabelle" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#14181c" style="margin:0 0 10px; background-color:#14181c; border:1px solid #2c343c; border-radius:12px; border-collapse:separate;">
              <tr>${kachel('%%ABENDE%%', '%%ABENDE_WORT%%', false)}${kachel('%%HAEUSER%%', '%%HAEUSER_WORT%%', true)}${kachel('%%WERKE%%', '%%WERKE_WORT%%', true)}
              </tr>
            </table>
            <p class="mehr" style="margin:0 0 30px; font-family:${SERIF}; font-size:14px; font-style:italic; line-height:1.5; text-align:center; color:#c9a84c;">%%ERSTMALS%%</p>

            <!-- Der Abend der Saison -->
            <table class="mehr" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;">
              ${zwischentitel('Dein Abend der Saison')}
              <tr><td style="padding:6px 0 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#14181c" style="background-color:#14181c; border-left:3px solid #c9a84c; border-radius:0 10px 10px 0;">
                  <tr><td style="padding:16px 20px;">
                    <div style="font-family:${SERIF}; font-size:22px; line-height:1.3; font-weight:700; color:#ffffff;">%%ABEND_WERK%%</div>
                    <div style="margin-top:4px; font-family:${SANS}; font-size:14px; line-height:1.5; color:#8a96a3;">%%ABEND_ORT%%</div>
                    <div style="margin-top:6px; font-family:${SANS}; font-size:18px; letter-spacing:2px; color:#dfc06a;">%%ABEND_STERNE%%</div>
                  </td></tr>
                </table>
              </td></tr>
            </table>

            <!-- Das Haus der Saison -->
            <table class="mehr" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 30px;">
              ${zwischentitel('Am häufigsten im')}
              <tr><td style="padding:6px 0 0; font-family:${SANS}; font-size:16px; line-height:1.5; color:#c8cdd2;">
                <strong style="color:#ffffff;">%%HAUS%%</strong> · %%HAUS_ABENDE%%
              </td></tr>
            </table>
`;
}

/**
 * Der Auftritt in Apple Mail, gut zwei Sekunden, einmal beim Öffnen.
 *
 * Der Vorhang ist kein eigenes Element – zusätzliche Ebenen bräuchten
 * position:absolute, und das verwirft Gmail; dort stünden sie mitten in der
 * Mail. Stattdessen sind es zwei Schatten innen am Kopf, die von beiden
 * Seiten zur Mitte reichen und auseinanderfahren. Sie sind halb durchsichtig:
 * die Falten schimmern durch wie bei einem Vorhang im Dunkeln. min(50vw,
 * 300px) ist die halbe Breite der Karte: am Handy die halbe Bildschirmbreite,
 * sonst 300 px.
 *
 * Füllmodus backwards, nicht both: während der Wartezeit gilt der Anfang der
 * Animation, danach wieder genau der eigene Stil der Mail – nichts bleibt als
 * Schlusswert der Animation hängen.
 *
 * Der Knopf tritt als ganze Tabelle auf: sein Rot liegt auf der Zelle, nicht
 * auf dem Link – bewegte sich nur der Link, stünde vorher ein leerer Kasten da.
 */
const AUFTRITT = `
  @keyframes vorhang {
    0%, 12% {
      box-shadow:
        inset min(50vw, 300px) 0 0 rgba(22,3,7,0.8),
        inset calc(-1 * min(50vw, 300px)) 0 0 rgba(22,3,7,0.8),
        inset calc(min(50vw, 300px) + 18px) 0 18px -8px rgba(0,0,0,0.65),
        inset calc(-1 * min(50vw, 300px) - 18px) 0 18px -8px rgba(0,0,0,0.65);
    }
    100% {
      box-shadow:
        inset 0 0 0 rgba(22,3,7,0),
        inset 0 0 0 rgba(22,3,7,0),
        inset 0 0 0 rgba(0,0,0,0),
        inset 0 0 0 rgba(0,0,0,0);
    }
  }
  @keyframes falten {
    0% { background-position: -22px 0; }
    45% { background-position: 9px 0; }
    75% { background-position: -3px 0; }
    100% { background-position: 0 0; }
  }
  @keyframes schweben {
    0% { opacity: 0; transform: translateY(-16px) scale(0.9); box-shadow: 0 0 0 rgba(223,192,106,0); }
    60% { opacity: 1; transform: none; box-shadow: 0 0 36px rgba(223,192,106,0.55); }
    100% { opacity: 1; transform: none; box-shadow: 0 6px 18px rgba(0,0,0,0.45); }
  }
  @keyframes einblenden {
    0% { opacity: 0; }
    100% { opacity: 1; }
  }
  @keyframes auftreten {
    0% { opacity: 0; transform: translateY(14px); }
    100% { opacity: 1; transform: none; }
  }
  @keyframes rampenlicht {
    0%, 100% { filter: brightness(1); }
    40% { filter: brightness(1.9) saturate(1.2); }
  }
  @keyframes leuchten {
    0%, 100% { box-shadow: 0 0 0 0 rgba(201,168,76,0), 0 0 0 rgba(223,192,106,0); }
    40% { box-shadow: 0 0 0 7px rgba(201,168,76,0.28), 0 0 28px rgba(223,192,106,0.4); }
  }
  @media (prefers-reduced-motion: no-preference) {
    .vorhang { animation: vorhang 1.5s 0.15s cubic-bezier(0.7, 0, 0.3, 1) backwards, falten 2s 0.2s ease-out backwards; }
    .logo { animation: schweben 1.1s 0.55s ease-out backwards; }
    .marke { animation: einblenden 0.8s 0.85s ease-out backwards; }
    .motto { animation: einblenden 0.8s 1s ease-out backwards; }
    .kante { animation: rampenlicht 1.2s 1.1s ease-in-out backwards; }
    .titel { animation: auftreten 0.8s 1.2s cubic-bezier(0.2, 0.7, 0.3, 1) backwards; }
    .einleitung { animation: auftreten 0.8s 1.35s cubic-bezier(0.2, 0.7, 0.3, 1) backwards; }
    .knopftabelle { animation: auftreten 0.8s 1.5s cubic-bezier(0.2, 0.7, 0.3, 1) backwards; }
    .knopf { animation: leuchten 1.4s 2.3s ease-in-out backwards; }
    .mehr { animation: einblenden 1s 1.8s ease-out backwards; }
  }
`;

/**
 * Die Mails. `dashboard` ist der Name der Vorlage im Supabase-Dashboard,
 * `betreff` gehört dort ins Feld darüber. Texte dürfen Go-Template-Variablen
 * enthalten; Supabase füllt sie und maskiert dabei HTML.
 */
export const MAILS = [
    {
        datei: 'registrierung.html',
        dashboard: 'Confirm signup',
        betreff: 'Vorhang auf – dein Code für OpernLog',
        vorschau: '{{ .Token }} ist dein Code. Eintippen, dann hebt sich der Vorhang für dein Operntagebuch.',
        ueberschrift: '{{ if .Data.username }}Vorhang auf, {{ .Data.username }}!{{ else }}Vorhang auf!{{ end }}',
        text: 'Schön, dass du dabei bist. Gib diesen Code in OpernLog ein – damit ist deine E-Mail-Adresse bestätigt, und du kannst deinen ersten Opernabend loggen.',
        code: true,
        mehr: liste('Was dich erwartet', [
            'Jeden Opernabend festhalten, bewerten und wiederfinden',
            'Sehen, was in deiner Nähe demnächst gespielt wird',
            'Mit Freunden teilen, was ihr gehört habt',
        ]),
        fuss: 'Du hast dich nicht bei OpernLog registriert? Dann kannst du diese Mail einfach ignorieren – ohne den Code wird kein Konto aktiv, und nach 30 Tagen ist die Anmeldung wieder gelöscht.',
    },
    {
        datei: 'anmeldecode.html',
        dashboard: 'Magic Link',
        betreff: 'Dein Anmeldecode für OpernLog',
        vorschau: '{{ .Token }} ist dein Code für die Anmeldung. Er gilt nur einmal.',
        ueberschrift: '{{ if .Data.username }}Willkommen zurück, {{ .Data.username }}!{{ else }}Willkommen zurück!{{ end }}',
        text: 'Mit diesem Code meldest du dich bei OpernLog an. Gib ihn dort ein, wo du ihn angefordert hast.',
        code: true,
        mehr: hinweis('Tipp',
            'Mit einem Passkey meldest du dich künftig ohne Code an – mit Face ID, Fingerabdruck oder der PIN deines Geräts. Anlegen kannst du ihn in der App unter „Profil bearbeiten“.'),
        fuss: 'Du wolltest dich nicht anmelden? Dann ignoriere diese Mail – ohne den Code kommt niemand in dein Konto. Gib ihn an niemanden weiter; OpernLog fragt nie danach.',
    },
    {
        datei: 'email-aendern.html',
        dashboard: 'Change Email Address',
        betreff: 'Bestätige deine neue E-Mail-Adresse für OpernLog',
        vorschau: 'Ein Klick, dann gilt deine neue Adresse.',
        ueberschrift: 'Neue Adresse, gleicher Platz im Parkett',
        // Bei "Secure email change" geht diese Mail an die alte und an die
        // neue Adresse – der Text muss für beide stimmen.
        text: 'Für dein OpernLog-Konto soll die E-Mail-Adresse von {{ .Email }} zu {{ .NewEmail }} wechseln. Bestätige die Änderung mit dem Knopf – Tagebuch, Listen und Freunde bleiben, wie sie sind.',
        knopf: 'Änderung bestätigen',
        mehr: '',
        fuss: 'Du wolltest deine Adresse nicht ändern? Dann ignoriere diese Mail – ohne Bestätigung bleibt alles, wie es ist.',
    },
];

// Die eigene Domain. Sie leitet bis zum Umzug auf opernlog.vercel.app weiter
// (307, das #/... bleibt dabei erhalten). Links, die lange in Postfächern
// liegen, zeigen schon dorthin, damit sie den Umzug überleben (seit
// 18.11.2026, zuerst in der Erinnerung). Bilder und Schriften bleiben auf
// vercel.app: manche Mailprogramme laden Bilder hinter einer Weiterleitung
// nicht. Seit dem Umzug (18.11.2026) ist sie die Adresse der App; auch die
// Freundschaftsanfrage zeigt seit 23.11.2026 dorthin. Ein Link unter der
// alten Adresse öffnet am Android-Handy außerdem nicht die installierte App.
const DOMAIN = 'https://opernlog.de';

// Der Knopf der Funktions-Mails: %%LINK%% setzt felder.js ein – bei Anfrage
// und Saisonrückblick mit Einmal-Code zum Anmelden (src/mailAnmeldung.js).
// Der Link darunter ("Geht der Knopf nicht?") zeigt genau denselben, mit
// Code: wer ihn abtippt, soll ebenso angemeldet werden, und ein sichtbarer
// Text, der anders lautet als das Ziel, sieht für Mailprogramme nach Phishing
// aus (Jonas, 23.11.2026, nach der ersten Testmail).
const KNOPF = { ziel: '%%LINK%%' };

/**
 * Mails der Edge Function mail-senden. Keine Go-Template-Variablen: die
 * Funktion ersetzt %%NAME%% durch den Namen des Absenders, im HTML schon
 * maskiert. `klartext` ist der Teil für Programme, die kein HTML zeigen.
 */
export const FUNKTIONS_MAILS = [
    {
        name: 'anfrage',
        betreff: '%%NAME%% möchte mit dir befreundet sein',
        vorschau: '%%NAME%% möchte auf OpernLog mit dir befreundet sein.',
        ueberschrift: 'Neue Freundschaftsanfrage',
        text: '<strong style="color:#ffffff;">%%NAME%%</strong> möchte auf OpernLog mit dir befreundet sein. Als Freunde seht ihr eure Abende im Feed und die Fotos, die ihr für Freunde freigebt.',
        knopf: 'Anfrage ansehen',
        ...KNOPF,
        seite: DOMAIN,
        mehr: '',
        fuss: `Du bekommst diese Mail, weil dir jemand auf OpernLog eine Freundschaftsanfrage geschickt hat. Abschalten kannst du solche Mails in der App unter <a href="${DOMAIN}/#/profile" target="_blank" style="color:#8a96a3; text-decoration:underline;">Profil → Profil bearbeiten → E-Mails</a>. Der Knopf meldet dich direkt an – leite diese Mail deshalb nicht weiter.`,
        klartext: [
            '%%NAME%% möchte auf OpernLog mit dir befreundet sein.',
            '',
            'Anfrage ansehen: %%LINK%%',
            '',
            'Du bekommst diese Mail, weil dir jemand auf OpernLog eine Freundschaftsanfrage geschickt hat.',
            'Abschalten kannst du solche Mails in der App unter Profil → Profil bearbeiten → E-Mails.',
            'Der Knopf meldet dich direkt an – leite diese Mail deshalb nicht weiter.',
        ].join('\n'),
    },
    {
        // Einmal an Konten, die eine Woche alt und noch leer sind
        // (supabase/migrations/mail_erinnerung_migration.sql). %%NAME%% ist
        // hier der Name des Empfängers selbst.
        name: 'erinnerung',
        betreff: 'Was hast du schon gesehen, %%NAME%%?',
        vorschau: 'Dein Operntagebuch ist noch leer. Ein Tippen je Werk genügt für den Anfang.',
        ueberschrift: 'Der Vorhang wartet',
        text: 'Hallo <strong style="color:#ffffff;">%%NAME%%</strong>, du hast dich vor Kurzem bei OpernLog angemeldet – dein Tagebuch ist aber noch leer. Fang mit dem an, was du schon gesehen hast: ein Tippen je Werk genügt.',
        knopf: 'Zu OpernLog',
        ...KNOPF,
        seite: DOMAIN,
        mehr: liste('Für den Anfang', [
            'Werke markieren, die du schon auf der Bühne erlebt hast',
            'Deinen letzten Opernabend loggen – mit Sternen und ein paar Sätzen',
            'Sehen, was in deiner Nähe demnächst gespielt wird',
        ]),
        fuss: `Diese Erinnerung bekommst du nur einmal. Weitere Mails von OpernLog kannst du in der App unter <a href="${DOMAIN}/#/profile" target="_blank" style="color:#8a96a3; text-decoration:underline;">Profil → Profil bearbeiten → E-Mails</a> abschalten.`,
        klartext: [
            'Hallo %%NAME%%,',
            '',
            'du hast dich vor Kurzem bei OpernLog angemeldet – dein Tagebuch ist aber noch leer. Fang mit dem an, was du schon gesehen hast: ein Tippen je Werk genügt.',
            '',
            'Zu OpernLog: %%LINK%%',
            '',
            'Diese Erinnerung bekommst du nur einmal.',
            'Weitere Mails von OpernLog kannst du in der App unter Profil → Profil bearbeiten → E-Mails abschalten.',
        ].join('\n'),
    },
    {
        // Am 31. Juli, wenn der Saisonrückblick in der App erscheint
        // (supabase/migrations/mail_saison_migration.sql). %%NAME%% ist der
        // Name des Empfängers; die Zahlen füllt felder.js.
        name: 'saison',
        betreff: 'Deine Spielzeit %%SAISON%%, %%NAME%%',
        vorschau: '%%ABENDE%% %%ABENDE_WORT%% in %%HAEUSER%% %%HAEUSER_WORT%% – dein Saisonrückblick ist da.',
        ueberschrift: 'Deine Spielzeit %%SAISON%%',
        text: 'Hallo <strong style="color:#ffffff;">%%NAME%%</strong>, der Vorhang ist gefallen. So sah deine Opernsaison aus – den ganzen Rückblick mit allen Abenden, Stimmen und Wegen findest du in der App.',
        oben: saisonZahlen(),
        knopf: 'Zum Saisonrückblick',
        ...KNOPF,
        seite: DOMAIN,
        mehr: '',
        fuss: `Du bekommst diese Mail einmal im Jahr, wenn dein Saisonrückblick fertig ist. Mails von OpernLog kannst du in der App unter <a href="${DOMAIN}/#/profile" target="_blank" style="color:#8a96a3; text-decoration:underline;">Profil → Profil bearbeiten → E-Mails</a> abschalten. Der Knopf meldet dich direkt an – leite diese Mail deshalb nicht weiter.`,
        klartext: [
            'Hallo %%NAME%%,',
            '',
            'der Vorhang ist gefallen. So sah deine Opernsaison %%SAISON%% aus:',
            '',
            '  %%ABENDE%% %%ABENDE_WORT%% · %%HAEUSER%% %%HAEUSER_WORT%% · %%WERKE%% %%WERKE_WORT%%',
            '  %%ERSTMALS%%',
            '',
            'Dein Abend der Saison: %%ABEND_WERK%% – %%ABEND_ORT%% %%ABEND_STERNE%%',
            'Am häufigsten im: %%HAUS%% (%%HAUS_ABENDE%%)',
            '',
            'Zum Saisonrückblick: %%LINK%%',
            '',
            'Du bekommst diese Mail einmal im Jahr, wenn dein Saisonrückblick fertig ist.',
            'Mails von OpernLog kannst du in der App unter Profil → Profil bearbeiten → E-Mails abschalten.',
            'Der Knopf meldet dich direkt an – leite diese Mail deshalb nicht weiter.',
        ].join('\n'),
    },
];

/** Das Modul mit den Funktions-Mails, so wie es unter supabase/functions/ liegt. */
export function vorlageModul() {
    const vorlagen = Object.fromEntries(FUNKTIONS_MAILS.map(m => [m.name, {
        betreff: m.betreff,
        text: m.klartext,
        html: mailHtml(m),
    }]));
    return `// Erzeugt von tests/werkzeug/mailvorlagen.mjs – NICHT von Hand bearbeiten,
// sondern dort ändern und neu erzeugen.
//
// Die Platzhalter (%%NAME%%, %%ABENDE%% …) füllt felder.js – im HTML maskiert.

export const VORLAGEN = ${JSON.stringify(vorlagen, null, 4)};
`;
}

/**
 * Die Titel der Werke und Namen der Häuser für die Edge Function: die
 * Datenbank kennt nur Kennungen. Werke und Häuser aus der Datenbank
 * (vom Admin angelegt) liefert mail_saison_daten() mit Titel.
 */
export async function katalogModul() {
    const { operas } = await import('../../src/data/operas.js');
    const { operaHouses } = await import('../../src/data/operaHouses.js');
    const sortiert = eintraege => Object.fromEntries(eintraege.sort((a, b) => a[0].localeCompare(b[0])));
    const katalog = {
        werke: sortiert(operas.map(o => [o.id, o.title])),
        haeuser: sortiert(operaHouses.map(h => [h.id, h.name])),
    };
    return `// Erzeugt von tests/werkzeug/mailvorlagen.mjs aus src/data/operas.js und
// src/data/operaHouses.js – NICHT von Hand bearbeiten, sondern neu erzeugen.
// Für den Saisonrückblick (felder.js): die Datenbank kennt nur Kennungen.

export const KATALOG = ${JSON.stringify(katalog, null, 1)};
`;
}

/** Knopf mit Link, darunter der Link noch einmal zum Kopieren. */
function knopfTeil(m, ziel) {
    return `${m.oben || ''}            <!-- Knopf: als Tabelle, damit er auch in Outlook ein Knopf bleibt -->
            <table class="knopftabelle" role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 32px;">
              <tr>
                <td align="center" bgcolor="#8b1a2b" style="border-radius:10px; background-color:#8b1a2b; background-image:linear-gradient(135deg, #8b1a2b, #5c111c);">
                  <a class="knopf" href="${ziel}" target="_blank" style="display:inline-block; padding:15px 34px; font-family:${SANS}; font-size:16px; font-weight:700; color:#ffffff; text-decoration:none; border-radius:10px; border:1px solid #c9a84c;">${m.knopf}</a>
                </td>
              </tr>
            </table>
${m.mehr}
            <!-- Rückfall, falls der Knopf nicht geht -->
            <p class="mehr" style="margin:0 0 6px; font-size:13px; line-height:1.5; color:#8a96a3;">
              Geht der Knopf nicht? Dann öffne diesen Link:
            </p>
            <p class="mehr" style="margin:0 0 32px; font-size:12px; line-height:1.5; word-break:break-all;">
              <a href="${ziel}" target="_blank" style="color:#c9a84c; text-decoration:underline;">${ziel}</a>
            </p>
`;
}

/**
 * Der Einmalcode, groß und zum Abtippen – kein Link. Dieselben Klassen wie
 * beim Knopf, damit der Auftritt in Apple Mail derselbe bleibt.
 */
function codeTeil(m) {
    return `            <!-- Der Code: als Tabelle, damit der Rahmen auch in Outlook hält -->
            <table class="knopftabelle" role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px;">
              <tr>
                <td align="center" bgcolor="#14181c" style="border-radius:12px; background-color:#14181c; border:1px solid #c9a84c; padding:16px 30px; font-family:'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size:34px; line-height:1.2; font-weight:700; letter-spacing:8px; color:#dfc06a;">{{ .Token }}</td>
              </tr>
            </table>
            <p class="mehr" style="margin:0 0 32px; font-size:13px; line-height:1.5; color:#8a96a3;">
              Der Code gilt nur einmal und nur für kurze Zeit.
            </p>
${m.mehr}
`;
}

/** Die ganze Vorlage für eine Mail. */
export function mailHtml(m) {
    const ziel = m.ziel ?? '{{ .ConfirmationURL }}';
    const seite = m.seite ?? '{{ .SiteURL }}';
    const herkunft = m.dashboard
        ? `${m.dashboard} – Mailvorlage für OpernLog.

  Erzeugt von tests/werkzeug/mailvorlagen.mjs – NICHT von Hand bearbeiten,
  sondern dort ändern und neu erzeugen.

  Eingespielt von Hand im Supabase-Dashboard: Authentication → Emails →
  Templates → ${m.dashboard}. Betreff: ${m.betreff}
  Supabase liest die Datei nicht von hier; nach jeder Änderung dort neu
  einfügen.`
        : `Mail "${m.name}" der Edge Function mail-senden.

  Erzeugt von tests/werkzeug/mailvorlagen.mjs – NICHT von Hand bearbeiten.`;
    return `<!DOCTYPE html>
<!--
  ${herkunft}
-->
<html lang="de" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<!-- Schon dunkel gestaltet: Mailprogramme sollen die Farben nicht umkehren. -->
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${m.betreff}</title>
<style>
  @font-face {
    font-family: 'Playfair Display';
    font-style: normal;
    font-weight: 400 900;
    src: url('${SEITE}/fonts/playfair-display-normal-latin.woff2') format('woff2');
  }
  @font-face {
    font-family: 'DM Sans';
    font-style: normal;
    font-weight: 300 800;
    src: url('${SEITE}/fonts/dm-sans-normal-latin.woff2') format('woff2');
  }
</style>
<style>
  :root { color-scheme: dark; supported-color-schemes: dark; }
  body { margin: 0; padding: 0; }
  a.knopf:hover { background-color: #b22d40 !important; }
  @media (max-width: 620px) {
    .rahmen { padding: 16px 10px !important; }
    .innen { padding-left: 24px !important; padding-right: 24px !important; }
    .titel { font-size: 28px !important; }
  }
</style>
<!-- Der Auftritt, nur wo Animationen laufen (Apple Mail). -->
<style>${AUFTRITT}</style>
</head>
<body style="margin:0; padding:0; background-color:#0e1114;">

<!-- Vorschauzeile in der Postfachliste, im Text selbst unsichtbar. Ohne die
     unsichtbaren Füllzeichen dahinter (bis 27.11.2026): versteckter Text aus
     Leerzeichen-Ketten ist ein bekanntes Spam-Zeichen. -->
<div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#0e1114; opacity:0;">
  ${m.vorschau}
</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#0e1114" style="background-color:#0e1114;">
  <tr>
    <td class="rahmen" align="center" style="padding:32px 16px;">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:600px; border-collapse:separate; border-radius:16px; overflow:hidden; background-color:#1c2228;" bgcolor="#1c2228">

        <!-- Kopf: der Vorhang -->
        <tr>
          <td class="vorhang" align="center" bgcolor="#5c111c" style="background-color:#5c111c; background-image:repeating-linear-gradient(90deg, #5c111c 0px, #7a1626 14px, #8b1a2b 22px, #6a1422 32px, #5c111c 44px); padding:36px 24px 30px;">
            <img class="logo" src="${SEITE}/icons/icon-any-192.png" width="72" height="72" alt="" style="display:block; width:72px; height:72px; border:0; border-radius:16px; box-shadow:0 6px 18px rgba(0,0,0,0.45);">
            <div class="marke" style="margin-top:14px; font-family:${SERIF}; font-size:30px; font-weight:700; letter-spacing:1px; color:#dfc06a;">OpernLog</div>
            <div class="motto" style="margin-top:4px; font-family:${SANS}; font-size:13px; letter-spacing:0.5px; color:#e8d6d9;">Dein persönliches Operntagebuch</div>
          </td>
        </tr>
        <!-- Goldene Kante unter dem Vorhang -->
        <tr>
          <td class="kante" height="3" bgcolor="#c9a84c" style="height:3px; line-height:3px; font-size:3px; background-color:#c9a84c; background-image:linear-gradient(90deg, #a08030, #dfc06a, #a08030);">&nbsp;</td>
        </tr>

        <!-- Inhalt -->
        <tr>
          <td class="innen" style="padding:40px 48px 12px; font-family:${SANS}; color:#e0e0e0;">
            <h1 class="titel" style="margin:0 0 16px; font-family:${SERIF}; font-size:32px; line-height:1.2; font-weight:700; color:#ffffff;">
              ${m.ueberschrift}
            </h1>
            <p class="einleitung" style="margin:0 0 28px; font-size:16px; line-height:1.6; color:#c8cdd2;">
              ${m.text}
            </p>

${m.code ? codeTeil(m) : knopfTeil(m, ziel)}          </td>
        </tr>

        <!-- Fuß -->
        <tr>
          <td class="innen mehr" bgcolor="#161b20" style="padding:22px 48px 26px; background-color:#161b20; font-family:${SANS}; font-size:12px; line-height:1.6; color:#7b8794;">
            ${m.fuss}
          </td>
        </tr>
      </table>

      <!-- Unter der Karte -->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:600px;">
        <tr>
          <td align="center" style="padding:20px 16px 0; font-family:${SERIF}; font-size:13px; font-style:italic; color:#5d6873;">
            <a href="${seite}" target="_blank" style="color:#8a7a4a; text-decoration:none;">OpernLog</a> · Wie Letterboxd, nur für Oper
          </td>
        </tr>
      </table>

    </td>
  </tr>
</table>
</body>
</html>
`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    fs.mkdirSync(MAIL_ORDNER, { recursive: true });
    for (const m of MAILS) {
        fs.writeFileSync(path.join(MAIL_ORDNER, m.datei), mailHtml(m));
        console.log(`${m.datei}  →  ${m.dashboard}  ·  Betreff: ${m.betreff}`);
    }
    fs.writeFileSync(FUNKTIONS_VORLAGE, vorlageModul());
    fs.writeFileSync(FUNKTIONS_KATALOG, await katalogModul());
    console.log(`${path.relative(WURZEL, FUNKTIONS_VORLAGE)}  →  Edge Function mail-senden`);
}
