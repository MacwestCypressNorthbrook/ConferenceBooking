"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { getPublicSlots, getViewerOrNull } from "@/lib/data";
import { notifyBooking } from "@/lib/email/notify";
import { sendEmail } from "@/lib/email/send";
import { adminInvite } from "@/lib/email/templates";
import { friendlyError } from "@/lib/errors";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { BOOKING_SELECT, type ActionResult, type Booking, type BookingStatus, type Slot, type SpaceSettings } from "@/lib/types";

/** Absolute base URL for links in emails. APP_URL wins; otherwise the request's origin. */
async function appUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}

async function requireAdmin() {
  const viewer = await getViewerOrNull();
  return viewer?.role === "admin" ? viewer : null;
}

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

/** Schedule blocks for the booking panel: full bookings for admins, anonymous slots for everyone else. */
export async function loadSlots(from: number, to: number): Promise<ActionResult<(Slot | Booking)[]>> {
  if (!(to > from) || to - from > 62 * 86_400_000) return { ok: false, error: "Invalid range." };

  if (await requireAdmin()) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("bookings")
      .select(BOOKING_SELECT)
      .in("status", ["pending", "confirmed"])
      .lt("starts_at", new Date(to).toISOString())
      .gt("ends_at", new Date(from).toISOString())
      .order("starts_at");
    if (error) return { ok: false, error: friendlyError(error) };
    return { ok: true, data: data as Booking[] };
  }
  return { ok: true, data: await getPublicSlots(from, to) };
}

const bookingInput = z.object({
  title: z.string().trim().min(3, "Give the gathering a title (at least 3 characters).").max(120),
  purpose: z.string().trim().max(1000).optional(),
  attendees: z.coerce.number().int().min(1, "At least one person must attend."),
  needs: z.array(z.string().max(80)).max(20).default([]),
  starts_at: z.iso.datetime({ offset: true }),
  ends_at: z.iso.datetime({ offset: true }),
  requester_name: z.string().trim().min(2, "Enter your full name.").max(120),
  requester_email: z.email("Enter a valid email so we can send you updates."),
  requester_phone: z.string().trim().max(40).optional(),
  requester_department: z.string().trim().max(80).optional(),
  // Honeypot: hidden from people, filled in by naive bots.
  website: z.string().optional(),
});

export type BookingInput = z.input<typeof bookingInput>;

export async function requestBooking(
  input: BookingInput,
): Promise<ActionResult<{ status: BookingStatus; manageUrl?: string }>> {
  const parsed = bookingInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { website, purpose, requester_phone, requester_department, ...rest } = parsed.data;
  if (website) return { ok: true, data: { status: "pending" } };

  const row = {
    ...rest,
    purpose: purpose || null,
    requester_phone: requester_phone || null,
    requester_department: requester_department || null,
  };

  // Admins insert with their own session (the trigger confirms it instantly);
  // everyone else goes through the service role, still held to every rule by the trigger.
  const admin = await requireAdmin();
  const db = admin ? await createClient() : createAdminClient();
  const { data, error } = await db.from("bookings").insert(row).select("id, status, manage_token").single();
  if (error) return { ok: false, error: friendlyError(error) };

  const base = await appUrl();
  after(() => notifyBooking("created", data.id, base));
  revalidatePath("/", "layout");
  return { ok: true, data: { status: data.status as BookingStatus, manageUrl: admin ? undefined : `/b/${data.manage_token}` } };
}

const token = z.uuid();

export async function cancelByToken(manageToken: string): Promise<ActionResult> {
  if (!token.safeParse(manageToken).success) return { ok: false, error: "That link isn't valid." };

  const db = createAdminClient();
  const { data, error } = await db
    .from("bookings")
    .update({ status: "cancelled" })
    .eq("manage_token", manageToken)
    .in("status", ["pending", "confirmed"])
    .gt("ends_at", new Date().toISOString())
    .select("id");
  if (error) return { ok: false, error: friendlyError(error) };
  if (!data.length) return { ok: false, error: "This booking can no longer be cancelled." };

  const base = await appUrl();
  after(() => notifyBooking("cancelled_by_requester", data[0].id, base));
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export async function decideBooking(
  id: string,
  approve: boolean,
  note?: string,
): Promise<ActionResult<{ autoDeclined: number }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("decide_booking", {
    p_id: id,
    p_approve: approve,
    p_note: note?.trim() || null,
  });
  if (error) return { ok: false, error: friendlyError(error) };

  const result = data as { auto_declined: number; auto_declined_ids: string[] };
  const base = await appUrl();
  after(async () => {
    await notifyBooking(approve ? "approved" : "declined", id, base);
    await Promise.all(result.auto_declined_ids.map((other) => notifyBooking("auto_declined", other, base)));
  });
  revalidatePath("/", "layout");
  return { ok: true, data: { autoDeclined: result.auto_declined } };
}

