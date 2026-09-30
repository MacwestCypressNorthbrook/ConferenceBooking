"use client";

import { Sparkles } from "lucide-react";
import { useBooking } from "@/components/booking/booking-provider";
import { useNow } from "@/components/use-now";
import { addDaysToKey, dayKeyOf, formatDay, formatDuration, formatRange, freeGaps, minutesIntoDay } from "@/lib/schedule";
import type { Slot } from "@/lib/types";

/** The next few stretches of time nobody has booked or requested — one tap to book. */
export function FreeWindows({ upcoming }: { upcoming: Slot[] }) {
  const { settings: s, serverNow, openBooking } = useBooking();
  const now = useNow(serverNow, 60_000);
  const tz = s.timezone;
  const today = dayKeyOf(now, tz);
  const minMs = s.min_duration_minutes * 60_000;

  const windows: { day: string; start: number; end: number }[] = [];
  for (let i = 0, day = today; i < 14 && windows.length < 4; i++, day = addDaysToKey(day, 1)) {
    for (const g of freeGaps(day, upcoming, s, now, { avoidPending: true })) {
      if (g.end - g.start >= minMs && windows.length < 4) windows.push({ day, ...g });
    }
  }
  if (!windows.length) return null;

  return (
    <section aria-labelledby="free-heading" className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <h2 id="free-heading" className="flex shrink-0 items-center gap-1.5 text-[13px] font-medium text-fg-muted">
        <Sparkles className="size-3.5 text-teal" aria-hidden /> Next free
      </h2>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
        {windows.map((w) => {
          const startMin = minutesIntoDay(w.start, tz);
          const endMin = Math.min(startMin + Math.max(60, s.min_duration_minutes), minutesIntoDay(w.end, tz));
          return (
            <button
              key={w.start}
              type="button"
              onClick={() => openBooking({ dayKey: w.day, startMin, endMin })}
              className="flex h-9 shrink-0 items-center gap-2 rounded-md border border-line bg-surface px-3 text-[13px] transition-colors hover:border-primary hover:text-accent"
            >
              <span className="font-medium">{w.day === today ? "Today" : formatDay(w.day, "EEE d")}</span>
              <span className="font-mono text-xs text-fg-muted">{formatRange(w.start, w.end, tz)}</span>
              <span className="hidden font-mono text-[10px] text-fg-subtle md:inline">
                {formatDuration((w.end - w.start) / 60_000)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
