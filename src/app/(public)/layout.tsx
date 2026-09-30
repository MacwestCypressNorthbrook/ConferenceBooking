import { redirect } from "next/navigation";
import { BookingProvider } from "@/components/booking/booking-provider";
import { IntervalRefresher } from "@/components/interval-refresher";
import { PublicHeader } from "@/components/public-header";
import { getPublicSlots, getRequestTime, getSettings, getViewerOrNull } from "@/lib/data";
import { addDaysToKey, dayKeyOf, zonedInstant } from "@/lib/schedule";
import { hasSecretKey } from "@/lib/supabase/admin";

export default async function PublicLayout({ children }: LayoutProps<"/">) {
  if (!hasSecretKey) redirect("/setup");
  const [settings, viewer] = await Promise.all([getSettings(), getViewerOrNull()]);
  const admin = viewer?.role === "admin" ? viewer : null;
  const tz = settings.timezone;
  const now = getRequestTime();
  const today = dayKeyOf(now, tz);
  const todayBookings = await getPublicSlots(zonedInstant(today, 0, tz), zonedInstant(addDaysToKey(today, 1), 0, tz));

  return (
    <BookingProvider settings={settings} viewer={admin} serverNow={now}>
      <IntervalRefresher />
      <PublicHeader todayBookings={todayBookings} />
      <main className="mx-auto max-w-7xl px-4 pt-6 pb-28 sm:px-6 sm:pb-12">{children}</main>
    </BookingProvider>
  );
}
