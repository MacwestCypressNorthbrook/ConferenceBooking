"use client";

import { Loader2, UserMinus, UserPlus } from "lucide-react";
import { useState } from "react";
import { inviteAdmin, removeAdmin } from "@/app/actions";
import { toast } from "@/components/toast";
import { Button, Card, Field, inputClass } from "@/components/ui";
import type { Profile } from "@/lib/types";

export function AdminsSection({ admins, viewerId }: { admins: Profile[]; viewerId: string }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy("invite");
    const result = await inviteAdmin({ email, full_name: name });
    setBusy(null);
    if (!result.ok) return toast("error", "Couldn't add admin", result.error);
    toast("success", "Admin added", result.message);
    setEmail("");
    setName("");
  }

  async function remove(admin: Profile) {
    if (!confirm(`Remove ${admin.full_name} as an admin? They'll lose access straight away.`)) return;
    setBusy(admin.id);
    const result = await removeAdmin(admin.id);
    setBusy(null);
    if (!result.ok) toast("error", "Couldn't remove admin", result.error);
    else toast("success", `${admin.full_name} is no longer an admin`);
  }

  return (
    <Card id="admins" className="grid scroll-mt-20 gap-5 rounded-xl p-5 md:grid-cols-[220px_1fr] xl:p-6">
      <div>
        <h2 className="font-medium">Admins</h2>
        <p className="mt-1 text-[13px] text-fg-muted">
          The only people who sign in. They approve requests and get an email for each new one.
        </p>
      </div>
      <div className="space-y-4">
        <ul className="divide-y divide-line rounded-md border border-line">
          {admins.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {a.full_name} {a.id === viewerId && <span className="font-normal text-fg-subtle">(you)</span>}
                </p>
                <p className="truncate text-xs text-fg-subtle">{a.email}</p>
              </div>
              {a.id !== viewerId && (
                <Button variant="ghost" size="sm" onClick={() => remove(a)} disabled={!!busy} aria-label={`Remove ${a.full_name}`}>
                  {busy === a.id ? <Loader2 className="size-3.5 animate-spin" /> : <UserMinus className="size-3.5" />}
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
        <form onSubmit={invite} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <Field label="Name" htmlFor="inv-name">
            <input id="inv-name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
          </Field>
          <Field label="Email" htmlFor="inv-email">
            <input id="inv-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
          </Field>
          <Button type="submit" variant="secondary" disabled={!!busy}>
            {busy === "invite" ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
            Add admin
          </Button>
        </form>
      </div>
    </Card>
  );
}
