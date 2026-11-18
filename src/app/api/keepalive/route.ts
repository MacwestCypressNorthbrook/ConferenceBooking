import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Touches the database so Supabase's free tier doesn't pause the project for
 * inactivity. Called daily by Vercel Cron (`vercel.json`). Reads one tiny row
 * and returns nothing sensitive. If CRON_SECRET is set, Vercel sends it as a
 * bearer token and other callers are rejected.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { error } = await createAdminClient().from("space_settings").select("id").limit(1);

  if (error) {
    console.error("[keepalive] Supabase query failed:", error.message);
    return NextResponse.json({ ok: false }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }

  return NextResponse.json({ ok: true, at: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
}
