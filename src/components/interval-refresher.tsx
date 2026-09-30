"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * The public page can't subscribe to Realtime (anonymous visitors have no
 * access to bookings), so it re-renders every minute and when the tab regains focus.
 */
export function IntervalRefresher({ everyMs = 60_000 }: { everyMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      window.dispatchEvent(new Event("bookings:changed"));
    };
    const id = setInterval(refresh, everyMs);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, everyMs]);
  return null;
}
