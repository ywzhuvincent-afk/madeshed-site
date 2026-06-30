const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tkltasrbhjqwurybcyxo.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function hasSupabaseService() {
  return Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);
}

function serviceHeaders(extra = {}) {
  return {
    apikey: SERVICE_ROLE_KEY,
    authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'content-type': 'application/json',
    ...extra
  };
}

export function bearerToken(req) {
  const raw = req.headers.authorization || req.headers.Authorization || '';
  const match = String(raw).match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : '';
}

export async function getUserFromRequest(req) {
  if (!hasSupabaseService()) return { user: null, error: 'supabase_service_not_configured' };
  const token = bearerToken(req);
  if (!token) return { user: null, error: 'missing_bearer' };
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) return { user: null, error: 'invalid_session' };
  return { user: await response.json(), error: null };
}

export async function supabaseSelect(table, query = '') {
  if (!hasSupabaseService()) throw new Error('supabase_service_not_configured');
  const path = query ? `${table}?${query}` : table;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: serviceHeaders()
  });
  const data = await response.json().catch(() => []);
  if (!response.ok) throw new Error(data && data.message ? data.message : `select ${table} failed`);
  return Array.isArray(data) ? data : [];
}

export async function supabaseInsert(table, rows, options = {}) {
  if (!hasSupabaseService()) throw new Error('supabase_service_not_configured');
  const suffix = options.onConflict ? `?on_conflict=${encodeURIComponent(options.onConflict)}` : '';
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}${suffix}`, {
    method: 'POST',
    headers: serviceHeaders({
      Prefer: options.upsert ? 'resolution=merge-duplicates,return=representation' : 'return=representation'
    }),
    body: JSON.stringify(Array.isArray(rows) ? rows : [rows])
  });
  const data = await response.json().catch(() => []);
  if (!response.ok) throw new Error(data && data.message ? data.message : `insert ${table} failed`);
  return Array.isArray(data) ? data : [];
}

export async function supabaseUpdate(table, query, row) {
  if (!hasSupabaseService()) throw new Error('supabase_service_not_configured');
  if (!query) throw new Error('missing_update_query');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: serviceHeaders({ Prefer: 'return=representation' }),
    body: JSON.stringify(row || {})
  });
  const data = await response.json().catch(() => []);
  if (!response.ok) throw new Error(data && data.message ? data.message : `update ${table} failed`);
  return Array.isArray(data) ? data : [];
}
