"use client";

import { ChevronRight, Users } from "lucide-react";
import { useBooking } from "@/components/booking/booking-provider";
import { StatusBadge, cn } from "@/components/ui";
import { dayKeyOf, formatDay, formatRange } from "@/lib/schedule";
import type { Booking } from "@/lib/types";

export function BookingRow({ booking: b, expired, showOrganizer }: { booking: Booking; expired?: boolean; showOrganizer?: boolean }) {
  const { settings, showDetails } = useBooking();
  const tz = settings.timezone;
  const start = Date.parse(b.starts_at);
  const day = dayKeyOf(start, tz);
  const inactive = b.status === "cancelled" || b.status === "declined" || expired;

  return (
    <li>
      <button
        type="button"
        onClick={() => showDetails(b)}
        className="group flex w-full items-start gap-4 px-4 py-3.5 text-left transition-colors hover:bg-surface-2 sm:items-center"
      >
        <div className={cn("w-12 shrink-0 text-center", inactive && "opacity-50")}>
          <p className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle">{formatDay(day, "MMM")}</p>
          <p className="font-mono text-xl leading-6 font-semibold">{formatDay(day, "d")}</p>
          <p className="text-[11px] text-fg-subtle">{formatDay(day, "EEE")}</p>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={cn("truncate font-medium", inactive && "text-fg-muted line-through decoration-fg-subtle/50")}>{b.title}</p>
            <StatusBadge status={expired ? "expired" : b.status} />
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 font-mono text-xs text-fg-muted">
            <span>{formatRange(start, Date.parse(b.ends_at), tz)}</span>
            <span className="flex items-center gap-1">
              <Users className="size-3" aria-hidden /> {b.attendees}
            </span>
            {showOrganizer && <span className="font-sans">{b.requester_name}</span>}
          </p>
          {b.decision_note && (b.status === "declined" || b.status === "cancelled" || b.status === "confirmed") && (
            <p className="mt-1.5 rounded border border-line bg-canvas px-2 py-1 text-[13px] text-fg-muted">
              <span className="font-medium text-fg">Admin note:</span> {b.decision_note}
            </p>
          )}
        </div>
        <ChevronRight className="mt-1 size-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 sm:mt-0" aria-hidden />
      </button>
    </li>
  );
}
