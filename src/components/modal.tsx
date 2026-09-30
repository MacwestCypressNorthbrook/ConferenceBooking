"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "./ui";

/** Native <dialog>: focus trap, Esc to close and inert background for free. */
export function Modal({
  open,
  onClose,
  labelledBy,
  variant = "center",
  children,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  variant?: "center" | "sheet";
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cn(
        "bg-surface p-0 text-fg shadow-pop backdrop:bg-transparent",
        variant === "sheet"
          ? "animate-sheet m-0 ml-auto h-dvh max-h-none w-full max-w-none sm:max-w-[480px] sm:border-l sm:border-line"
          : "animate-rise m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-line",
      )}
    >
      {open && children}
    </dialog>
  );
}
