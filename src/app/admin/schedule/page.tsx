import type { Metadata } from "next";
import { ScheduleView } from "@/components/schedule-view";

export const metadata: Metadata = { title: "Schedule" };

export default async function AdminSchedulePage({ searchParams }: PageProps<"/admin/schedule">) {
  const { date } = await searchParams;
  return <ScheduleView date={date} admin intro="Click a booking for details, or an empty slot to book it for someone." />;
}
