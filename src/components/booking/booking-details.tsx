"use client";

import { CalendarDays, Clock, Loader2, Mail, MessageSquareText, Phone, Users, Wrench, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { adminCancelBooking } from "@/app/actions";
import { Modal } from "@/components/modal";
import { toast } from "@/components/toast";
import { Button, StatusBadge, buttonClass, cn, inputClass } from "@/components/ui";
import { dayKeyOf, formatDay, formatDuration, formatRange } from "@/lib/schedule";
import type { Booking, SpaceSettings } from "@/lib/types";

/** Admin-only: the public schedule never has booking details to show. */
export function BookingDetails({
  booking,
  onClose,
  settings,
}: {
  booking: Booking | null;
  onClose: () => void;
  settings: SpaceSettings;
}) {
  return (
    <Modal open={!!booking} onClose={onClose} labelledBy="booking-details-title">
      {booking && <DetailsBody key={booking.id} booking={booking} onClose={onClose} settings={settings} />}
    </Modal>
  );
}

function DetailsBody({
  booking: b,
  onClose,
  settings,
}: {
  booking: Booking;
  onClose: () => void;
  settings: SpaceSettings;
}) {
  const [confirming, setConfirming] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const tz = settings.timezone;
  const start = Date.parse(b.starts_at);
  const end = Date.parse(b.ends_at);
  // eslint-disable-next-line react-hooks/purity -- read once when the dialog opens
  const active = (b.status === "pending" || b.status === "confirmed") && end > Date.now();
  const canCancel = active;

  async function cancel() {
    setBusy(true);
    const result = await adminCancelBooking(b.id, note);
    setBusy(false);
    if (!result.ok) return toast("error", "Couldn't cancel", result.error);
    toast("success", "Booking cancelled", `${b.requester_name} has been emailed. The time is free again.`);
    onClose();
  }

  const rows = [
    { icon: CalendarDays, value: formatDay(dayKeyOf(start, tz), "EEEE d MMMM yyyy") },
    { icon: Clock, value: `${formatRange(start, end, tz)} · ${formatDuration((end - start) / 60_000)}`, mono: true },
    { icon: Users, value: `${b.attendees} attending` },
  ];

  return (
    <div className="p-5">
      <div className="flex items-start justify-between gap-3">
        <StatusBadge status={b.status} />
        <button type="button" onClick={onClose} aria-label="Close" className="-m-1.5 rounded-md p-1.5 text-fg-subtle hover:bg-surface-2 hover:text-fg">
          <X className="size-5" />
        </button>
      </div>
      <h2 id="booking-details-title" className="mt-3 text-xl font-semibold tracking-[-0.02em]">
        {b.title}
      </h2>
      <p className="mt-1 text-sm text-fg-muted">
        Requested by <span className="text-fg">{b.requester_name}</span>
        {b.requester_department && ` · ${b.requester_department}`}
      </p>
      <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
        <a href={`mailto:${b.requester_email}`} className="inline-flex items-center gap-1 text-accent hover:underline">
          <Mail className="size-3.5" aria-hidden /> {b.requester_email}
        </a>
        {b.requester_phone && (
          <a href={`tel:${b.requester_phone}`} className="inline-flex items-center gap-1 text-accent hover:underline">
            <Phone className="size-3.5" aria-hidden /> {b.requester_phone}
          </a>
        )}
      </p>

      <ul className="mt-5 space-y-2.5 text-sm">
        {rows.map(({ icon: Icon, value, mono }) => (
          <li key={value} className="flex items-center gap-3">
            <Icon className="size-4 shrink-0 text-fg-subtle" aria-hidden />
            <span className={mono ? "font-mono text-[13px]" : undefined}>{value}</span>
          </li>
        ))}
        {b.needs.length > 0 && (
          <li className="flex items-start gap-3">
            <Wrench className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
            <span className="flex flex-wrap gap-1.5">
              {b.needs.map((n) => (
                <span key={n} className="rounded border border-line bg-surface-2 px-1.5 py-0.5 text-xs">{n}</span>
              ))}
            </span>
          </li>
        )}
        {b.purpose && (
          <li className="flex items-start gap-3">
            <MessageSquareText className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
            <span className="text-fg-muted">{b.purpose}</span>
          </li>
        )}
      </ul>

      {b.status === "pending" && active && (
        <p className="mt-5 rounded-md border border-warn-line bg-warn-bg px-3 py-2 text-[13px] text-warn-fg">
          Waiting for an admin to approve. Until then, this time is not guaranteed.
        </p>
      )}

      {canCancel && confirming && (
        <div className="mt-5 space-y-1.5">
          <label htmlFor="cancel-note" className="block text-[13px] font-medium">
            Reason <span className="font-normal text-fg-subtle">— included in the email to {b.requester_name.split(" ")[0]}</span>
          </label>
          <textarea id="cancel-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} className={cn(inputClass, "h-auto sm:h-auto py-2")} />
        </div>
      )}

      {canCancel && (
        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-line pt-4">
          {b.status === "pending" && (
            <Link href="/admin" onClick={onClose} className={buttonClass("secondary", "sm")}>
              Review request
            </Link>
          )}
          {canCancel &&
            (confirming ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={busy}>
                  Keep it
                </Button>
                <Button variant="danger" size="sm" onClick={cancel} disabled={busy}>
                  {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
                  Yes, cancel {b.status === "pending" ? "request" : "booking"}
                </Button>
              </>
            ) : (
              <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
                Cancel {b.status === "pending" ? "request" : "booking"}
              </Button>
            ))}
        </div>
      )}
    </div>
  );
}
