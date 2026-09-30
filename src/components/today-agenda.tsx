"use client";

import { Plus } from "lucide-react";
import { useBooking } from "@/components/booking/booking-provider";
import { cn } from "@/components/ui";
import { useNow } from "@/components/use-now";
import { dayKeyOf, formatDay, formatDuration, formatRange, freeGaps, minutesIntoDay } from "@/lib/schedule";
import type { Booking } from "@/lib/types";

/** Today, in order: bookings and the free gaps between them (tap a gap to book it). */
export function TodayAgenda({ bookings }: { bookings: Booking[] }) {
  const { settings: s, serverNow, openBooking, showDetails } = useBooking();
  const now = useNow(serverNow);
  const tz = s.timezone;
  const today = dayKeyOf(now, tz);

  type Row = { kind: "booking"; b: Booking; start: number } | { kind: "free"; start: number; end: number };
  const rows: Row[] = [
    ...bookings.map((b) => ({ kind: "booking" as const, b, start: Date.parse(b.starts_at) })),
    ...freeGaps(today, bookings, s, now)
      .filter((g) => g.end - g.start >= s.min_duration_minutes * 60_000)
      .map((g) => ({ kind: "free" as const, ...g })),
  ].sort((a, b) => a.start - b.start);

  return (
    <section aria-labelledby="today-h" className="rounded-xl border border-line bg-surface">
      <header className="flex items-baseline justify-between border-b border-line px-4 py-3">
        <h2 id="today-h" className="text-sm font-semibold">Today</h2>
        <span className="font-mono text-[11px] text-fg-subtle">{formatDay(today, "EEE d MMM")}</span>
      </header>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-fg-subtle">The space is closed today.</p>
      ) : (
        <ol className="space-y-1.5 p-3">
          {rows.map((row) =>
            row.kind === "booking" ? (
              <li key={row.b.id}>
                <button
                  type="button"
                  onClick={() => showDetails(row.b)}
                  className={cn(
                    "w-full rounded-md border border-l-[3px] px-3 py-2 text-left transition-shadow hover:shadow-pop",
                    row.b.status === "confirmed" ? "border-ok-line border-l-ok bg-ok-bg" : "border-dashed border-warn-line border-l-warn bg-warn-bg",
                    Date.parse(row.b.ends_at) <= now && "opacity-55",
                  )}
                >
                  <span className="block font-mono text-[11px] text-fg-muted">
                    {formatRange(row.start, Date.parse(row.b.ends_at), tz)}
                    {row.b.status === "pending" && " · requested"}
                  </span>
                  <span className="mt-0.5 block truncate text-[13px] font-medium">{row.b.title}</span>
                  <span className="block truncate text-xs text-fg-subtle">{row.b.requester_name}</span>
                </button>
              </li>
            ) : (
              <li key={`free-${row.start}`}>
                <button
                  type="button"
                  onClick={() => {
                    const startMin = minutesIntoDay(row.start, tz);
                    openBooking({ dayKey: today, startMin, endMin: Math.min(startMin + 60, minutesIntoDay(row.end, tz)) });
                  }}
                  className="group flex w-full items-center gap-2 rounded-md border border-dashed border-line-strong px-3 py-2 text-left text-xs text-fg-subtle transition-colors hover:border-primary hover:text-accent"
                >
                  <Plus className="size-3.5" aria-hidden />
                  <span className="font-mono">{formatRange(row.start, row.end, tz)}</span>
                  <span className="ml-auto">Free · {formatDuration((row.end - row.start) / 60_000)}</span>
                </button>
              </li>
            ),
          )}
        </ol>
      )}
    </section>
  );
}
