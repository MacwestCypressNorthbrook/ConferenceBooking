import type { Metadata } from "next";
import { AdminsSection } from "@/components/admins-section";
import { SettingsForm } from "@/components/settings-form";
import { getSettings, getViewer } from "@/lib/data";
import { emailProvider } from "@/lib/email/send";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Space settings" };

const SECTIONS = [
  ["space", "The space"],
  ["hours", "Opening hours"],
  ["rules", "Booking rules"],
  ["access", "Who can book"],
  ["admins", "Admins"],
];

export default async function SettingsPage() {
  const [viewer, settings] = await Promise.all([getViewer(), getSettings()]);
  // Layouts and pages render in parallel, so guard the service-role read here too.
  if (viewer.role !== "admin") return null;
  const { data: admins } = await createAdminClient()
    .from("profiles")
    .select("id, email, full_name, department, role")
    .eq("role", "admin")
    .order("created_at");

  return (
    <div className="grid gap-8 xl:grid-cols-[200px_minmax(0,1fr)]">
      <nav aria-label="Settings sections" className="hidden xl:block">
        <ul className="sticky top-20 space-y-0.5">
          {SECTIONS.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="block rounded-md px-2.5 py-1.5 text-sm text-fg-muted transition-colors hover:bg-surface hover:text-fg">
                {label}
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-4 px-2.5 text-xs leading-5 text-fg-subtle">These rules are enforced by the database, not just this form.</p>
      </nav>
      <div className="max-w-5xl space-y-4">
        <SettingsForm settings={settings} emailProvider={emailProvider()} />
        <AdminsSection admins={(admins ?? []) as Profile[]} viewerId={viewer.id} />
      </div>
    </div>
  );
}
