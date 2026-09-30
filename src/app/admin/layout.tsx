import { ShieldAlert } from "lucide-react";
import { signOut } from "@/app/actions";
import { AdminShell } from "@/components/app-nav";
import { BookingProvider } from "@/components/booking/booking-provider";
import { RealtimeRefresher } from "@/components/realtime-refresher";
import { buttonClass } from "@/components/ui";
import { getActiveBookings, getPendingCount, getRequestTime, getSettings, getViewer } from "@/lib/data";
import { addDaysToKey, dayKeyOf, zonedInstant } from "@/lib/schedule";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const [viewer, settings] = await Promise.all([getViewer(), getSettings()]);

  // An account that exists but isn't an admin (e.g. someone signed up through the
  // Supabase API directly, or an admin who was removed) sees nothing.
  if (viewer.role !== "admin") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center px-4 text-center">
        <ShieldAlert className="size-10 text-fg-subtle" aria-hidden />
        <h1 className="mt-4 text-xl font-semibold">No admin access</h1>
        <p className="mt-2 text-sm text-fg-muted">
          {viewer.email} isn&apos;t an admin for {settings.name}. Ask an existing admin to add you.
        </p>
        <form action={signOut} className="mt-6">
          <button type="submit" className={buttonClass("secondary")}>Sign out</button>
        </form>
      </main>
    );
  }

  const tz = settings.timezone;
  const now = getRequestTime();
  const today = dayKeyOf(now, tz);
  const [todayBookings, pendingCount] = await Promise.all([
    getActiveBookings(zonedInstant(today, 0, tz), zonedInstant(addDaysToKey(today, 1), 0, tz)),
    getPendingCount(),
  ]);

  return (
    <BookingProvider settings={settings} viewer={viewer} serverNow={now}>
      <RealtimeRefresher />
      <AdminShell viewer={viewer} todayBookings={todayBookings} pendingCount={pendingCount}>
        {children}
      </AdminShell>
    </BookingProvider>
  );
}
