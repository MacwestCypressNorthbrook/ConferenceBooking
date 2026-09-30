"use client";

import {
  CalendarDays,
  CalendarPlus,
  ExternalLink,
  Inbox,
  LogOut,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { signOut } from "@/app/actions";
import { useBooking } from "@/components/booking/booking-provider";
import { SpaceStatus } from "@/components/space-status";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/components/ui";
import type { Profile, Slot } from "@/lib/types";

type NavItem = { href: string; label: string; icon: LucideIcon; badge?: number };

const TITLES: Record<string, { title: string; hint: string }> = {
  "/admin": { title: "Approvals", hint: "Decide who gets the space" },
  "/admin/schedule": { title: "Schedule", hint: "Every booking, week by week" },
  "/admin/settings": { title: "Space settings", hint: "Hours, rules, email and admins" },
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Full-width admin shell: slim sidebar, sticky top bar, mobile tab bar. */
export function AdminShell({
  viewer,
  todayBookings,
  pendingCount,
  children,
}: {
  viewer: Profile;
  todayBookings: Slot[];
  pendingCount: number;
  children: ReactNode;
}) {
  const { settings: s, openBooking } = useBooking();
  const pathname = usePathname();
  const page = TITLES[pathname] ?? TITLES["/admin"];

  const items: NavItem[] = [
    { href: "/admin", label: "Approvals", icon: Inbox, badge: pendingCount },
    { href: "/admin/schedule", label: "Schedule", icon: CalendarDays },
    { href: "/admin/settings", label: "Settings", icon: Settings2 },
  ];
  const active = (href: string) => pathname === href;

  return (
    <div className="min-h-dvh lg:pl-60">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
        <div className="flex h-14 items-center gap-2.5 border-b border-line px-4">
          <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-on-primary">
            <CalendarDays className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold tracking-[-0.01em]">{s.name}</p>
            <p className="text-[11px] text-fg-subtle">Admin</p>
          </div>
        </div>

        <nav aria-label="Admin" className="flex-1 space-y-0.5 p-3">
          <p className="px-2.5 pb-1.5 font-mono text-[10px] font-medium uppercase tracking-wider text-fg-subtle">Workspace</p>
          {items.map(({ href, label, icon: Icon, badge }) => (
            <Link
              key={href}
              href={href}
              aria-current={active(href) ? "page" : undefined}
              className={cn(
                "group flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors",
                active(href) ? "bg-primary-soft font-medium text-accent" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              <Icon className="size-4" aria-hidden />
              <span className="flex-1">{label}</span>
              {!!badge && (
                <span className="min-w-5 rounded-full bg-warn px-1.5 text-center font-mono text-[10px] leading-[18px] font-semibold text-white">
                  {badge}
                </span>
              )}
            </Link>
          ))}

          <div className="my-3 border-t border-line" />
          <a
            href="/"
            target="_blank"
            className="flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <ExternalLink className="size-4" aria-hidden />
            Public booking page
          </a>
        </nav>

        <div className="flex items-center gap-2 border-t border-line p-3">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-soft font-mono text-[11px] font-semibold text-accent">
            {initials(viewer.full_name || viewer.email)}
          </span>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[13px] font-medium">{viewer.full_name}</p>
            <p className="truncate text-[11px] text-fg-subtle">{viewer.email}</p>
          </div>
          <ThemeToggle />
          <form action={signOut}>
            <button type="submit" aria-label="Sign out" title="Sign out" className="grid size-9 place-items-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fg">
              <LogOut className="size-4" />
            </button>
          </form>
        </div>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-primary text-on-primary lg:hidden">
          <CalendarDays className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em]">{page.title}</h1>
          <p className="hidden truncate text-xs text-fg-subtle sm:block">{page.hint}</p>
        </div>
        <div className="hidden md:block">
          <SpaceStatus todayBookings={todayBookings} />
        </div>
        <button
          type="button"
          onClick={() => openBooking()}
          className="hidden h-9 items-center gap-2 rounded-md bg-primary px-3.5 text-sm font-medium text-on-primary shadow-sm transition-colors hover:bg-primary-hover sm:inline-flex"
        >
          <CalendarPlus className="size-4" aria-hidden /> Book for someone
        </button>
        <div className="flex items-center lg:hidden">
          <ThemeToggle />
          <form action={signOut}>
            <button type="submit" aria-label="Sign out" className="grid size-10 place-items-center rounded-md text-fg-subtle hover:text-fg">
              <LogOut className="size-[18px]" />
            </button>
          </form>
        </div>
      </header>

      <main className="px-4 pt-5 pb-28 sm:px-6 lg:px-8 lg:pt-6 lg:pb-10">{children}</main>

      {/* Mobile tab bar */}
      <nav
        aria-label="Admin"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      >
        <div className="mx-auto flex max-w-md items-stretch">
          {items.map(({ href, label, icon: Icon, badge }) => (
            <Link
              key={href}
              href={href}
              aria-current={active(href) ? "page" : undefined}
              className={cn(
                "relative flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px]",
                active(href) ? "font-medium text-accent" : "text-fg-subtle",
              )}
            >
              <Icon className="size-5" aria-hidden />
              {label}
              {!!badge && (
                <span className="absolute top-2 left-1/2 ml-1.5 rounded-full bg-warn px-1 font-mono text-[9px] leading-4 font-semibold text-white">
                  {badge}
                </span>
              )}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => openBooking()}
            className="flex min-h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium text-accent"
          >
            <CalendarPlus className="size-5" aria-hidden />
            Book
          </button>
        </div>
      </nav>
    </div>
  );
}
