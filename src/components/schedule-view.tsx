import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { FreeWindows } from "@/components/free-windows";
import { SpaceStatus } from "@/components/space-status";
import { PageHeader, buttonClass, cn } from "@/components/ui";
import { WeekTimeline } from "@/components/week-timeline";
import { getActiveBookings, getPublicSlots, getRequestTime, getSettings } from "@/lib/data";
import { addDaysToKey, dayKeyOf, formatDay, isOpenDay, weekStart, zonedInstant } from "@/lib/schedule";

/**
 * The week schedule, shared by the public page and the admin area. The public
 * gets anonymous busy/requested blocks; admins get full bookings.
 */
export async function ScheduleView({
  date,
  admin,
  title,
  intro,
}: {
  date?: string | string[];
  admin: boolean;
  /** Omit to use the week's date range as the heading (admin schedule). */
  title?: string;
  intro?: React.ReactNode;
}) {
  const settings = await getSettings();
  const load = admin ? getActiveBookings : getPublicSlots;
  const basePath = admin ? "/admin/schedule" : "/";
  const tz = settings.timezone;
  const now = getRequestTime();
  const today = dayKeyOf(now, tz);

  const focus = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : today;
  const monday = weekStart(focus);
  const week = Array.from({ length: 7 }, (_, i) => addDaysToKey(monday, i));
  const days = week.filter((d) => isOpenDay(d, settings));
  const initialDay = days.includes(focus) ? focus : (days.find((d) => d >= today) ?? days[0]);
  const isThisWeek = monday === weekStart(today);

  const [weekBookings, todayBookings, upcoming] = await Promise.all([
    load(zonedInstant(monday, 0, tz), zonedInstant(addDaysToKey(monday, 7), 0, tz)),
    load(zonedInstant(today, 0, tz), zonedInstant(addDaysToKey(today, 1), 0, tz)),
    load(now, zonedInstant(addDaysToKey(today, 14), 0, tz)),
  ]);

  const sameMonth = formatDay(monday, "MMM") === formatDay(week[6], "MMM");
  const range = `${formatDay(monday, sameMonth ? "d" : "d MMM")} – ${formatDay(week[6], "d MMM yyyy")}`;
  const navLink = (key: string) => (key === today ? basePath : `${basePath}?date=${key}`);

  return (
    <div className="space-y-5">
      <PageHeader
        title={title ?? range}
        description={
          <>
            {intro}
            {title && <span className="font-mono text-[13px]">{range}</span>}
          </>
        }
        actions={
          <nav aria-label="Week" className="flex items-center gap-1.5">
            <Link href={navLink(addDaysToKey(monday, -7))} aria-label="Previous week" className={cn(buttonClass("secondary", "sm"), "w-9 px-0")}>
              <ChevronLeft className="size-4" />
            </Link>
            <Link href={basePath} aria-disabled={isThisWeek} className={cn(buttonClass("secondary", "sm"), isThisWeek && "pointer-events-none opacity-50")}>
              This week
            </Link>
            <Link href={navLink(addDaysToKey(monday, 7))} aria-label="Next week" className={cn(buttonClass("secondary", "sm"), "w-9 px-0")}>
              <ChevronRight className="size-4" />
            </Link>
          </nav>
        }
      />

      {/* Side by side on wide screens so the week grid sits higher on the page. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(420px,520px)_minmax(0,1fr)] xl:items-center">
        <SpaceStatus todayBookings={todayBookings} variant="card" />
        <FreeWindows upcoming={upcoming} />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-muted" aria-label="Legend">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm border border-l-2 border-ok-line border-l-ok bg-ok-bg" /> {admin ? "Confirmed" : "Booked"}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm border border-dashed border-warn-line border-l-2 border-l-warn bg-warn-bg" /> Requested
          {!admin && <span className="text-fg-subtle">(awaiting approval, may still free up)</span>}
        </span>
        <span className="hidden items-center gap-1.5 md:flex">
          <span className="hatch size-2.5 rounded-sm border border-line" /> Past
        </span>
        <span className="ml-auto hidden text-fg-subtle md:inline">Click an empty slot, or drag to pick a range</span>
      </div>

      <WeekTimeline key={monday} days={days} bookings={weekBookings} initialDay={initialDay} />
    </div>
  );
}
