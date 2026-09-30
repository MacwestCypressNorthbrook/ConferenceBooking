"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { sendEmail } from "@/lib/email/send";
import { adminSignInLink } from "@/lib/email/templates";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { SpaceSettings } from "@/lib/types";

export type AuthState = { error?: string; notice?: string; email?: string } | undefined;

const safeNext = (value: FormDataEntryValue | null) => {
  const next = typeof value === "string" ? value : "/admin";
  return next.startsWith("/") && !next.startsWith("//") ? next : "/admin";
};

export async function signIn(_: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return {
      error: error.code === "invalid_credentials" ? "That email and password don't match." : error.message,
      email,
    };
  }
  redirect(safeNext(formData.get("next")));
}

/**
 * One-time sign-in link, sent through our own email provider. The reply is the
 * same whether or not the address belongs to an admin, so it can't be used to
 * discover who the admins are.
 */
export async function sendSignInLink(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = z.email().safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!parsed.success) return { error: "Enter a valid email.", email: String(formData.get("email") ?? "") };
  const email = parsed.data;
  const notice = `If ${email} belongs to an admin, a sign-in link is on its way. It works once and expires in an hour.`;

  const db = createAdminClient();
  const { data: admin } = await db.from("profiles").select("id").eq("email", email).eq("role", "admin").maybeSingle();
  if (!admin) return { notice };

  const { data: link, error } = await db.auth.admin.generateLink({ type: "magiclink", email });
  if (error) {
    console.error("[auth] generateLink failed:", error.message);
    return { notice };
  }

  const h = await headers();
  const base = process.env.APP_URL?.replace(/\/$/, "") ?? h.get("origin") ?? "";
  const next = safeNext(formData.get("next"));
  const url = `${base}/auth/confirm?token_hash=${link.properties.hashed_token}&type=email&next=${encodeURIComponent(next)}`;
  const { data: settings } = await db.from("space_settings").select("*").eq("id", 1).single();
  await sendEmail({ to: email, ...adminSignInLink(settings as SpaceSettings, url) });
  return { notice };
}
