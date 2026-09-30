import { ArrowLeft, CalendarDays, CalendarPlus, Clock, MapPin, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClass, cn, StatusBadge } from "@/components/ui";
import { getRequestTime, getSettings } from "@/lib/data";
import { dayKeyOf, formatDay, formatDuration, formatRange } from "@/lib/schedule";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Booking } from "@/lib/types";
import { CancelByLink } from "./cancel-by-link";

export const metadata: Metadata = { title: "Your booking", robots: { index: false, follow: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ManageBookingPage({ params }: PageProps<"/b/[token]">) {
  const { token } = await params;
  if (!UUID.test(token)) notFound();

  const [{ data }, settings] = await Promise.all([
    createAdminClient().from("bookings").select("*").eq("manage_token", token).maybeSingle(),
    getSettings(),
  ]);
  if (!data) notFound();

  const b = data as Booking;
  const tz = settings.timezone;
  const now = getRequestTime();
  const start = Date.parse(b.starts_at);
  const end = Date.parse(b.ends_at);
  const day = dayKeyOf(start, tz);
  const ended = end <= now;
  const active = (b.status === "pending" || b.status === "confirmed") && !ended;
  const expired = b.status === "pending" && start <= now;

  const message = {
    pending: expired
      ? { tone: "border-line bg-surface-2 text-fg-muted", body: "This request wasn't reviewed before its start time." }
      : { tone: "border-warn-line bg-warn-bg text-warn-fg", body: "Waiting for an admin to approve. We'll email you as soon as it's decided. Until then, the time isn't guaranteed." },
    confirmed: ended
      ? { tone: "border-line bg-surface-2 text-fg-muted", body: "This booking has ended." }
      : { tone: "border-ok-line bg-ok-bg text-ok-fg", body: `${settings.name} is yours. See you there.` },
    declined: { tone: "border-bad-line bg-bad-bg text-bad-fg", body: b.decision_note ?? "This request wasn't approved." },
    cancelled: { tone: "border-line bg-surface-2 text-fg-muted", body: b.decision_note ? `Cancelled by an admin: ${b.decision_note}` : "This booking was cancelled." },
  }[b.status];

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-4 py-8">
      <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
        <ArrowLeft className="size-4" aria-hidden /> {settings.name}
      </Link>

      <div className="animate-rise mt-6 rounded-xl border border-line bg-surface p-6 shadow-sm">
        <StatusBadge status={expired ? "expired" : b.status} />
        <h1 className="mt-3 text-2xl font-semibold tracking-[-0.02em]">{b.title}</h1>
        <p className="mt-1 text-sm text-fg-muted">
          Requested by {b.requester_name} · {b.requester_email}
        </p>

        <ul className="mt-5 space-y-2.5 text-sm">
          <li className="flex items-center gap-3">
            <CalendarDays className="size-4 text-fg-subtle" aria-hidden /> {formatDay(day, "EEEE d MMMM yyyy")}
          </li>
          <li className="flex items-center gap-3">
            <Clock className="size-4 text-fg-subtle" aria-hidden />
            <span className="font-mono text-[13px]">
              {formatRange(start, end, tz)} · {formatDuration((end - start) / 60_000)}
            </span>
          </li>
          <li className="flex items-center gap-3">
            <MapPin className="size-4 text-fg-subtle" aria-hidden /> {[settings.name, settings.location].filter(Boolean).join(" · ")}
          </li>
          <li className="flex items-center gap-3">
            <Users className="size-4 text-fg-subtle" aria-hidden /> {b.attendees} attending
          </li>
        </ul>

        <p role="status" className={cn("mt-5 rounded-md border px-3 py-2.5 text-sm", message.tone)}>
          {message.body}
        </p>

        <div className="mt-6 flex flex-wrap gap-2">
          {b.status === "confirmed" && !ended && (
            <a href={`/b/${token}/ics`} className={buttonClass("primary")}>
              <CalendarPlus className="size-4" aria-hidden /> Add to calendar
            </a>
          )}
          {(b.status === "declined" || b.status === "cancelled" || expired) && (
            <Link href={`/?date=${day}`} className={buttonClass("primary")}>
              Pick another time
            </Link>
          )}
          {active && !expired && <CancelByLink token={token} pending={b.status === "pending"} />}
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-fg-subtle">
        Anyone with this link can view and cancel this booking, so keep it to yourself.
      </p>
    </main>
  );
}
