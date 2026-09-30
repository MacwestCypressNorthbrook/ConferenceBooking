"use client";

import { CalendarDays, CalendarPlus, Clock, LayoutDashboard, MapPin, ShieldCheck, Users } from "lucide-react";
import Link from "next/link";
import { useBooking } from "@/components/booking/booking-provider";
import { SpaceStatus } from "@/components/space-status";
import { describeDays, formatMinutes, openHours } from "@/lib/schedule";
import type { Slot } from "@/lib/types";

export function PublicHeader({ todayBookings }: { todayBookings: Slot[] }) {
  const { settings: s, viewer, openBooking } = useBooking();
  const { open, close } = openHours(s);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-on-primary">
            <CalendarDays className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold tracking-[-0.015em]">{s.name}</p>
            {s.location && (
              <p className="hidden items-center gap-1 truncate text-xs text-fg-subtle sm:flex">
                <MapPin className="size-3" aria-hidden /> {s.location}
              </p>
            )}
          </div>
          <div className="hidden md:block">
            <SpaceStatus todayBookings={todayBookings} />
          </div>
          <Link
            href="/admin"
            className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-[13px] text-fg-muted hover:bg-surface-2 hover:text-fg"
          >
            <LayoutDashboard className="size-4" aria-hidden />
            <span className="hidden sm:inline">{viewer ? "Admin dashboard" : "Admin"}</span>
          </Link>
          <button
            type="button"
            onClick={() => openBooking()}
            className="hidden h-9 items-center gap-2 rounded-md bg-primary px-3.5 text-sm font-medium text-on-primary shadow-sm hover:bg-primary-hover sm:inline-flex"
          >
            <CalendarPlus className="size-4" aria-hidden /> Book the space
          </button>
        </div>
      </header>

      <div className="border-b border-line bg-surface">
        <dl className="mx-auto flex max-w-7xl flex-wrap gap-x-5 gap-y-1 px-4 py-2 text-xs text-fg-muted sm:px-6">
          <div className="flex items-center gap-1.5">
            <Users className="size-3.5 text-fg-subtle" aria-hidden />
            <dt className="sr-only">Capacity</dt>
            <dd>
              Up to <span className="font-mono">{s.capacity}</span> people
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="size-3.5 text-fg-subtle" aria-hidden />
            <dt className="sr-only">Hours</dt>
            <dd className="font-mono">
              {describeDays(s.open_days)} · {formatMinutes(open)}–{formatMinutes(close)}
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-fg-subtle" aria-hidden />
            <dt className="sr-only">How booking works</dt>
            <dd>
              No account needed ·{" "}
              {s.requires_approval ? "requests are approved by an admin" : "bookings are confirmed instantly"} · updates by email
            </dd>
          </div>
        </dl>
      </div>

      {viewer && (
        <div className="border-b border-primary-line bg-primary-soft">
          <p className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2 text-[13px] text-fg sm:px-6">
            <ShieldCheck className="size-4 shrink-0 text-accent" aria-hidden />
            You&apos;re signed in as an admin, so bookings you make here are <strong>confirmed instantly</strong> and skip
            Approvals.
            <Link href="/admin?tab=upcoming" className="font-medium text-accent hover:underline">
              See them in the dashboard →
            </Link>
          </p>
        </div>
      )}

      {/* Mobile: one obvious action, always in reach */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl sm:hidden">
        <button
          type="button"
          onClick={() => openBooking()}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary text-base font-medium text-on-primary shadow-sm"
        >
          <CalendarPlus className="size-5" aria-hidden /> Book the space
        </button>
      </div>
    </>
  );
}
