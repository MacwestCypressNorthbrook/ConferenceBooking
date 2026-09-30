"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Inbox,
  Loader2,
  Mail,
  MessageSquareText,
  Phone,
  TimerOff,
  Users,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { adminCancelBooking, decideBooking } from "@/app/actions";
import { useBooking } from "@/components/booking/booking-provider";
import { toast } from "@/components/toast";
import { Button, StatusBadge, buttonClass, cn, inputClass } from "@/components/ui";
import {
  dayKeyOf,
  formatDay,
  formatDuration,
  formatMinutes,
  formatRange,
  minutesIntoDay,
  openHours,
  overlaps,
  toSpan,
} from "@/lib/schedule";
import type { Booking } from "@/lib/types";

export type QueueItem = {
  request: Booking;
  submitted: string;
  blockedBy: Booking[];
  competing: Booking[];
  missed: boolean;
};

const QUICK_REASONS = [
  "The space is reserved for an official event at this time.",
  "Please pick another time — this slot is needed for a priority meeting.",
  "The group is larger than the space allows.",
];

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");

function startsIn(ms: number, now: number) {
  const mins = Math.round((ms - now) / 60_000);
  if (mins < 60) return `Starts in ${mins} min`;
  if (mins < 24 * 60) return `Starts in ${Math.round(mins / 60)} h`;
  return null;
}

const CANCEL_REASONS = [
  "The hall is needed for an urgent official event.",
  "The space is unavailable due to maintenance.",
  "Please rebook for another time — apologies for the change.",
];

type Tab = "waiting" | "upcoming" | "missed";
const tabOf = (i: QueueItem): Tab => (i.request.status === "confirmed" ? "upcoming" : i.missed ? "missed" : "waiting");

/**
 * Inbox-style workspace: requests waiting for a decision, confirmed upcoming
 * bookings, and missed requests. J/K (or ↑/↓) move, A approves, D declines or cancels.
 */
