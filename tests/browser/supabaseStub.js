// Ein Supabase-Ersatz für die Browser-Tests.
//
// Er wird anstelle des CDN-Skripts ausgeliefert und stellt window.supabase mit
// genau so viel Verhalten bereit, wie die App beim Start braucht: eine
// angemeldete Sitzung, ein Profil und eine Tabelle seen_operas im Speicher.
// Damit laufen die Tests ohne Netz, ohne Konto und ohne fremde Daten – und
// ohne dass ein fehlgeschlagener Testlauf in der echten Datenbank landet.

export const STUB = `
const UID = '11111111-1111-1111-1111-111111111111';
const SESSION = { user: { id: UID, email: 'test@opernlog.test', user_metadata: { username: 'Testnutzer' } } };
const PROFILE = { id: UID, username: 'Testnutzer', avatar_initials: 'TN', avatar_icon: null,
  bio: '', profile_complete: true, created_at: '2024-01-01T00:00:00Z' };

window.__seen = [];     // opera_id-Liste in der "Datenbank"
window.__lists = [];    // Listen (Wunschliste u. a.), die die App anlegt oder ändert
window.__visits = [];   // Besuchszeilen, wie sie aus der Cloud kaemen
window.__follows = [];  // { follower_id, following_id } – wem der Testnutzer folgt
// Neue Besuche: jeder Versuch landet in __besuchVersuche. __besuchFehler ist
// eine Schlange – je Versuch wird der vorderste Fehler geliefert, solange
// einer da ist. Eine schon vorhandene Kennung scheitert wie in der echten
// Datenbank am Primaerschluessel (23505).
window.__besuchVersuche = [];
window.__besuchFehler = [];
window.__likeFehler = null;     // gesetzt: jeder Zugriff auf likes scheitert damit

// Fuer die Passwortpruefung: was die Edge Function antworten soll, und was der
// Browser ihr geschickt hat. Letzteres darf nur ein fuenfstelliges Praefix
// sein – siehe tests/browser/passwort.test.js.
window.__leakAntwort = '';      // Text im Format SUFFIX:ANZAHL je Zeile
window.__leakFehler = false;    // true: Dienst antwortet nicht
window.__leakGefragt = [];      // die Rumpfobjekte, die invoke() gesehen hat
window.__registriert = [];      // was signUp() entgegengenommen hat

// Fuer das Admin-Katalogformular.
window.__istAdmin = false;      // steht der Testnutzer in admins?
window.__katalog = { catalog_operas: [], catalog_houses: [], catalog_composers: [] };
window.__angelegt = [];         // { tabelle, zeile } je INSERT
window.__insertFehler = null;   // gesetzt: jedes INSERT scheitert damit
window.__verweise = { besuche: 0, markierungen: 0, listen: 0 };  // was am Eintrag haengt
window.__verweiseFehler = null; // gesetzt: die Zaehlung scheitert
window.__geloescht = [];        // { tabelle, id } je DELETE
window.__deleteFehler = null;   // gesetzt: jedes DELETE scheitert damit
window.__kontoGeloescht = 0;    // wie oft konto_loeschen() gerufen wurde
window.__kontoFehler = null;    // gesetzt: Loeschen scheitert damit
window.__abgemeldet = 0;        // wie oft signOut() gerufen wurde
// Verlangt das Projekt eine E-Mail-Bestaetigung, gibt signUp() KEINE Sitzung
// zurueck. Dann darf die App nicht mehr selbst ins Profil schreiben.
window.__signUpMitSitzung = false;
window.__profilSchreibfehler = null;  // was ein upsert auf profiles liefert
window.__profilUpsert = [];     // jedes upsert auf profiles
// Passkeys. Die WebAuthn-Zeremonie selbst laeuft im Test nicht – der Stub
// antwortet an ihrer Stelle, so wie supabase-js es nach der Zeremonie taete.
window.__pushAbos = [];         // was push_abo_speichern bekommen hat
window.__pushGeloescht = [];    // Endpunkte aus push_abo_loeschen
window.__pushProben = [];       // Antworten für push_test, der Reihe nach (Standard: true)
window.__pushProbeGerufen = 0;
window.__pushSpeichernFehler = null;
window.__ablauf = [];            // Reihenfolge von push_abo_loeschen und signOut
window.__einlader = null;       // wessen Einladung accept_invite annimmt
window.__fremderName = null;    // Benutzername fremder Profile, sonst 'Andere Person'
window.__abmeldeArt = undefined; // scope, mit dem signOut() gerufen wurde
window.__passkeys = [];         // { id, friendly_name, created_at, last_used_at }
window.__passkeyFehler = null;  // gesetzt: signInWithPasskey/registerPasskey liefern diesen Fehler
window.__passkeyListeFehler = null;
window.__passkeyAnmeldungen = 0;
window.__passkeyGeloescht = [];

function builder(table) {
  let single = false, op = null, nutzlast = null;
  const filter = {};
  const nicht = {};    // aus neq()
  const drin = {};     // aus in()
  const api = {
    then(res, rej) {
      if (table === 'seen_operas' && op) {
        if (op === 'upsert' && nutzlast && !window.__seen.includes(nutzlast.opera_id)) {
          window.__seen.push(nutzlast.opera_id);
        }
        if (op === 'delete') window.__seen = window.__seen.filter(id => id !== filter.opera_id);
        return Promise.resolve({ data: [{ user_id: UID, opera_id: nutzlast?.opera_id }], error: null }).then(res, rej);
      }
      if (table === 'lists' && (op === 'insert' || op === 'update')) {
        let zeile;
        if (op === 'insert') {
          zeile = { id: 'liste-' + (window.__lists.length + 1), created_at: new Date().toISOString(), ...nutzlast };
          window.__lists.push(zeile);
        } else {
          zeile = window.__lists.find(l => l.id === filter.id) || { id: filter.id, user_id: UID };
          Object.assign(zeile, nutzlast);
          if (!window.__lists.includes(zeile)) window.__lists.push(zeile);
        }
        return Promise.resolve({ data: single ? zeile : [zeile], error: null }).then(res, rej);
      }
      if (table === 'admins') {
        // Die Regel in der Datenbank zeigt jedem nur die eigene Zeile.
        const rows = window.__istAdmin ? [{ user_id: UID }] : [];
        return Promise.resolve({ data: single ? (rows[0] || null) : rows, error: null }).then(res, rej);
      }
      if (window.__katalog[table]) {
        if (op === 'delete') {
          if (window.__deleteFehler) {
            return Promise.resolve({ data: null, error: { message: window.__deleteFehler } }).then(res, rej);
          }
          const weg = window.__katalog[table].filter(z => z.id === filter.id);
          window.__katalog[table] = window.__katalog[table].filter(z => z.id !== filter.id);
          window.__geloescht.push({ tabelle: table, id: filter.id });
          // Wie die echte Datenbank: geloescht wird auch, was sie gar nicht
          // kannte – dann kommt eben keine Zeile zurueck.
          return Promise.resolve({ data: weg.length ? weg : [{ id: filter.id }], error: null }).then(res, rej);
        }
        if (op === 'insert') {
          if (window.__insertFehler) {
            return Promise.resolve({ data: null, error: { message: window.__insertFehler } }).then(res, rej);
          }
          window.__angelegt.push({ tabelle: table, zeile: nutzlast });
          window.__katalog[table].push(nutzlast);
          return Promise.resolve({ data: [nutzlast], error: null }).then(res, rej);
        }
        return Promise.resolve({ data: window.__katalog[table], error: null }).then(res, rej);
      }
      if (table === 'profiles' && op === 'upsert') window.__profilUpsert.push(nutzlast);
      if (table === 'profiles' && op === 'upsert' && window.__profilSchreibfehler) {
        return Promise.resolve({ data: null, error: { message: window.__profilSchreibfehler, code: '42501' } }).then(res, rej);
      }
      if (table === 'likes' && window.__likeFehler) {
        return Promise.resolve({ data: null, error: { message: window.__likeFehler } }).then(res, rej);
      }
      if (table === 'visits' && op === 'insert') {
        window.__besuchVersuche.push(nutzlast);
        const fehler = window.__besuchFehler.length ? window.__besuchFehler.shift() : null;
        if (fehler) return Promise.resolve({ data: null, error: fehler }).then(res, rej);
        if (window.__visits.some(v => v.id === nutzlast.id)) {
          return Promise.resolve({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "visits_pkey"' } }).then(res, rej);
        }
        window.__visits.push({ ...nutzlast });
        return Promise.resolve({ data: [nutzlast], error: null }).then(res, rej);
      }
      let rows = [];
      if (table === 'profiles') {
        // Nach einer fremden Id gefragt? Dann ein Profil mit genau dieser Id –
        // sonst hielte die App das fremde Profil fuer das eigene.
        rows = [filter.id && filter.id !== UID
          ? { ...PROFILE, id: filter.id, username: window.__fremderName || 'Andere Person', avatar_initials: 'AP' }
          // __profilErstellt per addInitScript setzen: das eigene Profil wird
          // schon beim Start geladen. Für die Frage nach Mitteilungen, die
          // nur neue Konten bekommen.
          : { ...PROFILE, created_at: window.__profilErstellt || PROFILE.created_at }];
      }
      if (table === 'seen_operas') rows = window.__seen.map(id => ({ opera_id: id }));
      // Angelegte Listen kommen beim nächsten Abgleich wieder – sonst leerte
      // ein Abgleich im falschen Moment die gerade gesetzte Wunschliste.
      if (table === 'lists') rows = window.__lists.filter(l => !filter.user_id || l.user_id === filter.user_id);
      if (table === 'visits') {
        // Alle eq()-Filter, die eine Spalte der Besuche betreffen – sonst
        // stünden auf der Seite eines Werks die Abende aller Werke.
        rows = window.__visits.filter(v => Object.entries(filter).every(([spalte, wert]) => !(spalte in v) || v[spalte] === wert));
        // neq schliesst aus – der Community-Block laesst so die eigenen Abende weg.
        for (const [spalte, wert] of Object.entries(nicht)) {
          rows = rows.filter(v => v[spalte] !== wert);
        }
        // in() ist sonst ein Durchreicher; ohne diese Zeile bekaeme der Feed
        // alle Besuche statt nur die der Gefolgten und pruefte damit nichts.
        if (drin.user_id) rows = rows.filter(v => drin.user_id.includes(v.user_id));
      }
      if (table === 'follows') {
        rows = window.__follows.filter(f => !filter.follower_id || f.follower_id === filter.follower_id);
      }
      return Promise.resolve({ data: single ? (rows[0] || null) : rows, error: null }).then(res, rej);
    },
    single() { single = true; return api; },
    maybeSingle() { single = true; return api; },
  };
  for (const m of ['select', 'order', 'limit', 'ilike', 'gte', 'lte']) api[m] = () => api;
  api.eq = (spalte, wert) => { filter[spalte] = wert; return api; };
  api.neq = (spalte, wert) => { nicht[spalte] = wert; return api; };
  api.in = (spalte, werte) => { drin[spalte] = werte || []; return api; };
  for (const m of ['insert', 'update', 'upsert']) api[m] = (n) => { op = m; nutzlast = n; return api; };
  api.delete = () => { op = 'delete'; return api; };
  return api;
}

window.supabase = { createClient: () => ({
  auth: {
    getSession: async () => ({ data: { session: SESSION }, error: null }),
    onAuthStateChange: () => {},
    signOut: async (optionen) => { window.__ablauf.push('signOut'); window.__abgemeldet++; window.__abmeldeArt = optionen?.scope; return { error: null }; },
    signUp: async (angaben) => {
      window.__registriert.push(angaben);
      return { data: {
        user: { id: UID },
        session: window.__signUpMitSitzung ? SESSION : null,
      }, error: null };
    },
    signInWithPassword: async () => ({ data: { session: SESSION }, error: null }),
    signInWithPasskey: async () => {
      if (window.__passkeyFehler) return { data: null, error: window.__passkeyFehler };
      window.__passkeyAnmeldungen++;
      return { data: { session: SESSION, user: SESSION.user }, error: null };
    },
    registerPasskey: async () => {
      if (window.__passkeyFehler) return { data: null, error: window.__passkeyFehler };
      const neu = { id: 'pk-' + (window.__passkeys.length + 1), friendly_name: 'iCloud-Schluesselbund',
        created_at: '2026-09-14T10:00:00Z', last_used_at: null };
      window.__passkeys.push(neu);
      return { data: neu, error: null };
    },
    passkey: {
      list: async () => window.__passkeyListeFehler
        ? { data: null, error: { message: window.__passkeyListeFehler } }
        : { data: [...window.__passkeys], error: null },
      delete: async ({ passkeyId }) => {
        window.__passkeyGeloescht.push(passkeyId);
        window.__passkeys = window.__passkeys.filter(p => p.id !== passkeyId);
        return { data: null, error: null };
      },
    },
    updateUser: async (angaben) => {
      window.__registriert.push(angaben);
      return { data: { user: { id: UID } }, error: null };
    },
  },
  rpc: async (name, args) => {
    if (name === 'accept_invite') return { data: window.__einlader, error: null };
    if (name === 'push_abo_speichern') {
      if (window.__pushSpeichernFehler) return { data: null, error: { message: window.__pushSpeichernFehler } };
      window.__pushAbos.push(args);
      return { data: null, error: null };
    }
    if (name === 'push_abo_loeschen') { window.__ablauf.push('push_abo_loeschen'); window.__pushGeloescht.push(args.p_endpoint); return { data: null, error: null }; }
    if (name === 'push_test') { window.__pushProbeGerufen++; const a = window.__pushProben.shift(); return { data: a === undefined ? true : a, error: null }; }
    if (name === 'konto_loeschen') {
      if (window.__kontoFehler) return { data: null, error: { message: window.__kontoFehler } };
      window.__kontoGeloescht++;
      return { data: null, error: null };
    }
    if (name === 'katalog_verweise') {
      if (window.__verweiseFehler) return { data: null, error: { message: window.__verweiseFehler } };
      return { data: [{ ...window.__verweise }], error: null };
    }
    return { data: null, error: null };
  },
  functions: {
    invoke: async (name, optionen) => {
      if (name === 'push-senden') {
        return { data: { schluessel: 'BJjAqw6svCgTxnYuAjvx6g2GzSFlqdeBl4v-uIwfl-9597T6bg3pP02CqBV9EZsfpCVtg6PGSa2tzrekGxi3jnI' }, error: null };
      }
      window.__leakGefragt.push({ name, body: optionen?.body });
      if (window.__leakFehler) return { data: null, error: new Error('Dienst antwortet nicht') };
      return { data: window.__leakAntwort, error: null };
    },
  },
  from: builder,
})};
`;
