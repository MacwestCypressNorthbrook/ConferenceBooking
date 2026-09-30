"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { cancelByToken } from "@/app/actions";
import { toast } from "@/components/toast";
import { Button } from "@/components/ui";

export function CancelByLink({ token, pending }: { token: string; pending: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const noun = pending ? "request" : "booking";

  async function cancel() {
    setBusy(true);
    const result = await cancelByToken(token);
    setBusy(false);
    if (!result.ok) return toast("error", "Couldn't cancel", result.error);
    toast("success", `Your ${noun} is cancelled`, "We've emailed you a confirmation. The time is free for others again.");
  }

  if (!confirming)
    return (
      <Button variant="danger" onClick={() => setConfirming(true)}>
        Cancel {noun}
      </Button>
    );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-fg-muted">Cancel this {noun}?</span>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={busy}>
        Keep it
      </Button>
      <Button variant="danger" size="sm" onClick={cancel} disabled={busy}>
        {busy && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
        Yes, cancel
      </Button>
    </div>
  );
}
