import { redirect } from "next/navigation";
import { hasSecretKey } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export default function SetupPage() {
  if (isSupabaseConfigured && hasSecretKey) redirect("/");

  const steps = [
    ["Create a Supabase project", "supabase.com/dashboard → New project."],
    ["Run both migrations, in order", "SQL Editor → run each file in supabase/migrations/ (oldest first)."],
    ["Add your keys", "Copy .env.example to .env.local and fill in the Project URL, publishable key and secret key (Project Settings → API Keys)."],
    ["Set up email", "Add a Resend API key or SMTP details to .env.local, so people hear back about their bookings."],
    ["Create the first admin", "Authentication → Users → Add user (tick Auto Confirm). The first account becomes the admin. Then restart the dev server."],
  ];

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-4 py-12">
      <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent">Setup required</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.025em]">Connect Supabase</h1>
      <p className="mt-2 text-fg-muted">The app needs a Supabase project to store bookings. Five steps:</p>
      <ol className="mt-8 space-y-3">
        {steps.map(([title, body], i) => (
          <li key={title} className="flex gap-4 rounded-lg border border-line bg-surface p-4">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary-soft font-mono text-xs text-accent">
              {i + 1}
            </span>
            <div>
              <p className="font-medium">{title}</p>
              <p className="mt-0.5 text-sm text-fg-muted">{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </main>
  );
}
