import { NextResponse, type NextRequest } from "next/server";
import { bookingIcs } from "@/lib/email/ics";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Booking, SpaceSettings } from "@/lib/types";

export async function GET(request: NextRequest, { params }: RouteContext<"/b/[token]/ics">) {
  const { token } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(token)) return new NextResponse("Not found", { status: 404 });

  const db = createAdminClient();
  const [{ data: booking }, { data: settings }] = await Promise.all([
    db.from("bookings").select("*").eq("manage_token", token).eq("status", "confirmed").maybeSingle(),
    db.from("space_settings").select("*").eq("id", 1).single(),
  ]);
  if (!booking || !settings) return new NextResponse("Not found", { status: 404 });

  const ics = bookingIcs(booking as Booking, settings as SpaceSettings, `${request.nextUrl.origin}/b/${token}`);
  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="booking.ics"',
      "Cache-Control": "private, no-store",
    },
  });
}
