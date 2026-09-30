"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Keeps every open tab honest: when anyone books, cancels or an admin decides,
 * the schedule re-renders within a second. Also refreshes when a tab regains focus.
 */
export function RealtimeRefresher() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        router.refresh();
        window.dispatchEvent(new Event("bookings:changed"));
      }, 300);
    };

    const channel = supabase
      .channel("bookings-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, refresh)
      .subscribe();

    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [router]);

  return null;
}
