import { formatDistanceStrict } from "date-fns";
import type { Metadata } from "next";
import { ApprovalsWorkspace, type QueueItem } from "@/components/approvals-workspace";
import { TodayAgenda } from "@/components/today-agenda";
import { cn } from "@/components/ui";
import { getActiveBookings, getRequestTime, getSettings } from "@/lib/data";
import {
  addDaysToKey,
  dayKeyOf,
  formatDay,
  formatDuration,
  formatTime,
  isOpenDay,
  openHours,
  overlaps,
  toSpan,
  weekStart,
  zonedInstant,
} from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";
import { BOOKING_SELECT, type Booking } from "@/lib/types";

export const metadata: Metadata = { title: "Approvals" };

const minutes = (b: Booking) => (Date.parse(b.ends_at) - Date.parse(b.starts_at)) / 60_000;

export default async function ApprovalsPage({ searchParams }: PageProps<"/admin">) {
  const [{ r, tab }, settings] = await Promise.all([searchParams, getSettings()]);
  const tz = settings.timezone;
  const now = getRequestTime();
  const today = dayKeyOf(now, tz);
  const monday = weekStart(today);
  const supabase = await createClient();

  const { data, error } = await supabase.from("bookings").select(BOOKING_SELECT).eq("status", "pending").order("starts_at");
  if (error) throw new Error(error.message);
  const pending = (data ?? []) as Booking[];

  // Everything from the start of today through the furthest pending request (or 60 days
  // of upcoming confirmed bookings): feeds the Upcoming tab and each day timeline.
  const horizon = Math.max(
    zonedInstant(addDaysToKey(today, 60), 0, tz),
    ...pending.map((b) => Date.parse(b.ends_at)),
  );
  const [context, todays, week] = await Promise.all([
    getActiveBookings(zonedInstant(today, 0, tz), horizon),
    getActiveBookings(zonedInstant(today, 0, tz), zonedInstant(addDaysToKey(today, 1), 0, tz)),
    getActiveBookings(zonedInstant(monday, 0, tz), zonedInstant(addDaysToKey(monday, 7), 0, tz)),
  ]);

  const confirmed = context.filter((b) => b.status === "confirmed");
  const upcoming: QueueItem[] = confirmed
    .filter((b) => Date.parse(b.ends_at) > now)
    .map((b) => ({
      request: b,
      submitted: formatDistanceStrict(Date.parse(b.created_at), now, { addSuffix: true }),
      missed: false,
      blockedBy: [],
      competing: [],
    }));
  const requests: QueueItem[] = pending.map((req) => {
    const missed = Date.parse(req.starts_at) <= now;
    return {
      request: req,
      submitted: formatDistanceStrict(Date.parse(req.created_at), now, { addSuffix: true }),
      missed,
      blockedBy: missed ? [] : confirmed.filter((c) => overlaps(toSpan(c), toSpan(req))),
      competing: missed ? [] : pending.filter((o) => o.id !== req.id && Date.parse(o.starts_at) > now && overlaps(toSpan(o), toSpan(req))),
    };
  });

  const items = [...requests, ...upcoming];

  // KPIs
  const waiting = requests.filter((i) => !i.missed);
  const clashing = waiting.filter((i) => i.blockedBy.length || i.competing.length).length;
  const todayConfirmed = todays.filter((b) => b.status === "confirmed");
  const next = confirmed.find((b) => Date.parse(b.starts_at) > now);
  const { open, close } = openHours(settings);
  const openDays = Array.from({ length: 7 }, (_, i) => addDaysToKey(monday, i)).filter((d) => isOpenDay(d, settings)).length;
  const openMinutes = openDays * (close - open);
  const bookedMinutes = week.filter((b) => b.status === "confirmed").reduce((sum, b) => sum + minutes(b), 0);
  const utilisation = openMinutes ? Math.round((bookedMinutes / openMinutes) * 100) : 0;

  const nextLabel = next
    ? `${dayKeyOf(Date.parse(next.starts_at), tz) === today ? "Today" : formatDay(dayKeyOf(Date.parse(next.starts_at), tz), "EEE d MMM")} · ${formatTime(Date.parse(next.starts_at), tz)}`
    : "Nothing confirmed ahead";

  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label="Waiting for a decision" value={String(waiting.length)} tone={waiting.length ? "warn" : undefined}>
          {clashing ? `${clashing} with a conflict` : "No conflicts"}
        </Stat>
        <Stat label="Booked today" value={formatDuration(todayConfirmed.reduce((s, b) => s + minutes(b), 0)) || "0 h"}>
          {todayConfirmed.length} confirmed {todayConfirmed.length === 1 ? "booking" : "bookings"}
        </Stat>
        <Stat label="Used this week" value={`${utilisation}%`}>
          <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-primary-soft" aria-hidden>
            <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, utilisation)}%` }} />
          </span>
          <span className="mt-1.5 block">
            {formatDuration(bookedMinutes) || "0 h"} of {formatDuration(openMinutes)} open hours
          </span>
        </Stat>
        <Stat label="Next up" value={next?.title ?? "—"} small>
          {nextLabel}
        </Stat>
      </dl>

      <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <ApprovalsWorkspace
          items={items}
          context={context}
          initialId={typeof r === "string" ? r : undefined}
          initialTab={tab === "upcoming" || tab === "missed" || tab === "waiting" ? tab : undefined}
          serverNow={now}
        />
        <div className="hidden 2xl:block">
          <TodayAgenda bookings={todays} />
        </div>
      </div>
      <div className="2xl:hidden">
        <TodayAgenda bookings={todays} />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  small,
  children,
}: {
  label: string;
  value: string;
  tone?: "warn";
  small?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <dt className="flex items-center gap-1.5 text-[13px] text-fg-muted">
        {tone === "warn" && <span className="size-1.5 rounded-full bg-warn" aria-hidden />}
        {label}
      </dt>
      <dd>
        <span className={cn("mt-1 block truncate font-semibold tracking-[-0.02em] text-fg", small ? "text-lg leading-8" : "text-[28px] leading-8")}>
          {value}
        </span>
        <span className="mt-0.5 block text-xs text-fg-subtle">{children}</span>
      </dd>
    </div>
  );
}
