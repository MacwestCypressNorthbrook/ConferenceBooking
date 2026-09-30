import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Booking, SpaceSettings } from "@/lib/types";
import { bookingIcs } from "./ics";
import { sendEmail, type Email } from "./send";
import * as t from "./templates";

export type BookingEvent =
  | "created"
  | "approved"
  | "declined"
  | "auto_declined"
  | "cancelled_by_admin"
  | "cancelled_by_requester";

/**
 * Emails everyone who should hear about a booking change. Reads fresh rows
 * with the service role (for the manage link and admin addresses) and never
 * throws, so it's safe to run inside `after()`.
 */
export async function notifyBooking(event: BookingEvent, bookingId: string, appUrl: string) {
  try {
    const db = createAdminClient();
    const [{ data: row }, { data: settings }] = await Promise.all([
      db.from("bookings").select("*").eq("id", bookingId).single(),
      db.from("space_settings").select("*").eq("id", 1).single(),
    ]);
    if (!row || !settings) return;

    const b = row as Booking & { manage_token: string };
    const s = settings as SpaceSettings;
    const manageUrl = `${appUrl}/b/${b.manage_token}`;
    const ctx = { settings: s, appUrl, manageUrl };
    const toRequester = (content: t.EmailContent, extra: Partial<Email> = {}) =>
      sendEmail({ to: b.requester_email, ...content, ...extra });
    const toAdmins = async (content: t.EmailContent) => {
      const { data } = await db.from("profiles").select("email").eq("role", "admin");
      const admins = (data ?? []).map((a) => a.email as string);
      if (admins.length) await sendEmail({ to: admins, replyTo: b.requester_email, ...content });
    };
    const calendar = () => ({
      attachments: [{ filename: "booking.ics", content: bookingIcs(b, s, manageUrl), contentType: "text/calendar; charset=utf-8" }],
    });

    switch (event) {
      case "created": {
        const byAdmin = b.user_id !== null;
        await Promise.all([
          b.status === "confirmed" ? toRequester(t.bookingConfirmed(b, ctx), calendar()) : toRequester(t.requestReceived(b, ctx)),
          byAdmin ? null : toAdmins(t.adminNewRequest(b, ctx)),
        ]);
        break;
      }
      case "approved":
        await toRequester(t.bookingConfirmed(b, ctx), calendar());
        break;
      case "declined":
      case "auto_declined":
        await toRequester(t.bookingDeclined(b, ctx, { autoDeclined: event === "auto_declined" }));
        break;
      case "cancelled_by_admin":
        await toRequester(t.bookingCancelled(b, ctx, { byRequester: false }));
        break;
      case "cancelled_by_requester":
        await Promise.all([
          toRequester(t.bookingCancelled(b, ctx, { byRequester: true })),
          toAdmins(t.adminCancelledByRequester(b, ctx)),
        ]);
        break;
    }
  } catch (error) {
    console.error(`[email] notify ${event} for ${bookingId} failed:`, error);
  }
}