export function ApprovalsWorkspace({
  items,
  context,
  initialId,
  initialTab,
  serverNow,
}: {
  items: QueueItem[];
  /** Active bookings on the days that have requests, for the day timeline. */
  context: Booking[];
  initialId?: string;
  initialTab?: "waiting" | "upcoming" | "missed";
  serverNow: number;
}) {
  const [decided, setDecided] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<Tab>(() => {
    const linked = items.find((i) => i.request.id === initialId);
    if (linked) return tabOf(linked);
    if (initialTab) return initialTab;
    return items.some((i) => tabOf(i) === "waiting") ? "waiting" : "upcoming";
  });
  const [selectedId, setSelectedId] = useState<string | undefined>(initialId);
  const [showDetailOnMobile, setShowDetailOnMobile] = useState(Boolean(initialId));

  const visible = useMemo(() => items.filter((i) => !decided.has(i.request.id)), [items, decided]);
  const byTab = useMemo(
    () => ({
      waiting: visible.filter((i) => tabOf(i) === "waiting"),
      upcoming: visible.filter((i) => tabOf(i) === "upcoming"),
      missed: visible.filter((i) => tabOf(i) === "missed"),
    }),
    [visible],
  );
  const list = byTab[tab];
  const selected = list.find((i) => i.request.id === selectedId) ?? list[0];
  const index = selected ? list.indexOf(selected) : -1;

  const select = useCallback((id: string | undefined) => {
    setSelectedId(id);
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("r", id);
    else url.searchParams.delete("r");
    window.history.replaceState(null, "", url);
  }, []);

  const move = useCallback(
    (delta: number) => {
      const next = list[Math.min(list.length - 1, Math.max(0, index + delta))];
      if (next) select(next.request.id);
    },
    [index, list, select],
  );

  /** Hide the decided request (and any it auto-declined) and move on to the next one. */
  const onDecided = useCallback(
    (ids: string[]) => {
      const remaining = list.filter((i) => !ids.includes(i.request.id));
      const next = remaining[Math.min(index, remaining.length - 1)];
      setDecided((d) => new Set([...d, ...ids]));
      select(next?.request.id);
      if (!next) setShowDetailOnMobile(false);
    },
    [index, list, select],
  );

  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [selected?.request.id]);

  return (
    <div className="grid overflow-hidden rounded-xl border border-line bg-surface lg:h-[calc(100dvh-13.5rem)] lg:min-h-[560px] lg:grid-cols-[minmax(300px,360px)_1fr]">
      {/* Queue */}
      <div className={cn("flex min-h-0 flex-col border-line lg:border-r", showDetailOnMobile && "hidden lg:flex")}>
        <div role="tablist" aria-label="Requests" className="flex gap-1 border-b border-line p-2">
          {(
            [
              ["waiting", "Waiting", byTab.waiting.length],
              ["upcoming", "Upcoming", byTab.upcoming.length],
              ["missed", "Missed", byTab.missed.length],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => {
                setTab(key);
                select(byTab[key][0]?.request.id);
              }}
              className={cn(
                "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-[13px] transition-colors",
                tab === key ? "bg-surface-2 font-medium text-fg" : "text-fg-subtle hover:text-fg",
              )}
            >
              {label}
              <span className="font-mono text-[11px] text-fg-subtle">{count}</span>
            </button>
          ))}
        </div>

        <div ref={listRef} role="listbox" aria-label="Booking requests" className="min-h-0 flex-1 overflow-y-auto">
          {list.length === 0 && (
            <div className="flex h-full min-h-48 flex-col items-center justify-center px-6 py-10 text-center">
              <Inbox className="size-7 text-fg-subtle" aria-hidden />
              <p className="mt-2 text-sm font-medium">
                {{ waiting: "All caught up", upcoming: "Nothing booked ahead", missed: "Nothing missed" }[tab]}
              </p>
              <p className="mt-1 text-xs text-fg-subtle">
                {
                  {
                    waiting: "New requests land here, and you'll get an email.",
                    upcoming: "Confirmed bookings, including ones admins made, appear here.",
                    missed: "Requests whose start time passed without a decision.",
                  }[tab]
                }
              </p>
            </div>
          )}
          {list.map((item) => (
            <QueueRow
              key={item.request.id}
              item={item}
              selected={item.request.id === selected?.request.id}
              now={serverNow}
              onSelect={() => {
                select(item.request.id);
                setShowDetailOnMobile(true);
              }}
            />
          ))}
        </div>

        <p className="hidden border-t border-line px-3 py-2 text-[11px] text-fg-subtle lg:block">
          <Kbd>J</Kbd> <Kbd>K</Kbd> move · <Kbd>A</Kbd> approve · <Kbd>D</Kbd> {tab === "upcoming" ? "cancel" : "decline"}
        </p>
      </div>

      {/* Detail */}
      <div className={cn("min-h-0", !showDetailOnMobile && "hidden lg:block")}>
        {selected ? (
          <RequestDetail
            key={selected.request.id}
            item={selected}
            context={context}
            position={`${index + 1} of ${list.length}`}
            onMove={move}
            onDecided={onDecided}
            onBack={() => setShowDetailOnMobile(false)}
          />
        ) : (
          <div className="flex h-full min-h-72 flex-col items-center justify-center px-6 text-center">
            <span className="grid size-12 place-items-center rounded-full bg-ok-bg text-ok">
              <Check className="size-6" aria-hidden />
            </span>
            <p className="mt-3 font-medium">{tab === "upcoming" ? "No upcoming bookings" : "Nothing waiting for a decision"}</p>
            <p className="mt-1 max-w-xs text-sm text-fg-muted">You&apos;ll get an email the moment someone requests the space.</p>
            <Link href="/admin/schedule" className={cn(buttonClass("secondary", "sm"), "mt-4")}>
              Open the schedule
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-line-strong bg-surface-2 px-1 font-mono text-[10px] text-fg-muted">{children}</kbd>
  );
}

