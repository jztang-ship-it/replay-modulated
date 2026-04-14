import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hnhrpwwznzokkfagfumb.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_WSIZ6R2jgrSe-hXUCMtP8w_lETzweKx';

// Lazy-init to avoid crashing on import when env vars aren't set.
// createClient throws if key is empty string.
let _admin: SupabaseClient | null = null;
let _auth: SupabaseClient | null = null;

export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    if (!_admin) {
      if (!SUPABASE_SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY not set');
      _admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
    }
    return (_admin as any)[prop];
  },
});

export const supabaseAuth: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    if (!_auth) {
      _auth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    }
    return (_auth as any)[prop];
  },
});
