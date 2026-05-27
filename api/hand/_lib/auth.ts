import { supabaseAuth } from './supabaseServer.js';

/**
 * Verify Supabase JWT from Authorization header.
 * Returns { user, error }. On failure, user is null and error has status + message.
 */
export const verifyAuth = async (req) => {
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');

  if (!token) {
    return { user: null, error: { status: 401, code: 'MISSING_TOKEN', message: 'Authorization header required' } };
  }

  const { data, error } = await supabaseAuth.auth.getUser(token);

  if (error || !data?.user) {
    return { user: null, error: { status: 401, code: 'INVALID_TOKEN', message: 'Invalid or expired token' } };
  }

  return { user: data.user, error: null };
};
