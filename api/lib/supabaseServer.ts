import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hnhrpwwznzokkfagfumb.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.warn('[supabaseServer] SUPABASE_SERVICE_ROLE_KEY not set — RPC calls will fail');
}

// Service-role client bypasses RLS. Used only in API endpoints.
export const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY || '', {
  auth: { persistSession: false },
});

// Client for verifying user JWTs (uses the public anon key).
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_WSIZ6R2jgrSe-hXUCMtP8w_lETzweKx';

export const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
