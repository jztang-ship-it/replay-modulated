import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** Stub client used when env vars are missing. Prevents the app from crashing
 *  at module load — downstream auth calls resolve to "no session" and DB calls
 *  return empty results. The app still renders and plays; server-dependent
 *  features (leaderboard submit, hand audit log) no-op gracefully. */
function makeStubClient(): SupabaseClient {
  const noSession = async () => ({ data: { session: null }, error: null });
  const noUser = async () => ({ data: { user: null }, error: null });
  const noop = async () => ({ data: null, error: null });
  const queryable = { select: noop, insert: noop, update: noop, delete: noop, upsert: noop };
  return {
    auth: {
      getSession: noSession,
      getUser: noUser,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithOAuth: noop,
      signOut: async () => ({ error: null }),
      signInWithPassword: noop,
      signUp: noop,
    },
    from: () => queryable,
  } as unknown as SupabaseClient;
}

let _client: SupabaseClient;
if (supabaseUrl && supabaseAnonKey) {
  _client = createClient(supabaseUrl, supabaseAnonKey);
} else {
  console.warn("[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — auth disabled, using stub client");
  _client = makeStubClient();
}

export const supabase: SupabaseClient = _client;
