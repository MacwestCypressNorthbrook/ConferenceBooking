"use client";

import { CheckCircle2, CircleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";

type Toast = { id: number; tone: "success" | "error"; title: string; body?: string };

const listeners = new Set<(t: Toast) => void>();
let nextId = 1;

export function toast(tone: Toast["tone"], title: string, body?: string) {
  const t = { id: nextId++, tone, title, body };
  listeners.forEach((l) => l(t));
}

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const add = (t: Toast) => {
      setToasts((all) => [...all, t]);
      setTimeout(() => setToasts((all) => all.filter((x) => x.id !== t.id)), 6000);
    };
    listeners.add(add);
    return () => void listeners.delete(add);
  }, []);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-24 z-[60] flex flex-col items-center gap-2 lg:inset-x-auto lg:right-6 lg:bottom-6 lg:items-end"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="animate-rise pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-line bg-surface p-3.5 shadow-pop"
        >
          {t.tone === "success" ? (
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden />
          ) : (
            <CircleAlert className="mt-0.5 size-5 shrink-0 text-bad" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-fg">{t.title}</p>
            {t.body && <p className="mt-0.5 text-[13px] text-fg-muted">{t.body}</p>}
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}
            className="-m-1 rounded p-1 text-fg-subtle hover:text-fg"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