export async function adminCancelBooking(id: string, note?: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_booking", { p_id: id, p_note: note?.trim() || null });
  if (error) return { ok: false, error: friendlyError(error) };

  const base = await appUrl();
  after(() => notifyBooking("cancelled_by_admin", id, base));
  revalidatePath("/", "layout");
  return { ok: true };
}

const time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Use HH:MM");

const settingsInput = z
  .object({
    name: z.string().trim().min(2).max(80),
    location: z.string().trim().max(120).optional(),
    description: z.string().trim().max(400).optional(),
    capacity: z.coerce.number().int().min(1).max(10000),
    timezone: z.string().min(1),
    open_time: time,
    close_time: time,
    open_days: z.array(z.coerce.number().int().min(1).max(7)).min(1, "Open at least one day a week."),
    slot_minutes: z.coerce.number().refine((n) => [15, 30, 60].includes(n)),
    min_duration_minutes: z.coerce.number().int().min(15),
    max_duration_minutes: z.coerce.number().int().min(15),
    max_advance_days: z.coerce.number().int().min(1).max(365),
    requires_approval: z.boolean(),
    amenities: z.array(z.string().trim().min(1).max(80)).max(20),
    allowed_email_domains: z
      .array(
        z
          .string()
          .trim()
          .toLowerCase()
          .transform((d) => d.replace(/^@/, ""))
          .pipe(z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/, "Enter domains like company.com")),
      )
      .max(20),
  })
  .refine((v) => v.close_time > v.open_time, { message: "Closing time must be after opening time." })
  .refine((v) => v.max_duration_minutes >= v.min_duration_minutes, {
    message: "The longest booking can't be shorter than the shortest.",
  });

export type SettingsInput = z.input<typeof settingsInput>;

export async function updateSettings(input: SettingsInput): Promise<ActionResult> {
  const parsed = settingsInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("space_settings")
    .update({ ...parsed.data, location: parsed.data.location || null, description: parsed.data.description || null })
    .eq("id", 1)
    .select("id");

  if (error) return { ok: false, error: friendlyError(error) };
  if (!data?.length) return { ok: false, error: "Only space admins can change these settings." };
  revalidatePath("/", "layout");
  return { ok: true };
}

const inviteInput = z.object({
  email: z.email("Enter a valid email.").transform((e) => e.toLowerCase()),
  full_name: z.string().trim().min(2, "Enter their name.").max(120),
});

/** Creates (or promotes) an admin account and emails them a one-time sign-in link. */
export async function inviteAdmin(input: z.input<typeof inviteInput>): Promise<ActionResult> {
  const inviter = await requireAdmin();
  if (!inviter) return { ok: false, error: "Only space admins can add admins." };
  const parsed = inviteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { email, full_name } = parsed.data;

  const db = createAdminClient();
  const base = await appUrl();
  const existing = await db.from("profiles").select("id").eq("email", email).maybeSingle();

  // New people get an invite link; existing accounts get a normal sign-in link.
  const { data: link, error } = await db.auth.admin.generateLink(
    existing.data
      ? { type: "magiclink", email }
      : { type: "invite", email, options: { data: { full_name } } },
  );
  if (error || !link.user) return { ok: false, error: error?.message ?? "Couldn't create the account." };

  const { error: roleError } = await db.from("profiles").update({ role: "admin", full_name }).eq("id", link.user.id);
  if (roleError) return { ok: false, error: friendlyError(roleError) };

  const { data: settings } = await db.from("space_settings").select("*").eq("id", 1).single();
  const type = existing.data ? "email" : "invite";
  const url = `${base}/auth/confirm?token_hash=${link.properties.hashed_token}&type=${type}&next=/admin`;
  const sent = await sendEmail({ to: email, ...adminInvite(settings as SpaceSettings, url, inviter.full_name) });

  revalidatePath("/admin/settings");
  return sent
    ? { ok: true, message: `${full_name} is now an admin. We emailed them a sign-in link.` }
    : { ok: true, message: `${full_name} is now an admin, but the email failed. They can sign in from the admin page with a sign-in link.` };
}

export async function removeAdmin(profileId: string): Promise<ActionResult> {
  const viewer = await requireAdmin();
  if (!viewer) return { ok: false, error: "Only space admins can remove admins." };
  if (profileId === viewer.id) return { ok: false, error: "You can't remove yourself. Ask another admin." };

  const db = createAdminClient();
  const { error } = await db.from("profiles").update({ role: "member" }).eq("id", profileId);
  if (error) return { ok: false, error: friendlyError(error) };
  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
