"use client";

import { useEffect, useState } from "react";

/** Starts from the server's clock so the first render hydrates cleanly, then ticks. */
export function useNow(serverNow: number, intervalMs = 30_000) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
