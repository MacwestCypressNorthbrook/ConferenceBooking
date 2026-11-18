import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Touches the database so Supabase's free tier doesn't pause the project for
 * inactivity. Called daily by the Worker cron in `worker.ts`; safe to hit by
 * hand. Reads one tiny row and returns nothing sensitive.
 */
export async function GET() {
  const { error } = await createAdminClient().from("space_settings").select("id").limit(1);

  if (error) {
    console.error("[keepalive] Supabase query failed:", error.message);
    return NextResponse.json({ ok: false }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json({ ok: true, at: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
