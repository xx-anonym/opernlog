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

function builder(table) {
  let single = false, op = null, nutzlast = null;
  const filter = {};
  const api = {
    then(res, rej) {
      if (table === 'seen_operas' && op) {
        if (op === 'upsert' && nutzlast && !window.__seen.includes(nutzlast.opera_id)) {
          window.__seen.push(nutzlast.opera_id);
        }
        if (op === 'delete') window.__seen = window.__seen.filter(id => id !== filter.opera_id);
        return Promise.resolve({ data: [{ user_id: UID, opera_id: nutzlast?.opera_id }], error: null }).then(res, rej);
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
      }
      return Promise.resolve({ data: single ? (rows[0] || null) : rows, error: null }).then(res, rej);
    },
    single() { single = true; return api; },
    maybeSingle() { single = true; return api; },
  };
  for (const m of ['select', 'in', 'order', 'limit', 'ilike', 'gte', 'lte']) api[m] = () => api;
  api.eq = (spalte, wert) => { filter[spalte] = wert; return api; };
  for (const m of ['insert', 'update', 'upsert']) api[m] = (n) => { op = m; nutzlast = n; return api; };
  api.delete = () => { op = 'delete'; return api; };
  return api;
}

window.supabase = { createClient: () => ({
  auth: {
    getSession: async () => ({ data: { session: SESSION }, error: null }),
    onAuthStateChange: () => {},
    signOut: async () => ({ error: null }),
  },
  rpc: async () => ({ data: null, error: null }),
  from: builder,
})};
`;
