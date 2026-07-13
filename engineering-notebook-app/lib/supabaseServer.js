import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Verifies the Bearer token from an incoming API request against Supabase Auth.
 * Returns the authenticated user, or null if the token is missing/invalid.
 * This keeps the /api/generate and /api/export-pdf routes from being called
 * by anyone who isn't signed in — important once this is a public multi-user
 * service, since those routes spend your Gemini quota / server CPU.
 */
export async function getUserFromRequest(request) {
  const authHeader = request.headers.get('authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token || !supabaseUrl || !supabaseAnonKey) return null;

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}
