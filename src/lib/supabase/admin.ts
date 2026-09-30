import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./env";

const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

export const hasSecretKey = Boolean(secretKey);

/**
 * Service-role client for the public booking path and admin invites.
 * Bypasses RLS: only ever import from server code, and never return raw rows
 * to the public page — the database trigger still enforces booking rules.
 */
export function createAdminClient() {
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY is not set");
  return createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
