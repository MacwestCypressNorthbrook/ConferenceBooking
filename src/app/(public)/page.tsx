import { ScheduleView } from "@/components/schedule-view";
import { getSettings, getViewerOrNull } from "@/lib/data";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const [{ date }, settings, viewer] = await Promise.all([searchParams, getSettings(), getViewerOrNull()]);
  return (
    <ScheduleView
      date={date}
      admin={viewer?.role === "admin"}
      title={`When is ${settings.name} free?`}
      intro={<span className="block">Pick a free time below, or tap “Book the space”. No account needed.</span>}
    />
  );
}
