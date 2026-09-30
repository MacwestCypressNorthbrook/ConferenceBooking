"use client";

import { ArrowRight } from "lucide-react";
import { useBooking } from "@/components/booking/booking-provider";
import { cn } from "@/components/ui";
import { useNow } from "@/components/use-now";
import { dayKeyOf, formatDay, formatTime, minutesIntoDay, openHours, spaceStatusNow, type SpaceNow } from "@/lib/schedule";
import type { SpaceSettings, Slot } from "@/lib/types";

function describe(status: SpaceNow, s: SpaceSettings, now: number) {
  const tz = s.timezone;
  const when = (ms: number) =>
    dayKeyOf(ms, tz) === dayKeyOf(now, tz) ? formatTime(ms, tz) : `${formatDay(dayKeyOf(ms, tz), "EEE")} ${formatTime(ms, tz)}`;

  switch (status.kind) {
    case "free":
      return {
        tone: "ok" as const,
        label: "Free now",
        detail: status.next ? `until ${formatTime(status.until, tz)}` : "for the rest of the day",
        bookFrom: now,
      };
    case "in_use":
      return {
        tone: "busy" as const,
        label: "In use",
        detail: status.freeAt ? `free at ${formatTime(status.freeAt, tz)}` : "until closing",
        context: status.booking.title,
        bookFrom: status.freeAt,
      };
    case "closed":
      return {
        tone: "closed" as const,
        label: "Closed",
        detail: status.opensAt ? `opens ${when(status.opensAt)}` : "",
        bookFrom: status.opensAt,
      };
  }
}

const tones = {
  ok: { dot: "bg-ok", ring: "border-ok-line bg-ok-bg text-ok-fg" },
  busy: { dot: "bg-bad", ring: "border-bad-line bg-bad-bg text-bad-fg" },
  closed: { dot: "bg-fg-subtle", ring: "border-line bg-surface-2 text-fg-muted" },
};

export function SpaceStatus({
  todayBookings,
  variant = "pill",
}: {
  todayBookings: Slot[];
  variant?: "pill" | "card";
}) {
  const { settings: s, serverNow, openBooking } = useBooking();
  const now = useNow(serverNow);
  const status = spaceStatusNow(todayBookings, s, now);
  const d = describe(status, s, now);
  const tone = tones[d.tone];

  if (variant === "pill") {
    return (
      <span className={cn("inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium", tone.ring)}>
        <span className="relative flex size-2">
          {d.tone === "ok" && <span className={cn("absolute inset-0 animate-ping rounded-full opacity-60 motion-reduce:hidden", tone.dot)} />}
          <span className={cn("relative size-2 rounded-full", tone.dot)} />
        </span>
        {d.label}
        {d.detail && <span className="font-normal opacity-80">· {d.detail}</span>}
      </span>
    );
  }

  const bookFrom = () => {
    if (!d.bookFrom) return openBooking();
    const dayKey = dayKeyOf(d.bookFrom, s.timezone);
    const minute = minutesIntoDay(d.bookFrom, s.timezone);
    const startMin = Math.max(openHours(s).open, Math.ceil(minute / s.slot_minutes) * s.slot_minutes);
    openBooking({ dayKey, startMin, flexible: true });
  };

  return (
    <div className={cn("flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center", tone.ring)}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="relative flex size-3 shrink-0">
          {d.tone === "ok" && <span className={cn("absolute inset-0 animate-ping rounded-full opacity-60 motion-reduce:hidden", tone.dot)} />}
          <span className={cn("relative size-3 rounded-full", tone.dot)} />
        </span>
        <p className="min-w-0 text-fg">
          <span className="font-semibold">{d.label}</span> <span className="text-fg-muted">{d.detail}</span>
          {"context" in d && d.context && <span className="block truncate text-sm text-fg-muted">“{d.context}” is on right now</span>}
        </p>
      </div>
      {d.bookFrom && (
        <button
          type="button"
          onClick={bookFrom}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-surface px-3.5 text-sm font-medium text-fg shadow-sm ring-1 ring-line-strong transition hover:ring-fg-subtle"
        >
          {d.tone === "ok" ? "Book it now" : `Book from ${formatTime(Math.max(d.bookFrom, now), s.timezone)}`}
          <ArrowRight className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
