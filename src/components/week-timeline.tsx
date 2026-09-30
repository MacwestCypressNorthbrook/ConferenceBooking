"use client";

import { Plus } from "lucide-react";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useBooking } from "@/components/booking/booking-provider";
import { cn } from "@/components/ui";
import { useNow } from "@/components/use-now";
import {
  dayKeyOf,
  formatDay,
  formatMinutes,
  formatTime,
  layoutLanes,
  minutesIntoDay,
  openHours,
  toSpan,
  zonedInstant,
} from "@/lib/schedule";
import type { Booking, Slot } from "@/lib/types";

const PX_PER_MIN = 1.1;

type Drag = { day: string; anchor: number; current: number };

export function WeekTimeline({
  days,
  bookings,
  initialDay,
}: {
  days: string[];
  /** Full bookings for admins; anonymous slots on the public page. */
  bookings: Slot[];
  initialDay: string;
}) {
  const { settings: s, viewer, serverNow, openBooking, showDetails } = useBooking();
  const now = useNow(serverNow, 60_000);
  const tz = s.timezone;
  const { open, close } = openHours(s);
  const slot = s.slot_minutes;
  const [activeDay, setActiveDay] = useState(initialDay);
  const [drag, setDrag] = useState<Drag | null>(null);
  const today = dayKeyOf(now, tz);
  const height = (close - open) * PX_PER_MIN;

  const isAdmin = viewer?.role === "admin";
  const byDay = new Map<string, Slot[]>(days.map((d) => [d, []]));
  for (const b of bookings) byDay.get(dayKeyOf(Date.parse(b.starts_at), tz))?.push(b);

  /** Minutes (on that day) covered by confirmed bookings — the only hard blocks. */
  const confirmedSpans = useCallback(
    (day: string) =>
      (byDay.get(day) ?? [])
        .filter((b) => b.status === "confirmed")
        .map((b) => ({ start: minutesIntoDay(Date.parse(b.starts_at), tz), end: minutesIntoDay(Date.parse(b.ends_at), tz) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookings, tz],
  );

  const bookable = useCallback(
    (day: string, m: number) =>
      zonedInstant(day, m, tz) >= now && !confirmedSpans(day).some((b) => m < b.end && m + slot > b.start),
    [confirmedSpans, now, slot, tz],
  );

  const openAt = useCallback(
    (day: string, startMin: number, endMin?: number) => {
      if (endMin === undefined) {
        // A single click: offer an hour, stopping short of the next confirmed booking.
        const nextBusy = Math.min(close, ...confirmedSpans(day).filter((b) => b.start >= startMin + slot).map((b) => b.start));
        endMin = Math.min(startMin + Math.max(60, s.min_duration_minutes), nextBusy);
      }
      if (endMin - startMin < s.min_duration_minutes) endMin = Math.min(startMin + s.min_duration_minutes, close);
      openBooking({ dayKey: day, startMin, endMin });
    },
    [close, confirmedSpans, openBooking, s.min_duration_minutes, slot],
  );

  // Finish a drag wherever the pointer is released.
  useEffect(() => {
    if (!drag) return;
    const finish = () => {
      const start = Math.min(drag.anchor, drag.current);
      const end = Math.max(drag.anchor, drag.current) + slot;
      setDrag(null);
      openAt(drag.day, start, end - start <= slot ? undefined : end);
    };
    window.addEventListener("pointerup", finish);
    return () => window.removeEventListener("pointerup", finish);
  }, [drag, openAt, slot]);

  const onColumnMove = (e: React.PointerEvent<HTMLDivElement>, day: string) => {
    if (!drag || drag.day !== day) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const target = open + Math.floor((e.clientY - rect.top) / PX_PER_MIN / slot) * slot;
    const clamped = Math.max(open, Math.min(close - slot, target));
    // Extend the selection until it would run into something unbookable.
    const step = clamped >= drag.anchor ? slot : -slot;
    let current = drag.anchor;
    while (current !== clamped && bookable(day, current + step)) current += step;
    if (current !== drag.current) setDrag({ ...drag, current });
  };

  const hourMarks: number[] = [];
  for (let m = Math.ceil(open / 60) * 60; m <= close; m += 60) hourMarks.push(m);
  const nowMin = minutesIntoDay(now, tz);
  const nowVisible = days.includes(today) && nowMin >= open && nowMin <= close;

  return (
    <div className="rounded-lg border border-line bg-surface">
      {/* Mobile: pick a day */}
      <div className="flex gap-1 overflow-x-auto border-b border-line p-2 md:hidden" role="tablist" aria-label="Day">
        {days.map((d) => {
          const count = byDay.get(d)?.length ?? 0;
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={d === activeDay}
              onClick={() => setActiveDay(d)}
              className={cn(
                "flex min-w-14 flex-1 flex-col items-center rounded-md py-1.5 transition-colors",
                d === activeDay ? "bg-primary text-on-primary" : "text-fg-muted hover:bg-surface-2",
              )}
            >
              <span className="text-[11px]">{formatDay(d, "EEE")}</span>
              <span className="font-mono text-base font-semibold">{formatDay(d, "d")}</span>
              <span className={cn("mt-0.5 size-1 rounded-full", count ? (d === activeDay ? "bg-on-primary" : "bg-accent") : "bg-transparent")} />
            </button>
          );
        })}
      </div>

      <div
        className="grid grid-cols-[52px_1fr] md:grid-cols-[56px_repeat(var(--cols),minmax(0,1fr))]"
        style={{ "--cols": days.length } as CSSProperties}
      >
        {/* Header row */}
        <div className="sticky top-14 z-20 hidden rounded-tl-lg border-b border-line bg-surface md:block lg:top-0" />
        {days.map((d) => {
          const list = byDay.get(d) ?? [];
          const confirmed = list.filter((b) => b.status === "confirmed").length;
          const pending = list.length - confirmed;
          return (
            <div
              key={d}
              className={cn(
                "sticky top-14 z-20 hidden border-b border-l border-line bg-surface px-3 py-2.5 md:block lg:top-0",
                d === today && "bg-primary-soft",
              )}
            >
              <div className="flex items-baseline gap-1.5">
                <span className={cn("text-xs", d === today ? "font-medium text-accent" : "text-fg-muted")}>{formatDay(d, "EEE")}</span>
                <span className={cn("font-mono text-lg font-semibold", d === today ? "text-accent" : "text-fg")}>{formatDay(d, "d")}</span>
                {d === today && (
                  <span className="ml-auto rounded bg-primary px-1.5 font-mono text-[9px] leading-4 font-semibold uppercase tracking-wider text-on-primary">
                    Today
                  </span>
                )}
              </div>
              <p className="mt-0.5 truncate font-mono text-[10px] text-fg-subtle">
                {list.length === 0 ? "Free all day" : [confirmed && `${confirmed} booked`, pending && `${pending} requested`].filter(Boolean).join(" · ")}
              </p>
            </div>
          );
        })}

        {/* Time gutter */}
        <div className="relative select-none" style={{ height }} aria-hidden>
          {hourMarks.map((m) => (
            <span
              key={m}
              className="absolute right-2 -translate-y-1/2 font-mono text-[10px] text-fg-subtle"
              style={{ top: (m - open) * PX_PER_MIN }}
            >
              {m === open ? "" : formatMinutes(m).replace(":00", "")}
            </span>
          ))}
          {nowVisible && (
            <span
              className="absolute right-1 z-10 -translate-y-1/2 rounded bg-primary px-1 font-mono text-[9px] leading-4 text-on-primary"
              style={{ top: (nowMin - open) * PX_PER_MIN }}
            >
              {formatTime(now, tz).replace(" ", "")}
            </span>
          )}
        </div>

        {days.map((d) => {
          const dayBookings = byDay.get(d) ?? [];
          const isPastDay = d < today;
          const pastHeight = isPastDay ? height : d === today ? Math.max(0, Math.min(close, nowMin) - open) * PX_PER_MIN : 0;
          const selection = drag?.day === d && {
            start: Math.min(drag.anchor, drag.current),
            end: Math.max(drag.anchor, drag.current) + slot,
          };
          const slots: number[] = [];
          for (let m = open; m < close; m += slot) slots.push(m);

          return (
            <div
              key={d}
              onPointerMove={(e) => onColumnMove(e, d)}
              className={cn("relative border-l border-line", d !== activeDay && "hidden md:block", drag && "select-none")}
              style={{ height }}
            >
              {/* Grid lines */}
              {hourMarks.map((m) => (
                <div key={m} className="absolute inset-x-0 border-t border-line" style={{ top: (m - open) * PX_PER_MIN }} aria-hidden />
              ))}
              {pastHeight > 0 && <div className="hatch absolute inset-x-0 top-0" style={{ height: pastHeight }} aria-hidden />}

              {/* Free slots: click for an hour, drag for a custom range */}
              {slots.map((m) =>
                bookable(d, m) ? (
                  <button
                    key={m}
                    type="button"
                    tabIndex={-1}
                    aria-label={`Book ${formatDay(d, "EEEE d MMMM")} from ${formatMinutes(m)}`}
                    onPointerDown={(e) => {
                      if (e.pointerType === "touch") return; // let touch scroll; a tap arrives as a click
                      e.preventDefault();
                      setDrag({ day: d, anchor: m, current: m });
                    }}
                    onClick={(e) => {
                      // Mouse and pen are handled by the drag; this covers touch taps.
                      const type = (e.nativeEvent as PointerEvent).pointerType;
                      if (type !== "mouse" && type !== "pen") openAt(d, m);
                    }}
                    className="group absolute inset-x-0 z-[1] flex items-start px-2 pt-0.5 transition-colors hover:bg-primary-soft/70"
                    style={{ top: (m - open) * PX_PER_MIN, height: slot * PX_PER_MIN }}
                  >
                    <span className="hidden items-center gap-0.5 font-mono text-[10px] text-accent group-hover:flex">
                      <Plus className="size-3" aria-hidden /> {formatMinutes(m)}
                    </span>
                  </button>
                ) : null,
              )}

              {selection && (
                <div
                  className="pointer-events-none absolute inset-x-1 z-10 rounded-md border-2 border-dashed border-primary bg-primary-soft px-2 py-1"
                  style={{ top: (selection.start - open) * PX_PER_MIN, height: (selection.end - selection.start) * PX_PER_MIN }}
                >
                  <span className="font-mono text-[11px] font-medium text-accent">
                    {formatMinutes(selection.start)} – {formatMinutes(selection.end)}
                  </span>
                </div>
              )}

              {layoutLanes(dayBookings.map((b) => ({ ...toSpan(b), b }))).map(({ item, lane, lanes }) => {
                const b = item.b;
                const startMin = Math.max(open, minutesIntoDay(item.start, tz));
                const endMin = Math.min(close, minutesIntoDay(item.end, tz));
                const h = Math.max((endMin - startMin) * PX_PER_MIN - 2, 20);
                const pending = b.status === "pending";
                const label = pending ? "Requested" : isAdmin ? "Confirmed" : "Booked";
                const range = `${formatTime(item.start, tz)} – ${formatTime(item.end, tz)}`;
                const full = isAdmin && "requester_name" in b ? (b as Booking) : null;
                const Block = full ? "button" : "div";
                return (
                  <Block
                    key={b.id}
                    {...(full ? { type: "button" as const, onClick: () => showDetails(full) } : {})}
                    aria-label={`${b.title ?? label}, ${range}${pending ? ", awaiting approval" : ""}`}
                    className={cn(
                      "absolute z-[2] overflow-hidden rounded-md border border-l-[3px] px-2 py-1 text-left",
                      full && "transition-shadow hover:shadow-pop focus-visible:z-10",
                      pending ? "border-dashed border-warn-line border-l-warn bg-warn-bg" : "border-ok-line border-l-ok bg-ok-bg",
                      item.end <= now && "opacity-55",
                    )}
                    style={{
                      top: (startMin - open) * PX_PER_MIN + 1,
                      height: h,
                      left: `calc(${(lane / lanes) * 100}% + 3px)`,
                      width: `calc(${100 / lanes}% - 6px)`,
                    }}
                  >
                    {h < 40 ? (
                      <p className="truncate text-[11px] leading-4">
                        <span className="font-medium text-fg">{b.title ?? label}</span>{" "}
                        <span className="font-mono text-[10px] text-fg-muted">{formatTime(item.start, tz)}</span>
                      </p>
                    ) : (
                      <>
                        <p className={cn("font-mono text-[9.5px] font-medium uppercase tracking-wider", pending ? "text-warn-fg" : "text-ok-fg")}>
                          {label}
                        </p>
                        {b.title && <p className="truncate text-xs leading-4 font-medium text-fg">{b.title}</p>}
                        <p className="truncate font-mono text-[10px] text-fg-muted">{range}</p>
                        {h >= 72 && full && <p className="mt-0.5 truncate text-[11px] text-fg-muted">{full.requester_name}</p>}
                      </>
                    )}
                  </Block>
                );
              })}

              {d === today && nowVisible && (
                <div
                  className="pointer-events-none absolute inset-x-0 z-[3] border-t-2 border-primary"
                  style={{ top: (nowMin - open) * PX_PER_MIN }}
                  aria-hidden
                >
                  <span className="absolute -top-[5px] -left-[5px] size-2 rounded-full bg-primary" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
