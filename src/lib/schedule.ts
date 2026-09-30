import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";
import type { SpaceSettings, Slot } from "./types";

/**
 * All scheduling maths happens in the space's own timezone: the room is a
 * physical place, so "9:00" means 9:00 on the wall clock of that building,
 * whatever device the viewer is on.
 *
 * Dates are passed around as "yyyy-MM-dd" day keys and instants as epoch ms.
 * These rules mirror the database trigger so the UI can give instant feedback;
 * the database remains the source of truth.
 */

export type Span = { start: number; end: number };

const MINUTE = 60_000;

export function parseTime(t: string) {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function openHours(s: Pick<SpaceSettings, "open_time" | "close_time">) {
  return { open: parseTime(s.open_time), close: parseTime(s.close_time) };
}

function splitKey(dayKey: string) {
  const [y, m, d] = dayKey.split("-").map(Number);
  return { y, m, d };
}

export function dayKeyOf(ms: number, tz: string) {
  return format(new TZDate(ms, tz), "yyyy-MM-dd");
}

export function zonedInstant(dayKey: string, minutes: number, tz: string) {
  const { y, m, d } = splitKey(dayKey);
  return new TZDate(y, m - 1, d, Math.floor(minutes / 60), minutes % 60, tz).getTime();
}

export function minutesIntoDay(ms: number, tz: string) {
  const t = new TZDate(ms, tz);
  return t.getHours() * 60 + t.getMinutes();
}

export function addDaysToKey(dayKey: string, days: number) {
  const { y, m, d } = splitKey(dayKey);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** ISO weekday: 1 = Monday … 7 = Sunday */
export function isoWeekday(dayKey: string) {
  const { y, m, d } = splitKey(dayKey);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

export function weekStart(dayKey: string) {
  return addDaysToKey(dayKey, 1 - isoWeekday(dayKey));
}

export function isOpenDay(dayKey: string, s: Pick<SpaceSettings, "open_days">) {
  return s.open_days.includes(isoWeekday(dayKey));
}

/** A calendar date for display only — never use for instants. */
export function dayKeyToDate(dayKey: string) {
  const { y, m, d } = splitKey(dayKey);
  return new Date(y, m - 1, d);
}

export function formatDay(dayKey: string, pattern = "EEE d MMM") {
  return format(dayKeyToDate(dayKey), pattern);
}

export function formatTime(ms: number, tz: string) {
  return format(new TZDate(ms, tz), "h:mm a");
}

export function formatMinutes(minutes: number) {
  return format(new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60), "h:mm a");
}

export function formatRange(start: number, end: number, tz: string) {
  return `${formatTime(start, tz)} – ${formatTime(end, tz)}`;
}

export function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function toSpan(b: Pick<Slot, "starts_at" | "ends_at">): Span {
  return { start: Date.parse(b.starts_at), end: Date.parse(b.ends_at) };
}

export function overlaps(a: Span, b: Span) {
  return a.start < b.end && b.start < a.end;
}

/** The first moment you could still start a booking today, snapped to the slot grid. */
function earliestBookableMinute(dayKey: string, s: SpaceSettings, now: number) {
  const { open } = openHours(s);
  if (dayKeyOf(now, s.timezone) !== dayKey) return open;
  const current = minutesIntoDay(now, s.timezone);
  return Math.max(open, Math.ceil(current / s.slot_minutes) * s.slot_minutes);
}

// ---------------------------------------------------------------------------
// Checking a requested slot
// ---------------------------------------------------------------------------

export type SlotCheck<T extends Slot = Slot> =
  | { state: "invalid"; reason: string }
  | { state: "taken"; clash: T; suggestions: Span[] }
  | { state: "free"; pending: T[]; suggestions: Span[] };

export function validateSpan(span: Span, s: SpaceSettings, now: number): string | null {
  const tz = s.timezone;
  const dayKey = dayKeyOf(span.start, tz);
  const { open, close } = openHours(s);
  const startMin = minutesIntoDay(span.start, tz);
  const endMin = dayKeyOf(span.end, tz) === dayKey ? minutesIntoDay(span.end, tz) : Infinity;
  const duration = (span.end - span.start) / MINUTE;

  if (span.end <= span.start) return "End time must be after the start time.";
  if (span.start < now) return "That time has already passed.";
  if (!isOpenDay(dayKey, s)) return `The space is closed on ${formatDay(dayKey, "EEEE")}s.`;
  if (startMin < open || endMin > close)
    return `Bookings must fall between ${formatMinutes(open)} and ${formatMinutes(close)}.`;
  if (duration < s.min_duration_minutes)
    return `The shortest booking is ${formatDuration(s.min_duration_minutes)}.`;
  if (duration > s.max_duration_minutes)
    return `The longest booking is ${formatDuration(s.max_duration_minutes)}.`;
  if (span.start > now + s.max_advance_days * 24 * 60 * MINUTE)
    return `You can book up to ${s.max_advance_days} days ahead.`;
  return null;
}

export function checkSlot<T extends Slot>(
  span: Span,
  bookings: T[],
  s: SpaceSettings,
  now: number,
): SlotCheck<T> {
  const invalid = validateSpan(span, s, now);
  if (invalid) return { state: "invalid", reason: invalid };

  const overlapping = bookings.filter((b) => overlaps(span, toSpan(b)));
  const clash = overlapping.find((b) => b.status === "confirmed");
  if (clash) {
    // Prefer times nobody has asked for; fall back to ones with a pending request.
    const uncontested = suggestSlots(span, bookings, s, now, { avoidPending: true });
    return { state: "taken", clash, suggestions: uncontested.length ? uncontested : suggestSlots(span, bookings, s, now) };
  }

  const pending = overlapping.filter((b) => b.status === "pending");
  return {
    state: "free",
    pending,
    suggestions: pending.length ? suggestSlots(span, bookings, s, now, { avoidPending: true }) : [],
  };
}

/** Free stretches of an open day, after removing confirmed (and optionally pending) bookings. */
export function freeGaps(
  dayKey: string,
  bookings: Slot[],
  s: SpaceSettings,
  now: number,
  { avoidPending = false } = {},
): Span[] {
  if (!isOpenDay(dayKey, s)) return [];
  const tz = s.timezone;
  const { close } = openHours(s);
  const from = earliestBookableMinute(dayKey, s, now);
  if (from >= close) return [];

  const dayStart = zonedInstant(dayKey, from, tz);
  const dayEnd = zonedInstant(dayKey, close, tz);
  const busy = bookings
    .filter((b) => b.status === "confirmed" || (avoidPending && b.status === "pending"))
    .map(toSpan)
    .filter((b) => overlaps(b, { start: dayStart, end: dayEnd }))
    .sort((a, b) => a.start - b.start);

  const gaps: Span[] = [];
  let cursor = dayStart;
  for (const b of busy) {
    if (b.start > cursor) gaps.push({ start: cursor, end: b.start });
    cursor = Math.max(cursor, b.end);
  }
  if (cursor < dayEnd) gaps.push({ start: cursor, end: dayEnd });
  return gaps;
}

/**
 * Up to three alternatives with the same length: the closest free starts on
 * the same day, or the earliest ones on the next open day that has room.
 */
export function suggestSlots(
  span: Span,
  bookings: Slot[],
  s: SpaceSettings,
  now: number,
  opts: { avoidPending?: boolean } = {},
): Span[] {
  const tz = s.timezone;
  const duration = span.end - span.start;
  const step = s.slot_minutes * MINUTE;
  const startDay = dayKeyOf(span.start, tz);
  const lastDay = dayKeyOf(now + s.max_advance_days * 24 * 60 * MINUTE, tz);

  const candidatesFor = (dayKey: string) => {
    const out: Span[] = [];
    for (const gap of freeGaps(dayKey, bookings, s, now, opts)) {
      for (let t = gap.start; t + duration <= gap.end; t += step) {
        out.push({ start: t, end: t + duration });
      }
    }
    return out;
  };

  const sameDay = candidatesFor(startDay)
    .filter((c) => c.start !== span.start)
    .sort((a, b) => Math.abs(a.start - span.start) - Math.abs(b.start - span.start))
    .slice(0, 3)
    .sort((a, b) => a.start - b.start);
  if (sameDay.length) return sameDay;

  for (let i = 1, day = addDaysToKey(startDay, 1); i <= 14 && day <= lastDay; i++, day = addDaysToKey(day, 1)) {
    const found = candidatesFor(day);
    if (found.length) return found.slice(0, 3);
  }
  return [];
}

// ---------------------------------------------------------------------------
// "Is the space free right now?"
// ---------------------------------------------------------------------------

export type SpaceNow =
  | { kind: "in_use"; booking: Slot; freeAt: number | null }
  | { kind: "free"; until: number; next: Slot | null }
  | { kind: "closed"; opensAt: number | null };

function nextOpening(fromDayKey: string, s: SpaceSettings) {
  const { open } = openHours(s);
  for (let i = 1; i <= 14; i++) {
    const day = addDaysToKey(fromDayKey, i);
    if (isOpenDay(day, s)) return zonedInstant(day, open, s.timezone);
  }
  return null;
}

export function spaceStatusNow(bookings: Slot[], s: SpaceSettings, now: number): SpaceNow {
  const tz = s.timezone;
  const today = dayKeyOf(now, tz);
  const { open, close } = openHours(s);
  const minute = minutesIntoDay(now, tz);

  if (!isOpenDay(today, s) || minute >= close) return { kind: "closed", opensAt: nextOpening(today, s) };
  if (minute < open) return { kind: "closed", opensAt: zonedInstant(today, open, tz) };

  const closeAt = zonedInstant(today, close, tz);
  const confirmed = bookings
    .filter((b) => b.status === "confirmed" && Date.parse(b.ends_at) > now)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));

  const current = confirmed.find((b) => Date.parse(b.starts_at) <= now);
  if (current) {
    // Follow back-to-back bookings to find when the space actually frees up.
    let freeAt = Date.parse(current.ends_at);
    for (const b of confirmed) {
      if (Date.parse(b.starts_at) <= freeAt) freeAt = Math.max(freeAt, Date.parse(b.ends_at));
    }
    return { kind: "in_use", booking: current, freeAt: freeAt >= closeAt ? null : freeAt };
  }

  const next = confirmed.find((b) => Date.parse(b.starts_at) < closeAt) ?? null;
  return { kind: "free", until: next ? Date.parse(next.starts_at) : closeAt, next };
}

