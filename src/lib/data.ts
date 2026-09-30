import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { BOOKING_SELECT, type Booking, type Profile, type Slot, type SpaceSettings } from "./types";

/** One clock per request, so the layout and page agree on "now". */
export const getRequestTime = cache(() => Date.now());

/** The signed-in person's profile, or null for the public (no session). */
export const getViewerOrNull = cache(async (): Promise<Profile | null> => {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, department, role")
    .eq("id", userId)
    .single();
  return (data as Profile | null) ?? null;
});

export const getViewer = cache(async (): Promise<Profile> => {
  const viewer = await getViewerOrNull();
  if (!viewer) redirect("/login");
  return viewer;
});

/**
 * Busy blocks for the public page: times and status only. Read with the
 * service role because anonymous clients have no access to bookings at all.
 */
export const getPublicSlots = cache(async (from: number, to: number): Promise<Slot[]> => {
  const { data, error } = await createAdminClient()
    .from("bookings")
    .select("starts_at, ends_at, status")
    .in("status", ["pending", "confirmed"])
    .lt("starts_at", new Date(to).toISOString())
    .gt("ends_at", new Date(from).toISOString())
    .order("starts_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((s, i) => ({ ...(s as Omit<Slot, "id">), id: `slot-${from}-${i}` }));
});

export const getSettings = cache(async (): Promise<SpaceSettings> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("space_settings").select("*").eq("id", 1).single();
  if (error || !data) throw new Error(`Could not load space settings: ${error?.message ?? "missing row"}`);
  return data as SpaceSettings;
});

/** Admin view: active (pending + confirmed) bookings with full details. Deduped per request. */
export const getActiveBookings = cache(async (from: number, to: number): Promise<Booking[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKING_SELECT)
    .in("status", ["pending", "confirmed"])
    .lt("starts_at", new Date(to).toISOString())
    .gt("ends_at", new Date(from).toISOString())
    .order("starts_at");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Booking[];
});

export async function getPendingCount() {
  const supabase = await createClient();
  const { count } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .gt("starts_at", new Date().toISOString());
  return count ?? 0;
}
