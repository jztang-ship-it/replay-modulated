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
  const authErr = async () => ({ data: { user: null, session: null }, error: { message: "Auth unavailable (stub client)" } as any });
  const queryable = { select: noop, insert: noop, update: noop, delete: noop, upsert: noop };
  return {
    auth: {
      getSession: noSession,
      getUser: noUser,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      signInWithOAuth: authErr,
      signInWithPassword: authErr,
      signUp: authErr,
      signInAnonymously: authErr,
      updateUser: authErr,
      linkIdentity: authErr,
      signOut: async () => ({ error: null }),
    },
    from: () => queryable,
  } as unknown as SupabaseClient;
}

let _client: SupabaseClient;
if (supabaseUrl && supabaseAnonKey) {
  try {
    _client = createClient(supabaseUrl, supabaseAnonKey);
  } catch (e) {
    // createClient can throw on malformed URL or storage corruption (iOS Safari
    // private mode, user cleared storage mid-session, etc). Fall back to stub
    // so the game still renders.
    console.warn("[supabase] createClient threw, falling back to stub:", e);
    _client = makeStubClient();
  }
} else {
  console.warn("[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — auth disabled, using stub client");
  _client = makeStubClient();
}

export const supabase: SupabaseClient = _client;
