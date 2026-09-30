"use client";

import { Loader2, Mail } from "lucide-react";
import { useMemo, useState } from "react";
import { updateSettings } from "@/app/actions";
import { toast } from "@/components/toast";
import { Card, Field, buttonClass, cn, inputClass } from "@/components/ui";
import type { SpaceSettings } from "@/lib/types";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function Section({ id, title, description, children }: { id: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <Card id={id} className="grid scroll-mt-20 gap-5 rounded-xl p-5 md:grid-cols-[220px_1fr] xl:p-6">
      <div>
        <h2 className="font-medium">{title}</h2>
        <p className="mt-1 text-[13px] text-fg-muted">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

const PROVIDERS = {
  resend: { label: "Sending with Resend", tone: "border-ok-line bg-ok-bg text-ok-fg" },
  smtp: { label: "Sending over SMTP", tone: "border-ok-line bg-ok-bg text-ok-fg" },
  console: {
    label: "Email isn't set up: messages are only logged on the server. Add RESEND_API_KEY or SMTP_HOST.",
    tone: "border-warn-line bg-warn-bg text-warn-fg",
  },
};

export function SettingsForm({ settings, emailProvider }: { settings: SpaceSettings; emailProvider: keyof typeof PROVIDERS }) {
  const [v, setV] = useState({
    ...settings,
    location: settings.location ?? "",
    description: settings.description ?? "",
    open_time: settings.open_time.slice(0, 5),
    close_time: settings.close_time.slice(0, 5),
    amenities: settings.amenities.join("\n"),
    allowed_email_domains: settings.allowed_email_domains.join(", "),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timezones = useMemo(() => Intl.supportedValuesOf("timeZone"), []);
  const set = <K extends keyof typeof v>(key: K, value: (typeof v)[K]) => setV((s) => ({ ...s, [key]: value }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const result = await updateSettings({
      ...v,
      amenities: v.amenities.split("\n").map((a) => a.trim()).filter(Boolean),
      allowed_email_domains: v.allowed_email_domains.split(/[\s,]+/).map((d) => d.trim()).filter(Boolean),
    });
    setSaving(false);
    if (!result.ok) return setError(result.error);
    toast("success", "Settings saved", "New bookings follow these rules straight away.");
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <Section id="space" title="The space" description="Shown on the sign-in page, sidebar and booking form.">
        <Field label="Name" htmlFor="s-name">
          <input id="s-name" required value={v.name} onChange={(e) => set("name", e.target.value)} className={inputClass} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Location" htmlFor="s-location">
            <input id="s-location" value={v.location} onChange={(e) => set("location", e.target.value)} className={inputClass} />
          </Field>
          <Field label="Capacity (people)" htmlFor="s-capacity">
            <input id="s-capacity" type="number" min={1} required value={v.capacity} onChange={(e) => set("capacity", Number(e.target.value))} className={cn(inputClass, "font-mono")} />
          </Field>
        </div>
        <Field label="Equipment people can request" htmlFor="s-amenities" hint="One per line.">
          <textarea id="s-amenities" rows={5} value={v.amenities} onChange={(e) => set("amenities", e.target.value)} className={cn(inputClass, "h-auto sm:h-auto py-2")} />
        </Field>
      </Section>

      <Section id="hours" title="Opening hours" description="Nobody can book outside these hours. Existing bookings are not changed.">
        <fieldset>
          <legend className="mb-1.5 text-[13px] font-medium">Open on</legend>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((label, i) => {
              const day = i + 1;
              const on = v.open_days.includes(day);
              return (
                <label
                  key={label}
                  className={cn(
                    "grid h-10 w-12 cursor-pointer place-items-center rounded-md border text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary",
                    on ? "border-primary bg-primary-soft font-medium text-accent" : "border-line-strong text-fg-muted",
                  )}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={on}
                    onChange={() => set("open_days", on ? v.open_days.filter((d) => d !== day) : [...v.open_days, day].sort())}
                  />
                  {label}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Opens" htmlFor="s-open">
            <input id="s-open" type="time" required value={v.open_time} onChange={(e) => set("open_time", e.target.value)} className={cn(inputClass, "font-mono")} />
          </Field>
          <Field label="Closes" htmlFor="s-close">
            <input id="s-close" type="time" required value={v.close_time} onChange={(e) => set("close_time", e.target.value)} className={cn(inputClass, "font-mono")} />
          </Field>
          <Field label="Timezone" htmlFor="s-tz">
            <select id="s-tz" value={v.timezone} onChange={(e) => set("timezone", e.target.value)} className={inputClass}>
              {timezones.map((tz) => (
                <option key={tz}>{tz}</option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      <Section id="rules" title="Booking rules" description="Keep the space fair for everyone.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Time slots" htmlFor="s-slot">
            <select id="s-slot" value={v.slot_minutes} onChange={(e) => set("slot_minutes", Number(e.target.value))} className={inputClass}>
              <option value={15}>Every 15 minutes</option>
              <option value={30}>Every 30 minutes</option>
              <option value={60}>Every hour</option>
            </select>
          </Field>
          <Field label="Book up to (days ahead)" htmlFor="s-advance">
            <input id="s-advance" type="number" min={1} max={365} value={v.max_advance_days} onChange={(e) => set("max_advance_days", Number(e.target.value))} className={cn(inputClass, "font-mono")} />
          </Field>
          <Field label="Shortest booking (minutes)" htmlFor="s-min">
            <input id="s-min" type="number" min={15} step={15} value={v.min_duration_minutes} onChange={(e) => set("min_duration_minutes", Number(e.target.value))} className={cn(inputClass, "font-mono")} />
          </Field>
          <Field label="Longest booking (minutes)" htmlFor="s-max">
            <input id="s-max" type="number" min={15} step={15} value={v.max_duration_minutes} onChange={(e) => set("max_duration_minutes", Number(e.target.value))} className={cn(inputClass, "font-mono")} />
          </Field>
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-md border border-line p-3">
          <input
            type="checkbox"
            checked={v.requires_approval}
            onChange={(e) => set("requires_approval", e.target.checked)}
            className="mt-0.5 size-4 accent-[var(--primary)]"
          />
          <span>
            <span className="block text-sm font-medium">Require admin approval</span>
            <span className="block text-[13px] text-fg-muted">
              When off, anyone with the link gets the time instantly, first come first served. Bookings made by admins are always instant.
            </span>
          </span>
        </label>
      </Section>

      <Section id="access" title="Who can book" description="Anyone with the link can request the space. Requesters get email updates.">
        <Field
          label="Only allow these email domains"
          htmlFor="s-domains"
          hint="e.g. company.com. Leave empty to accept any email. Admins can always book for anyone."
        >
          <input
            id="s-domains"
            value={v.allowed_email_domains}
            onChange={(e) => set("allowed_email_domains", e.target.value)}
            placeholder="company.com"
            className={cn(inputClass, "font-mono")}
          />
        </Field>
        <p className={cn("flex items-start gap-2 rounded-md border px-3 py-2 text-[13px]", PROVIDERS[emailProvider].tone)}>
          <Mail className="mt-0.5 size-4 shrink-0" aria-hidden />
          {PROVIDERS[emailProvider].label}
        </p>
      </Section>

      <div className="sticky bottom-20 z-10 flex items-center justify-end gap-3 rounded-xl border border-line bg-surface/95 p-3 shadow-pop backdrop-blur lg:bottom-4">
        {error && <p role="alert" className="flex-1 text-sm text-bad-fg">{error}</p>}
        <button type="submit" disabled={saving} className={buttonClass("primary")}>
          {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Save changes
        </button>
      </div>
    </form>
  );
}
