"use client";

import {
  AlertTriangle,
  ArrowRight,
  CalendarCheck2,
  MailCheck,
  CalendarClock,
  CheckCircle2,
  Info,
  Loader2,
  Users,
  X,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { loadSlots, requestBooking } from "@/app/actions";
import { Modal } from "@/components/modal";
import { toast } from "@/components/toast";
import { Field, buttonClass, cn, inputClass } from "@/components/ui";
import { useNow } from "@/components/use-now";
import {
  addDaysToKey,
  checkSlot,
  dayKeyOf,
  formatDay,
  formatDuration,
  formatMinutes,
  formatRange,
  isOpenDay,
  minutesIntoDay,
  openHours,
  zonedInstant,
  type SlotCheck,
  type Span,
} from "@/lib/schedule";
import type { Profile, Slot, SpaceSettings } from "@/lib/types";

/**
 * `flexible` means the person didn't pick this exact time (e.g. "Book the space"),
 * so if it turns out to be taken we quietly move to the next free slot instead.
 */
export type Prefill = { dayKey?: string; startMin?: number; endMin?: number; flexible?: boolean };
type When = { dayKey: string; startMin: number; endMin: number };

const DURATION_PRESETS = [30, 60, 90, 120, 180, 240];

type Requester = { name: string; email: string; phone: string; department: string };
type Done = { status: string; whenLabel: string; email: string; manageUrl?: string };
const REQUESTER_KEY = "space-booking:requester";

/** Admins book on someone's behalf (prefilled with themselves); the public's details are remembered on this device. */
function initialRequester(viewer: Profile | null): Requester {
  if (viewer) return { name: viewer.full_name, email: viewer.email, phone: "", department: viewer.department ?? "" };
  const empty = { name: "", email: "", phone: "", department: "" };
  if (typeof window === "undefined") return empty;
  try {
    return { ...empty, ...JSON.parse(localStorage.getItem(REQUESTER_KEY) ?? "{}") };
  } catch {
    return empty;
  }
}

function rememberRequester(r: Requester) {
  try {
    localStorage.setItem(REQUESTER_KEY, JSON.stringify(r));
  } catch {
    // Private mode or blocked storage: they'll just type it again next time.
  }
}

/** The next slot someone could realistically book: later today, or the next open day. */
function defaultWhen(s: SpaceSettings, now: number): When {
  const { open, close } = openHours(s);
  const duration = Math.min(Math.max(60, s.min_duration_minutes), s.max_duration_minutes);
  let dayKey = dayKeyOf(now, s.timezone);
  let start = Math.max(open, Math.ceil(minutesIntoDay(now, s.timezone) / s.slot_minutes) * s.slot_minutes);

  for (let i = 0; i < 14 && (!isOpenDay(dayKey, s) || start + s.min_duration_minutes > close); i++) {
    dayKey = addDaysToKey(dayKey, 1);
    start = open;
  }
  return { dayKey, startMin: start, endMin: Math.min(start + duration, close) };
}

export function BookingSheet({
  open,
  prefill,
  prefillNonce,
  onClose,
  settings: s,
  viewer,
  serverNow,
}: {
  open: boolean;
  prefill?: Prefill;
  prefillNonce: number;
  onClose: () => void;
  settings: SpaceSettings;
  viewer: Profile | null;
  serverNow: number;
}) {
  const now = useNow(serverNow);
  const tz = s.timezone;
  const { open: openMin, close: closeMin } = openHours(s);
  const isAdmin = viewer?.role === "admin";
  const autoConfirm = isAdmin || !s.requires_approval;

  const [when, setWhen] = useState<When>(() => defaultWhen(s, serverNow));
  const [title, setTitle] = useState("");
  const [attendees, setAttendees] = useState("10");
  const [purpose, setPurpose] = useState("");
  const [needs, setNeeds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [requester, setRequester] = useState<Requester>(() => initialRequester(viewer));
  const [done, setDone] = useState<Done | null>(null);
  const [bookings, setBookings] = useState<{ from: string; items: Slot[] } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Each open applies the new prefill (slot clicked, suggestion, or "next free").
  // Title, purpose and needs are kept as a draft if the sheet is dismissed.
  const [appliedNonce, setAppliedNonce] = useState(prefillNonce);
  const [flexible, setFlexible] = useState(false);
  if (prefillNonce !== appliedNonce) {
    setAppliedNonce(prefillNonce);
    setFlexible(!prefill || !!prefill.flexible);
    const fallback = defaultWhen(s, now);
    const dayKey = prefill?.dayKey ?? fallback.dayKey;
    const startMin = prefill?.startMin ?? (prefill?.dayKey ? openMin : fallback.startMin);
    const duration = Math.min(Math.max(60, s.min_duration_minutes), s.max_duration_minutes);
    const endMin = Math.min(prefill?.endMin ?? startMin + duration, startMin + s.max_duration_minutes, closeMin);
    setWhen({ dayKey, startMin, endMin });
    setServerError(null);
    setDone(null);
  }

  // Load the chosen day plus two weeks ahead, so "next free" suggestions can look forward.
  useEffect(() => {
    if (!open) return;
    let stale = false;
    const from = zonedInstant(when.dayKey, 0, tz);
    const to = zonedInstant(addDaysToKey(when.dayKey, 15), 0, tz);
    loadSlots(from, to)
      .then((result) => {
        if (stale) return;
        if (!result.ok) setServerError(result.error);
        else setBookings({ from: when.dayKey, items: result.data ?? [] });
      })
      .catch(() => !stale && setServerError("Couldn't load the schedule. Check your connection."));
    return () => {
      stale = true;
    };
  }, [open, when.dayKey, tz, reloadKey]);

  useEffect(() => {
    const reload = () => setReloadKey((k) => k + 1);
    window.addEventListener("bookings:changed", reload);
    return () => window.removeEventListener("bookings:changed", reload);
  }, []);

  const span: Span = {
    start: zonedInstant(when.dayKey, when.startMin, tz),
    end: zonedInstant(when.dayKey, when.endMin, tz),
  };
  const loaded = bookings?.from === when.dayKey;
  const check = loaded ? checkSlot(span, bookings.items, s, now) : null;

  if (flexible && check) {
    setFlexible(false);
    if (check.state === "taken" && check.suggestions.length) {
      const next = check.suggestions.find((x) => x.start >= span.start) ?? check.suggestions[0];
      setWhen({ dayKey: dayKeyOf(next.start, tz), startMin: minutesIntoDay(next.start, tz), endMin: minutesIntoDay(next.end, tz) });
    }
  }

  const startOptions = useMemo(() => {
    const out: number[] = [];
    for (let m = openMin; m + s.min_duration_minutes <= closeMin; m += s.slot_minutes) out.push(m);
    return out;
  }, [openMin, closeMin, s.min_duration_minutes, s.slot_minutes]);

  const endOptions = useMemo(() => {
    const out: number[] = [];
    const last = Math.min(when.startMin + s.max_duration_minutes, closeMin);
    for (let m = when.startMin + s.min_duration_minutes; m <= last; m += s.slot_minutes) out.push(m);
    return out;
  }, [when.startMin, closeMin, s.min_duration_minutes, s.max_duration_minutes, s.slot_minutes]);

  const durations = DURATION_PRESETS.filter(
    (d) => d >= s.min_duration_minutes && d <= s.max_duration_minutes && when.startMin + d <= closeMin,
  );
  const duration = when.endMin - when.startMin;

  const setStart = (startMin: number) => {
    const endMin = Math.min(startMin + duration, closeMin);
    setWhen((w) => ({ ...w, startMin, endMin: endMin - startMin < s.min_duration_minutes ? startMin + s.min_duration_minutes : endMin }));
  };

  const applySuggestion = (sug: Span) =>
    setWhen({
      dayKey: dayKeyOf(sug.start, tz),
      startMin: minutesIntoDay(sug.start, tz),
      endMin: minutesIntoDay(sug.end, tz),
    });

  const attendeeCount = Number(attendees);
  const tooMany = attendeeCount > s.capacity;
  const requesterValid = requester.name.trim().length >= 2 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(requester.email.trim());
  const canSubmit =
    check?.state === "free" && title.trim().length >= 3 && attendeeCount >= 1 && !tooMany && requesterValid && !submitting;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setServerError(null);
    const honeypot = (e.currentTarget as HTMLFormElement).elements.namedItem("website") as HTMLInputElement | null;
    const result = await requestBooking({
      title,
      purpose,
      attendees: attendeeCount,
      needs,
      starts_at: new Date(span.start).toISOString(),
      ends_at: new Date(span.end).toISOString(),
      requester_name: requester.name,
      requester_email: requester.email,
      requester_phone: requester.phone,
      requester_department: requester.department,
      website: honeypot?.value,
    });
    setSubmitting(false);

    if (!result.ok) {
      setServerError(result.error);
      setReloadKey((k) => k + 1);
      return;
    }

    const whenLabel = `${formatDay(when.dayKey, "EEE d MMM")}, ${formatRange(span.start, span.end, tz)}`;
    setTitle("");
    setPurpose("");
    setNeeds([]);
    if (isAdmin) {
      toast("success", "Booked", `${whenLabel}. ${requester.name} has been emailed a confirmation.`);
      setRequester(initialRequester(viewer));
      onClose();
      return;
    }
    rememberRequester(requester);
    setDone({ status: result.data?.status ?? "pending", whenLabel, email: requester.email, manageUrl: result.data?.manageUrl });
  }

  const today = dayKeyOf(now, tz);
  const lastDay = dayKeyOf(now + s.max_advance_days * 86_400_000, tz);

  return (
    <Modal open={open} onClose={onClose} labelledBy="booking-sheet-title" variant="sheet">
      {done ? (
        <Success done={done} settings={s} onClose={onClose} onAnother={() => setDone(null)} />
      ) : (
      <form onSubmit={submit} className="flex h-full flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id="booking-sheet-title" className="text-lg font-semibold tracking-[-0.015em]">
              Book {s.name}
            </h2>
            <p className="mt-0.5 font-mono text-xs text-fg-subtle">
              Up to {s.capacity} people · {formatMinutes(openMin)}–{formatMinutes(closeMin)}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-m-1.5 rounded-md p-1.5 text-fg-subtle hover:bg-surface-2 hover:text-fg">
            <X className="size-5" />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <section aria-labelledby="when-heading" className="space-y-4">
            <h3 id="when-heading" className="font-mono text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
              1 · When do you need it?
            </h3>
            <Field label="Date" htmlFor="b-date">
              <input
                id="b-date"
                type="date"
                required
                min={today}
                max={lastDay}
                value={when.dayKey}
                onChange={(e) => e.target.value && setWhen((w) => ({ ...w, dayKey: e.target.value }))}
                className={inputClass}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="From" htmlFor="b-start">
                <select
                  id="b-start"
                  value={when.startMin}
                  onChange={(e) => setStart(Number(e.target.value))}
                  className={cn(inputClass, "font-mono")}
                >
                  {startOptions.map((m) => (
                    <option key={m} value={m}>{formatMinutes(m)}</option>
                  ))}
                </select>
              </Field>
              <Field label="Until" htmlFor="b-end">
                <select
                  id="b-end"
                  value={when.endMin}
                  onChange={(e) => setWhen((w) => ({ ...w, endMin: Number(e.target.value) }))}
                  className={cn(inputClass, "font-mono")}
                >
                  {endOptions.map((m) => (
                    <option key={m} value={m}>
                      {formatMinutes(m)} ({formatDuration(m - when.startMin)})
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {durations.length > 1 && (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Quick duration">
                {durations.map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={duration === d}
                    onClick={() => setWhen((w) => ({ ...w, endMin: w.startMin + d }))}
                    className={cn(
                      "h-8 rounded-full border px-3 font-mono text-xs transition-colors",
                      duration === d
                        ? "border-primary bg-primary-soft text-accent"
                        : "border-line-strong text-fg-muted hover:border-fg-subtle hover:text-fg",
                    )}
                  >
                    {formatDuration(d)}
                  </button>
                ))}
              </div>
            )}

            <Availability check={check} span={span} settings={s} onPick={applySuggestion} />
          </section>

          <section aria-labelledby="what-heading" className="space-y-4">
            <h3 id="what-heading" className="font-mono text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
              2 · What’s the gathering?
            </h3>
            <Field label="Title" htmlFor="b-title" hint="Everyone can see this on the shared schedule.">
              <input
                id="b-title"
                required
                minLength={3}
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Quarterly all-hands"
                className={inputClass}
              />
            </Field>
            <Field
              label="Expected attendees"
              htmlFor="b-attendees"
              hint={tooMany ? undefined : `The space holds up to ${s.capacity}.`}
            >
              <div className="relative">
                <Users className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
                <input
                  id="b-attendees"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={s.capacity}
                  required
                  value={attendees}
                  onChange={(e) => setAttendees(e.target.value)}
                  aria-invalid={tooMany}
                  aria-describedby={tooMany ? "attendees-error" : undefined}
                  className={cn(inputClass, "pl-9 font-mono", tooMany && "border-bad")}
                />
              </div>
              {tooMany && (
                <p id="attendees-error" className="text-xs text-bad-fg">
                  That’s more than the {s.capacity} people the space can hold.
                </p>
              )}
            </Field>
            <Field
              label="Purpose"
              htmlFor="b-purpose"
              hint={autoConfirm ? "Optional." : "Optional, but it helps the admin approve faster."}
            >
              <textarea
                id="b-purpose"
                rows={3}
                maxLength={1000}
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="Agenda, who's attending, anything the admin should know"
                className={cn(inputClass, "h-auto sm:h-auto py-2.5")}
              />
            </Field>
            {s.amenities.length > 0 && (
              <fieldset className="space-y-2">
                <legend className="text-[13px] font-medium">Setup needed</legend>
                <div className="flex flex-wrap gap-2">
                  {s.amenities.map((a) => {
                    const on = needs.includes(a);
                    return (
                      <label
                        key={a}
                        className={cn(
                          "flex min-h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-[13px] transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary",
                          on ? "border-primary bg-primary-soft text-accent" : "border-line-strong text-fg-muted hover:text-fg",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={on}
                          onChange={() => setNeeds((n) => (on ? n.filter((x) => x !== a) : [...n, a]))}
                        />
                        {a}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            )}
          </section>

          <section aria-labelledby="who-heading" className="space-y-4">
            <h3 id="who-heading" className="font-mono text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
              3 · {isAdmin ? "Who is it for?" : "Your details"}
            </h3>
            {!isAdmin && (
              <p className="-mt-2 text-xs text-fg-subtle">No account needed. We&apos;ll email you updates and a link to manage the booking.</p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Full name" htmlFor="b-name">
                <input id="b-name" required autoComplete="name" value={requester.name} onChange={(e) => setRequester((r) => ({ ...r, name: e.target.value }))} className={inputClass} />
              </Field>
              <Field label={isAdmin ? "Their email" : "Work email"} htmlFor="b-email">
                <input id="b-email" type="email" required autoComplete="email" value={requester.email} onChange={(e) => setRequester((r) => ({ ...r, email: e.target.value }))} className={inputClass} />
              </Field>
              <Field label="Department" htmlFor="b-dept">
                <input id="b-dept" autoComplete="organization-title" value={requester.department} onChange={(e) => setRequester((r) => ({ ...r, department: e.target.value }))} placeholder="Optional" className={inputClass} />
              </Field>
              <Field label="Phone" htmlFor="b-phone">
                <input id="b-phone" type="tel" autoComplete="tel" value={requester.phone} onChange={(e) => setRequester((r) => ({ ...r, phone: e.target.value }))} placeholder="Optional" className={inputClass} />
              </Field>
            </div>
            {/* Honeypot: invisible to people and screen readers, tempting to bots. */}
            <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
              <label>
                Website <input name="website" tabIndex={-1} autoComplete="off" />
              </label>
            </div>
          </section>
        </div>

        <footer className="space-y-3 border-t border-line bg-surface px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {serverError && (
            <p role="alert" className="flex gap-2 rounded-md border border-bad-line bg-bad-bg px-3 py-2 text-sm text-bad-fg">
              <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {serverError}
            </p>
          )}
          <div className="flex items-center gap-3">
            <p className="flex-1 text-xs text-fg-subtle">
              {isAdmin
                ? "Confirmed immediately. They'll get an email with the details."
                : autoConfirm
                  ? "Confirmed instantly. We'll email you the details."
                  : "An admin reviews each request. We'll email you the decision."}
            </p>
            <button type="submit" disabled={!canSubmit} className={buttonClass("primary")}>
              {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {autoConfirm ? "Confirm booking" : "Send request"}
            </button>
          </div>
        </footer>
      </form>
      )}
    </Modal>
  );
}

function Availability({
  check,
  span,
  settings: s,
  onPick,
}: {
  check: SlotCheck | null;
  span: Span;
  settings: SpaceSettings;
  onPick: (s: Span) => void;
}) {
  const tz = s.timezone;
  const box = "rounded-lg border p-3.5 text-sm";

  const body = (() => {
    if (!check)
      return (
        <div className={cn(box, "flex items-center gap-2 border-line bg-surface-2 text-fg-muted")}>
          <Loader2 className="size-4 animate-spin" aria-hidden /> Checking availability…
        </div>
      );

    if (check.state === "invalid")
      return (
        <div className={cn(box, "flex gap-2.5 border-line-strong bg-surface-2 text-fg")}>
          <Info className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
          <p>{check.reason}</p>
        </div>
      );

    if (check.state === "taken")
      return (
        <div className={cn(box, "border-bad-line bg-bad-bg")}>
          <p className="flex gap-2.5 font-medium text-bad-fg">
            <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
            That time is taken
          </p>
          <p className="mt-1 pl-[26px] text-fg-muted">
            {check.clash.title ? <span className="text-fg">“{check.clash.title}” has the space </span> : "Already booked "}
            <span className="font-mono text-xs">{formatRange(Date.parse(check.clash.starts_at), Date.parse(check.clash.ends_at), tz)}</span>
          </p>
          <Suggestions title="Nearest free times" spans={check.suggestions} tz={tz} onPick={onPick} anchor={span} />
        </div>
      );

    if (check.pending.length)
      return (
        <div className={cn(box, "border-warn-line bg-warn-bg")}>
          <p className="flex gap-2.5 font-medium text-warn-fg">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            Free, but others have asked for it too
          </p>
          <ul className="mt-1 space-y-0.5 pl-[26px] text-fg-muted">
            {check.pending.map((p) => (
              <li key={p.id}>
                {p.title ? <span className="text-fg">“{p.title}” </span> : "A request for "}
                <span className="font-mono text-xs">{formatRange(Date.parse(p.starts_at), Date.parse(p.ends_at), tz)}</span> is
                awaiting approval
              </li>
            ))}
          </ul>
          <p className="mt-2 pl-[26px] text-xs text-fg-muted">
            You can still send a request. Only one will be approved.
          </p>
          <Suggestions title="Times nobody has asked for" spans={check.suggestions} tz={tz} onPick={onPick} anchor={span} />
        </div>
      );

    return (
      <div className={cn(box, "flex gap-2.5 border-ok-line bg-ok-bg")}>
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ok" aria-hidden />
        <div>
          <p className="font-medium text-ok-fg">Available</p>
          <p className="mt-0.5 font-mono text-xs text-fg-muted">
            {formatDay(dayKeyOf(span.start, tz), "EEE d MMM")} · {formatRange(span.start, span.end, tz)} ·{" "}
            {formatDuration((span.end - span.start) / 60_000)}
          </p>
        </div>
      </div>
    );
  })();

  return (
    <div aria-live="polite" aria-atomic>
      {body}
    </div>
  );
}

function Suggestions({
  title,
  spans,
  tz,
  onPick,
  anchor,
}: {
  title: string;
  spans: Span[];
  tz: string;
  onPick: (s: Span) => void;
  anchor: Span;
}) {
  if (!spans.length)
    return <p className="mt-3 pl-[26px] text-xs text-fg-muted">No free time of this length in the next two weeks.</p>;

  const sameDay = dayKeyOf(spans[0].start, tz) === dayKeyOf(anchor.start, tz);
  return (
    <div className="mt-3 pl-[26px]">
      <p className="mb-1.5 flex items-center gap-1.5 text-xs text-fg-muted">
        <CalendarClock className="size-3.5" aria-hidden />
        {title}
        {!sameDay && ` · ${formatDay(dayKeyOf(spans[0].start, tz), "EEE d MMM")}`}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {spans.map((sp) => (
          <button
            key={sp.start}
            type="button"
            onClick={() => onPick(sp)}
            className="group inline-flex h-8 items-center gap-1 rounded-md border border-line-strong bg-surface px-2.5 font-mono text-xs text-fg transition-colors hover:border-primary hover:text-accent"
          >
            {formatRange(sp.start, sp.end, tz)}
            <ArrowRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
          </button>
        ))}
      </div>
    </div>
  );
}

function Success({
  done,
  settings: s,
  onClose,
  onAnother,
}: {
  done: Done;
  settings: SpaceSettings;
  onClose: () => void;
  onAnother: () => void;
}) {
  const confirmed = done.status === "confirmed";
  return (
    <div className="flex h-full flex-col">
      <header className="flex justify-end px-5 py-4">
        <button type="button" onClick={onClose} aria-label="Close" className="-m-1.5 rounded-md p-1.5 text-fg-subtle hover:bg-surface-2 hover:text-fg">
          <X className="size-5" />
        </button>
      </header>
      <div className="animate-rise flex flex-1 flex-col items-center px-6 pt-6 text-center">
        <span className={cn("grid size-14 place-items-center rounded-full", confirmed ? "bg-ok-bg text-ok" : "bg-warn-bg text-warn")}>
          {confirmed ? <CalendarCheck2 className="size-7" aria-hidden /> : <MailCheck className="size-7" aria-hidden />}
        </span>
        <h2 id="booking-sheet-title" className="mt-5 text-xl font-semibold tracking-[-0.02em]">
          {confirmed ? "You're booked" : "Request sent"}
        </h2>
        <p className="mt-1 font-mono text-sm text-fg">{done.whenLabel}</p>
        <p className="mt-4 max-w-xs text-sm text-fg-muted">
          {confirmed
            ? `${s.name} is yours. We've emailed the details and a calendar invite to ${done.email}.`
            : `An admin will review it. We've emailed ${done.email} and will email again as soon as it's approved or declined.`}
        </p>
        {done.manageUrl && (
          <a href={done.manageUrl} className={cn(buttonClass("secondary"), "mt-6")}>
            View or cancel this booking
          </a>
        )}
        <button type="button" onClick={onAnother} className="mt-3 text-sm font-medium text-accent hover:underline">
          Book another time
        </button>
        <p className="mt-auto pb-8 text-xs text-fg-subtle">Didn&apos;t get the email? Check spam, or keep the link above.</p>
      </div>
    </div>
  );
}
