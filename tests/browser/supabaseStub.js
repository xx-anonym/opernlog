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
window.__visits = [];   // Besuchszeilen, wie sie aus der Cloud kaemen
window.__follows = [];  // { follower_id, following_id } – wem der Testnutzer folgt

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
      if (table === 'admins') {
        // Die Regel in der Datenbank zeigt jedem nur die eigene Zeile.
        const rows = window.__istAdmin ? [{ user_id: UID }] : [];
        return Promise.resolve({ data: single ? (rows[0] || null) : rows, error: null }).then(res, rej);
      }
      if (window.__katalog[table]) {
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
      let rows = [];
      if (table === 'profiles') {
        // Nach einer fremden Id gefragt? Dann ein Profil mit genau dieser Id –
        // sonst hielte die App das fremde Profil fuer das eigene.
        rows = [filter.id && filter.id !== UID
          ? { ...PROFILE, id: filter.id, username: 'Andere Person', avatar_initials: 'AP' }
          : PROFILE];
      }
      if (table === 'seen_operas') rows = window.__seen.map(id => ({ opera_id: id }));
      if (table === 'visits') {
        rows = window.__visits.filter(v => !filter.user_id || v.user_id === filter.user_id);
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
    signOut: async () => ({ error: null }),
    signUp: async (angaben) => {
      window.__registriert.push(angaben);
      return { data: { user: { id: UID } }, error: null };
    },
    signInWithPassword: async () => ({ data: { session: SESSION }, error: null }),
    updateUser: async (angaben) => {
      window.__registriert.push(angaben);
      return { data: { user: { id: UID } }, error: null };
    },
  },
  rpc: async () => ({ data: null, error: null }),
  functions: {
    invoke: async (name, optionen) => {
      window.__leakGefragt.push({ name, body: optionen?.body });
      if (window.__leakFehler) return { data: null, error: new Error('Dienst antwortet nicht') };
      return { data: window.__leakAntwort, error: null };
    },
  },
  from: builder,
})};
`;
