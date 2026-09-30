import type { Metadata } from "next";
import { CalendarCheck2, Clock, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { describeDays, formatMinutes, openHours } from "@/lib/schedule";
import type { SpaceSettings } from "@/lib/types";
import { AuthForm } from "./auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.from("space_settings").select("*").eq("id", 1).maybeSingle();
  const space = data as SpaceSettings | null;
  const hours = space && openHours(space);

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-[#0f172a] p-12 text-slate-100 lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)",
            backgroundSize: "56px 56px",
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-md bg-[#4338ca]">
            <CalendarCheck2 className="size-5" aria-hidden />
          </span>
          <span className="font-semibold tracking-tight">Space Booking</span>
        </div>

        <div className="relative max-w-md">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-indigo-300">One space · one schedule</p>
          <h1 className="mt-4 text-[44px] leading-[1.05] font-semibold tracking-[-0.03em]">
            Know when {space?.name ?? "the hall"} is free. Book it in seconds.
          </h1>
          <p className="mt-4 text-slate-400">
            Pick the time that works for you. We check it against every booking instantly, so there are no
            double-bookings or back-and-forth.
          </p>
        </div>

        {space && hours && (
          <dl className="relative grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-white/10 bg-white/10">
            {[
              { icon: Users, label: "Capacity", value: `${space.capacity} people` },
              { icon: Clock, label: "Hours", value: `${formatMinutes(hours.open)}–${formatMinutes(hours.close)}` },
              { icon: CalendarCheck2, label: "Open", value: describeDays(space.open_days) },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="bg-[#0f172a] p-4">
                <dt className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  <Icon className="size-3.5" aria-hidden /> {label}
                </dt>
                <dd className="mt-1.5 font-mono text-sm text-slate-100">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <section className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <span className="grid size-10 place-items-center rounded-md bg-primary text-on-primary">
              <CalendarCheck2 className="size-5" aria-hidden />
            </span>
            <p className="mt-4 text-sm text-fg-muted">{space?.name ?? "Conference space"} booking</p>
          </div>
          <AuthForm
            next={typeof params.next === "string" ? params.next : "/admin"}
            linkError={params.error === "link"}
          />
        </div>
      </section>
    </main>
  );
}