function QueueRow({ item, selected, now, onSelect }: { item: QueueItem; selected: boolean; now: number; onSelect: () => void }) {
  const { settings } = useBooking();
  const tz = settings.timezone;
  const r = item.request;
  const start = Date.parse(r.starts_at);
  const soon = !item.missed && startsIn(start, now);

  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onSelect}
      className={cn(
        "relative flex w-full gap-3 border-b border-line px-3.5 py-3 text-left transition-colors",
        selected ? "bg-primary-soft" : "hover:bg-surface-2",
      )}
    >
      {selected && <span className="absolute inset-y-0 left-0 w-[3px] bg-primary" aria-hidden />}
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 font-mono text-[11px] font-semibold text-fg-muted">
        {initials(r.requester_name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[13px] text-fg-muted">{r.requester_name}</span>
          <span className="shrink-0 font-mono text-[11px] text-fg-subtle">{formatDay(dayKeyOf(start, tz), "EEE d MMM")}</span>
        </span>
        <span className="mt-0.5 block truncate text-sm font-medium text-fg">{r.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[11px] text-fg-muted">{formatRange(start, Date.parse(r.ends_at), tz)}</span>
          {item.blockedBy.length > 0 && <Flag tone="bad">Clashes</Flag>}
          {!item.blockedBy.length && item.competing.length > 0 && (
            <Flag tone="warn">{item.competing.length} competing</Flag>
          )}
          {r.status === "confirmed" && r.user_id && <Flag tone="neutral">Booked by admin</Flag>}
          {soon && <Flag tone="neutral">{soon}</Flag>}
        </span>
      </span>
    </button>
  );
}

function Flag({ tone, children }: { tone: "bad" | "warn" | "neutral"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 font-mono text-[10px] leading-4 font-medium",
        tone === "bad" && "bg-bad-bg text-bad-fg",
        tone === "warn" && "bg-warn-bg text-warn-fg",
        tone === "neutral" && "bg-surface-2 text-fg-muted",
      )}
    >
      {children}
    </span>
  );
}