// ---------------------------------------------------------------------------
// Timeline layout: side-by-side lanes for overlapping (pending) requests
// ---------------------------------------------------------------------------

export function layoutLanes<T extends Span>(items: T[]) {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const placed: { item: T; lane: number; lanes: number }[] = [];
  let cluster: typeof placed = [];
  let clusterEnd = -Infinity;
  let laneEnds: number[] = [];

  const flush = () => {
    const lanes = laneEnds.length || 1;
    cluster.forEach((p) => (p.lanes = lanes));
    placed.push(...cluster);
    cluster = [];
    laneEnds = [];
  };

  for (const item of sorted) {
    if (item.start >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= item.start);
    if (lane === -1) lane = laneEnds.push(item.end) - 1;
    else laneEnds[lane] = item.end;
    cluster.push({ item, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  flush();
  return placed;
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** [1,2,3,4,5] → "Mon–Fri"; [1,3,5] → "Mon, Wed, Fri" */
export function describeDays(days: number[]) {
  const sorted = [...days].sort((a, b) => a - b);
  const contiguous = sorted.every((d, i) => i === 0 || d === sorted[i - 1] + 1);
  if (contiguous && sorted.length > 2) return `${DAY_NAMES[sorted[0] - 1]}–${DAY_NAMES[sorted.at(-1)! - 1]}`;
  return sorted.map((d) => DAY_NAMES[d - 1]).join(", ");
}
