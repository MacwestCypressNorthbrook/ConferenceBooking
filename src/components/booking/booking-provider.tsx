"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { Booking, Profile, SpaceSettings } from "@/lib/types";
import { BookingDetails } from "./booking-details";
import { BookingSheet, type Prefill } from "./booking-sheet";

type BookingContext = {
  settings: SpaceSettings;
  /** null on the public site; an admin profile inside /admin */
  viewer: Profile | null;
  serverNow: number;
  openBooking: (prefill?: Prefill) => void;
  showDetails: (booking: Booking) => void;
};

const Ctx = createContext<BookingContext | null>(null);

export function useBooking() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBooking must be used inside <BookingProvider>");
  return ctx;
}

export function BookingProvider({
  settings,
  viewer,
  serverNow,
  children,
}: {
  settings: SpaceSettings;
  viewer: Profile | null;
  serverNow: number;
  children: ReactNode;
}) {
  const [sheet, setSheet] = useState<{ open: boolean; prefill?: Prefill; nonce: number }>({ open: false, nonce: 0 });
  const [details, setDetails] = useState<Booking | null>(null);

  const openBooking = useCallback((prefill?: Prefill) => {
    setDetails(null);
    setSheet((s) => ({ open: true, prefill, nonce: s.nonce + 1 }));
  }, []);

  const value = useMemo(
    () => ({ settings, viewer, serverNow, openBooking, showDetails: setDetails }),
    [settings, viewer, serverNow, openBooking],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <BookingSheet
        open={sheet.open}
        prefill={sheet.prefill}
        prefillNonce={sheet.nonce}
        onClose={() => setSheet((s) => ({ ...s, open: false }))}
        settings={settings}
        viewer={viewer}
        serverNow={serverNow}
      />
      {viewer && <BookingDetails booking={details} onClose={() => setDetails(null)} settings={settings} />}
    </Ctx.Provider>
  );
}