function RequestDetail({
  item,
  context,
  position,
  onMove,
  onDecided,
  onBack,
}: {
  item: QueueItem;
  context: Booking[];
  position: string;
  onMove: (delta: number) => void;
  onDecided: (ids: string[]) => void;
  onBack: () => void;
}) {
  const { settings: s } = useBooking();
  const tz = s.timezone;
  const r = item.request;
  const start = Date.parse(r.starts_at);
  const end = Date.parse(r.ends_at);
  const [mode, setMode] = useState<"idle" | "declining">("idle");
  const [note, setNote] = useState(item.missed ? "Not reviewed before the start time." : "");
  const [busy, setBusy] = useState<"approve" | "decline" | null>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const confirmed = r.status === "confirmed";
  const canApprove = !confirmed && !item.missed && item.blockedBy.length === 0;
  const first = r.requester_name.split(" ")[0];

  const decide = useCallback(
    async (approve: boolean) => {
      setBusy(approve ? "approve" : "decline");
      if (confirmed) {
        const cancelled = await adminCancelBooking(r.id, note);
        setBusy(null);
        if (!cancelled.ok) return toast("error", "Couldn't cancel the booking", cancelled.error);
        toast("success", `Cancelled “${r.title}”`, `${first} has been emailed. The time is free again.`);
        return onDecided([r.id]);
      }
      const result = await decideBooking(r.id, approve, approve ? undefined : note);
      setBusy(null);
      if (!result.ok) return toast("error", "Couldn't update the request", result.error);
      const auto = result.data?.autoDeclined ?? 0;
      toast(
        "success",
        approve ? `Approved “${r.title}”` : `Declined “${r.title}”`,
        approve && auto
          ? `${auto} competing request${auto > 1 ? "s were" : " was"} declined. Everyone has been emailed.`
          : `${first} has been emailed.`,
      );
      onDecided(approve ? [r.id, ...item.competing.map((c) => c.id)] : [r.id]);
    },
    [confirmed, first, item.competing, note, onDecided, r.id, r.title],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || el.closest("input, textarea, select, [contenteditable]")) return;
      const actions: Record<string, (() => void) | false> = {
        j: () => onMove(1),
        ArrowDown: () => onMove(1),
        k: () => onMove(-1),
        ArrowUp: () => onMove(-1),
        a: canApprove && !busy && (() => decide(true)),
        d: !busy && (() => {
          setMode("declining");
          setTimeout(() => noteRef.current?.focus());
        }),
      };
      const action = actions[e.key];
      if (!action) return;
      e.preventDefault();
      action();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, canApprove, decide, onMove]);

  return (
    <article className="flex h-full min-h-0 flex-col" aria-labelledby="request-title">
      <div className="flex-1 overflow-y-auto">
        <div className="flex items-center gap-2 border-b border-line px-5 py-2.5 text-xs text-fg-subtle">
          <button type="button" onClick={onBack} className="-ml-1 flex items-center gap-1 rounded p-1 text-fg-muted hover:text-fg lg:hidden">
            <ArrowLeft className="size-4" aria-hidden /> Back
          </button>
          <StatusBadge status={confirmed ? "confirmed" : item.missed ? "expired" : "pending"} />
          <span className="hidden sm:inline">
            {confirmed ? (r.user_id ? `Booked by an admin ${item.submitted}` : `Approved · requested ${item.submitted}`) : `Requested ${item.submitted}`}
          </span>
          <span className="ml-auto font-mono">{position}</span>
        </div>

        <div className="space-y-6 px-5 py-5 xl:px-7">
          <header>
            <h2 id="request-title" className="text-[22px] leading-7 font-semibold tracking-[-0.02em]">{r.title}</h2>
            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
              <span className="flex items-center gap-2.5">
                <span className="grid size-9 place-items-center rounded-full bg-primary-soft font-mono text-xs font-semibold text-accent">
                  {initials(r.requester_name)}
                </span>
                <span className="leading-tight">
                  <span className="block text-sm font-medium">{r.requester_name}</span>
                  {r.requester_department && <span className="block text-xs text-fg-subtle">{r.requester_department}</span>}
                </span>
              </span>
              <a href={`mailto:${r.requester_email}?subject=${encodeURIComponent(`Your booking request: ${r.title}`)}`} className="inline-flex items-center gap-1.5 text-[13px] text-accent hover:underline">
                <Mail className="size-3.5" aria-hidden /> {r.requester_email}
              </a>
              {r.requester_phone && (
                <a href={`tel:${r.requester_phone}`} className="inline-flex items-center gap-1.5 text-[13px] text-accent hover:underline">
                  <Phone className="size-3.5" aria-hidden /> {r.requester_phone}
                </a>
              )}
            </div>
          </header>

          {item.blockedBy.length > 0 && (
            <Callout tone="bad" icon={XCircle} title="Clashes with a confirmed booking">
              {item.blockedBy.map((c) => `“${c.title}” ${formatRange(Date.parse(c.starts_at), Date.parse(c.ends_at), tz)}`).join(", ")}. It can&apos;t be
              approved as is. Decline it, or email {first} to suggest another time.
            </Callout>
          )}
          {!item.blockedBy.length && item.competing.length > 0 && (
            <Callout tone="warn" icon={AlertTriangle} title={`Competing with ${item.competing.length} other request${item.competing.length > 1 ? "s" : ""}`}>
              {item.competing
                .map((c) => `“${c.title}” (${c.requester_name}) ${formatRange(Date.parse(c.starts_at), Date.parse(c.ends_at), tz)}`)
                .join(", ")}
              . Approving this one declines {item.competing.length > 1 ? "them" : "it"} and emails {item.competing.length > 1 ? "them" : "the requester"}.
            </Callout>
          )}
          {item.missed && (
            <Callout tone="neutral" icon={TimerOff} title="The start time has passed">
              This request can no longer be approved. Decline it so {first} gets an answer.
            </Callout>
          )}

          <section aria-labelledby="when-h" className="rounded-lg border border-line p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 id="when-h" className="text-sm font-medium">{formatDay(dayKeyOf(start, tz), "EEEE d MMMM")}</h3>
              <p className="font-mono text-[13px] text-fg-muted">
                {formatRange(start, end, tz)} · {formatDuration((end - start) / 60_000)}
              </p>
            </div>
            <DayTimeline request={r} context={context} />
          </section>

          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-line p-4">
              <dt className="flex items-center gap-1.5 text-xs text-fg-subtle">
                <Users className="size-3.5" aria-hidden /> Attendees
              </dt>
              <dd className="mt-1.5">
                <span className="text-xl font-semibold">{r.attendees}</span>
                <span className="text-sm text-fg-subtle"> of {s.capacity}</span>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary-soft" aria-hidden>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (r.attendees / s.capacity) * 100)}%` }} />
                </div>
              </dd>
            </div>
            <div className="rounded-lg border border-line p-4">
              <dt className="flex items-center gap-1.5 text-xs text-fg-subtle">
                <Wrench className="size-3.5" aria-hidden /> Setup needed
              </dt>
              <dd className="mt-2 flex flex-wrap gap-1.5">
                {r.needs.length ? (
                  r.needs.map((n) => (
                    <span key={n} className="rounded border border-line bg-surface-2 px-2 py-0.5 text-xs">{n}</span>
                  ))
                ) : (
                  <span className="text-sm text-fg-subtle">Nothing special</span>
                )}
              </dd>
            </div>
            <div className="rounded-lg border border-line p-4 sm:col-span-2">
              <dt className="flex items-center gap-1.5 text-xs text-fg-subtle">
                <MessageSquareText className="size-3.5" aria-hidden /> Purpose
              </dt>
              <dd className={cn("mt-1.5 text-sm leading-6", r.purpose ? "text-fg" : "text-fg-subtle")}>
                {r.purpose || "No purpose given."}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Decision bar */}
      <div className="border-t border-line bg-surface px-5 py-3 xl:px-7">
        {mode === "declining" ? (
          <div className="space-y-2.5">
            <label htmlFor="decline-note" className="block text-[13px] font-medium">
              Reason <span className="font-normal text-fg-subtle">— included in the email to {first}</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {(confirmed ? CANCEL_REASONS : QUICK_REASONS).map((q) => (
                <button key={q} type="button" onClick={() => setNote(q)} className="rounded-full border border-line-strong px-2.5 py-1 text-left text-xs text-fg-muted hover:border-fg-subtle hover:text-fg">
                  {q}
                </button>
              ))}
            </div>
            <textarea ref={noteRef} id="decline-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={cn(inputClass, "h-auto sm:h-auto py-2")} />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setMode("idle")} disabled={!!busy}>
                Back
              </Button>
              <Button variant="danger" size="sm" onClick={() => decide(false)} disabled={!!busy}>
                {busy === "decline" && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                {confirmed ? "Cancel booking" : "Decline"} and email {first}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <p className="hidden flex-1 text-xs text-fg-subtle sm:block">
              {confirmed
                ? `Confirmed. If you cancel, ${first} is emailed with your reason.`
                : canApprove
                  ? `${first} is emailed either way.`
                  : "This request can only be declined."}
            </p>
            <Button variant="danger" onClick={() => setMode("declining")} disabled={!!busy} className="flex-1 sm:flex-none">
              <X className="size-4" aria-hidden /> {confirmed ? "Cancel booking" : "Decline"} <Kbd>D</Kbd>
            </Button>
            {!confirmed && (
              <Button variant="approve" onClick={() => decide(true)} disabled={!!busy || !canApprove} className="flex-1 sm:flex-none">
                {busy === "approve" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
                Approve <kbd className="rounded border border-white/30 px-1 font-mono text-[10px]">A</kbd>
              </Button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

function Callout({
  tone,
  icon: Icon,
  title,
  children,
}: {
  tone: "bad" | "warn" | "neutral";
  icon: typeof XCircle;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-lg border p-3.5 text-[13px] leading-5",
        tone === "bad" && "border-bad-line bg-bad-bg",
        tone === "warn" && "border-warn-line bg-warn-bg",
        tone === "neutral" && "border-line bg-surface-2",
      )}
    >
      <Icon
        className={cn("mt-0.5 size-4 shrink-0", tone === "bad" ? "text-bad" : tone === "warn" ? "text-warn" : "text-fg-subtle")}
        aria-hidden
      />
      <div>
        <p className={cn("font-medium", tone === "bad" ? "text-bad-fg" : tone === "warn" ? "text-warn-fg" : "text-fg")}>{title}</p>
        <p className="mt-0.5 text-fg-muted">{children}</p>
      </div>
    </div>
  );
}

/**
 * The request's day at a glance: other bookings on the top track, this request
 * on the bottom one, so any overlap lines up vertically.
 */
function DayTimeline({ request, context }: { request: Booking; context: Booking[] }) {
  const { settings: s } = useBooking();
  const tz = s.timezone;
  const { open, close } = openHours(s);
  const day = dayKeyOf(Date.parse(request.starts_at), tz);
  const span = close - open;
  const pos = (ms: number) => ((Math.min(close, Math.max(open, minutesIntoDay(ms, tz))) - open) / span) * 100;
  const others = context.filter(
    (b) => b.id !== request.id && dayKeyOf(Date.parse(b.starts_at), tz) === day,
  );
  const mine = toSpan(request);
  const ticks: number[] = [];
  for (let m = Math.ceil(open / 60) * 60; m <= close; m += 60) ticks.push(m);

  const block = (b: Booking) => {
    const left = pos(Date.parse(b.starts_at));
    const width = Math.max(0.8, pos(Date.parse(b.ends_at)) - left);
    return { left: `${left}%`, width: `${width}%` };
  };

  return (
    <figure className="mt-4">
      <div className="relative">
        {/* Hour grid */}
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {ticks.map((m) => (
            <span key={m} className="absolute inset-y-0 border-l border-line" style={{ left: `${((m - open) / span) * 100}%` }} />
          ))}
        </div>
        <div className="relative space-y-1.5 py-1">
          <div className="relative h-7 rounded bg-surface-2/60">
            {others.map((b) => (
              <span
                key={b.id}
                title={`${b.title} · ${formatRange(Date.parse(b.starts_at), Date.parse(b.ends_at), tz)} · ${b.status === "confirmed" ? "confirmed" : "requested"}`}
                className={cn(
                  "absolute inset-y-0 flex items-center overflow-hidden rounded border px-1.5 text-[10px] font-medium whitespace-nowrap",
                  b.status === "confirmed" ? "border-ok-line bg-ok-bg text-ok-fg" : "border-dashed border-warn-line bg-warn-bg text-warn-fg",
                  overlaps(toSpan(b), mine) && "ring-2 ring-bad/60",
                )}
                style={block(b)}
              >
                {b.title}
              </span>
            ))}
            {others.length === 0 && (
              <span className="absolute inset-0 flex items-center px-2 text-[11px] text-fg-subtle">Nothing else booked this day</span>
            )}
          </div>
          <div className="relative h-7">
            <span
              className="absolute inset-y-0 flex items-center overflow-hidden rounded border-2 border-primary bg-primary-soft px-1.5 text-[10px] font-semibold whitespace-nowrap text-accent"
              style={block(request)}
            >
              {request.status === "confirmed" ? "This booking" : "This request"}
            </span>
          </div>
        </div>
      </div>
      <div className="relative mt-1 h-4" aria-hidden>
        {ticks.filter((_, i) => i % 2 === 0).map((m) => (
          <span
            key={m}
            className={cn(
              "absolute font-mono text-[10px] whitespace-nowrap text-fg-subtle",
              // Keep the end labels inside the chart instead of hanging over its edges.
              m <= open ? "" : m >= close ? "-translate-x-full" : "-translate-x-1/2",
            )}
            style={{ left: `${((m - open) / span) * 100}%` }}
          >
            {formatMinutes(m).replace(":00", "")}
          </span>
        ))}
      </div>
      <figcaption className="sr-only">
        {others.length
          ? `Other bookings that day: ${others.map((b) => `${b.title} ${formatRange(Date.parse(b.starts_at), Date.parse(b.ends_at), tz)} (${b.status})`).join("; ")}.`
          : "Nothing else is booked that day."}
      </figcaption>
    </figure>
  );
}
