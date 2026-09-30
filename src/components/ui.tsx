import type { ComponentProps, ReactNode } from "react";
import type { BookingStatus } from "@/lib/types";

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

const buttonVariants = {
  primary: "bg-primary text-on-primary hover:bg-primary-hover shadow-sm",
  secondary: "bg-surface text-fg border border-line-strong hover:bg-surface-2",
  ghost: "text-fg-muted hover:bg-surface-2 hover:text-fg",
  danger: "bg-surface text-bad-fg border border-bad-line hover:bg-bad-bg",
  approve: "bg-ok text-white hover:brightness-110 shadow-sm",
};
const buttonSizes = {
  sm: "h-9 px-3 text-[13px] gap-1.5",
  md: "h-11 sm:h-10 px-4 text-sm gap-2",
};

export function buttonClass(variant: keyof typeof buttonVariants = "primary", size: keyof typeof buttonSizes = "md") {
  return cn(
    "inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors",
    "disabled:pointer-events-none disabled:opacity-50",
    buttonVariants[variant],
    buttonSizes[size],
  );
}

export function Button({
  variant,
  size,
  className,
  ...props
}: ComponentProps<"button"> & { variant?: keyof typeof buttonVariants; size?: keyof typeof buttonSizes }) {
  return <button type="button" className={cn(buttonClass(variant, size), className)} {...props} />;
}

export const inputClass = cn(
  "w-full rounded-md border border-line-strong bg-surface px-3 text-base sm:text-sm text-fg",
  "h-11 sm:h-10 placeholder:text-fg-subtle",
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20",
);

export function Field({
  label,
  hint,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-fg">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-fg-subtle">{hint}</p>}
    </div>
  );
}

const statusStyles: Record<BookingStatus | "expired", { label: string; className: string }> = {
  confirmed: { label: "Confirmed", className: "bg-ok-bg text-ok-fg border-ok-line" },
  pending: { label: "Awaiting approval", className: "bg-warn-bg text-warn-fg border-warn-line" },
  declined: { label: "Declined", className: "bg-bad-bg text-bad-fg border-bad-line" },
  cancelled: { label: "Cancelled", className: "bg-surface-2 text-fg-subtle border-line" },
  expired: { label: "Not reviewed", className: "bg-surface-2 text-fg-subtle border-line" },
};

export function StatusBadge({ status, className }: { status: BookingStatus | "expired"; className?: string }) {
  const s = statusStyles[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider",
        s.className,
        className,
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {s.label}
    </span>
  );
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-lg border border-line bg-surface", className)} {...props} />;
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-fg">{title}</h1>
        {description && <p className="mt-1 text-sm text-fg-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-line-strong px-6 py-12 text-center">
      <div className="mb-3 text-fg-subtle">{icon}</div>
      <p className="font-medium text-fg">{title}</p>
      {children && <div className="mt-1 max-w-sm text-sm text-fg-muted">{children}</div>}
    </div>
  );
}
