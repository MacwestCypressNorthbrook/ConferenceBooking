import { describe, expect, test } from "bun:test";
import {
  checkSlot, dayKeyOf, freeGaps, layoutLanes, spaceStatusNow, suggestSlots, weekStart, zonedInstant,
} from "./schedule";
import type { SpaceSettings, Slot } from "./types";

const s: SpaceSettings = {
  name: "Hall", location: null, description: null, capacity: 40, timezone: "Africa/Lagos",
  open_time: "08:00:00", close_time: "18:00:00", open_days: [1, 2, 3, 4, 5], slot_minutes: 30,
  min_duration_minutes: 30, max_duration_minutes: 240, max_advance_days: 60, requires_approval: true,
  amenities: [], allowed_email_domains: [],
};
const tz = s.timezone;
const MON = "2026-10-05"; // a Monday
const at = (day: string, hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return zonedInstant(day, h * 60 + m, tz);
};
let n = 0;
const booking = (from: string, to: string, status: Slot["status"] = "confirmed", day = MON): Slot => ({
  id: String(++n),
  starts_at: new Date(at(day, from)).toISOString(), ends_at: new Date(at(day, to)).toISOString(),
  status,
});
const NOW = at("2026-10-02", "12:00"); // the Friday before

describe("timezone helpers", () => {
  test("zonedInstant uses the space's wall clock (Lagos is UTC+1)", () => {
    expect(new Date(at(MON, "09:00")).toISOString()).toBe("2026-10-05T08:00:00.000Z");
    expect(dayKeyOf(at(MON, "00:30"), tz)).toBe(MON);
  });
  test("weekStart is Monday", () => {
    expect(weekStart("2026-10-08")).toBe(MON);
    expect(weekStart("2026-10-11")).toBe(MON); // Sunday
  });
});

describe("checkSlot", () => {
  const confirmed = booking("10:00", "11:00");
  const pending = booking("14:00", "15:00", "pending");
  const all = [confirmed, pending];
  const span = (a: string, b: string, day = MON) => ({ start: at(day, a), end: at(day, b) });

  test("free slot", () => expect(checkSlot(span("08:00", "09:00"), all, s, NOW).state).toBe("free"));
  test("back-to-back is free", () => expect(checkSlot(span("11:00", "12:00"), all, s, NOW).state).toBe("free"));
  test("clash with confirmed offers nearest alternatives", () => {
    const r = checkSlot(span("10:30", "11:30"), all, s, NOW);
    expect(r.state).toBe("taken");
    if (r.state !== "taken") return;
    expect(r.clash.id).toBe(confirmed.id);
    expect(r.suggestions.map((x) => dayKeyOf(x.start, tz))).toEqual([MON, MON, MON]);
    expect(r.suggestions.every((x) => x.end - x.start === 3_600_000)).toBe(true);
    expect(r.suggestions.some((x) => x.start === at(MON, "11:00"))).toBe(true);
  });
  test("alternatives to a clash skip time others have requested", () => {
    const r = checkSlot(span("13:30", "14:30"), [booking("13:00", "14:00"), booking("14:00", "15:00", "pending")], s, NOW);
    if (r.state !== "taken") throw new Error(r.state);
    expect(r.suggestions.every((x) => !(x.start < at(MON, "15:00") && at(MON, "14:00") < x.end))).toBe(true);
  });
  test("pending overlap is allowed but reported", () => {
    const r = checkSlot(span("14:30", "15:30"), all, s, NOW);
    expect(r.state).toBe("free");
    if (r.state === "free") expect(r.pending.map((p) => p.id)).toEqual([pending.id]);
  });
  test("rules", () => {
    expect(checkSlot(span("07:30", "08:30"), all, s, NOW).state).toBe("invalid");
    expect(checkSlot(span("17:30", "18:30"), all, s, NOW).state).toBe("invalid");
    expect(checkSlot(span("10:00", "11:00", "2026-10-03"), all, s, NOW).state).toBe("invalid"); // Saturday
    expect(checkSlot(span("08:00", "13:00"), all, s, NOW).state).toBe("invalid"); // 5h
    expect(checkSlot(span("10:00", "11:00", "2026-10-02"), all, s, NOW).state).toBe("invalid"); // past
  });
  test("full day suggests the next open day", () => {
    const full = [booking("08:00", "12:00"), booking("12:00", "16:00"), booking("16:00", "18:00")];
    const r = suggestSlots(span("09:00", "10:00"), full, s, NOW);
    expect(dayKeyOf(r[0].start, tz)).toBe("2026-10-06");
    expect(r[0].start).toBe(at("2026-10-06", "08:00"));
  });
});

describe("freeGaps / status", () => {
  test("gaps skip past time today and snap to the slot grid", () => {
    const now = at(MON, "09:10");
    const g = freeGaps(MON, [booking("10:00", "11:00")], s, now);
    expect(g.map((x) => [x.start, x.end])).toEqual([
      [at(MON, "09:30"), at(MON, "10:00")],
      [at(MON, "11:00"), at(MON, "18:00")],
    ]);
  });
  test("in use follows back-to-back bookings", () => {
    const r = spaceStatusNow([booking("09:00", "10:00"), booking("10:00", "11:30")], s, at(MON, "09:15"));
    expect(r.kind).toBe("in_use");
    if (r.kind === "in_use") expect(r.freeAt).toBe(at(MON, "11:30"));
  });
  test("free until the next confirmed booking", () => {
    const r = spaceStatusNow([booking("13:30", "14:00"), booking("12:00", "13:00", "pending")], s, at(MON, "11:00"));
    expect(r).toMatchObject({ kind: "free", until: at(MON, "13:30") });
  });
  test("closed on Friday evening reopens Monday", () => {
    const r = spaceStatusNow([], s, at("2026-10-02", "19:00"));
    expect(r).toEqual({ kind: "closed", opensAt: at(MON, "08:00") });
  });
});

test("layoutLanes puts overlapping items side by side", () => {
  const out = layoutLanes([{ start: 0, end: 10 }, { start: 5, end: 15 }, { start: 20, end: 30 }]);
  expect(out.map((o) => [o.lane, o.lanes])).toEqual([[0, 2], [1, 2], [0, 1]]);
});
