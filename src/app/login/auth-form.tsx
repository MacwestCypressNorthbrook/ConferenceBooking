"use client";

import { Loader2, MailCheck } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Field, buttonClass, cn, inputClass } from "@/components/ui";
import { sendSignInLink, signIn } from "./actions";

export function AuthForm({ next, linkError }: { next: string; linkError: boolean }) {
  const [mode, setMode] = useState<"link" | "password">("link");
  const [linkState, linkAction, sendingLink] = useActionState(sendSignInLink, undefined);
  const [passwordState, passwordAction, signingIn] = useActionState(signIn, undefined);
  const state = mode === "link" ? linkState : passwordState;
  const pending = sendingLink || signingIn;

  if (mode === "link" && linkState?.notice) {
    return (
      <div className="animate-rise text-center">
        <MailCheck className="mx-auto size-10 text-ok" aria-hidden />
        <h2 className="mt-4 text-xl font-semibold tracking-tight">Check your inbox</h2>
        <p className="mt-2 text-sm text-fg-muted">{linkState.notice}</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-semibold tracking-[-0.02em]">Admin sign in</h2>
      <p className="mt-1 text-sm text-fg-muted">
        For people who approve bookings.{" "}
        <Link href="/" className="font-medium text-accent hover:underline">
          Booking the space doesn&apos;t need an account.
        </Link>
      </p>

      {(state?.error || linkError) && (
        <p role="alert" className="mt-5 rounded-md border border-bad-line bg-bad-bg px-3 py-2 text-sm text-bad-fg">
          {state?.error ?? "That link has expired or was already used. Request a new one below."}
        </p>
      )}

      <form action={mode === "link" ? linkAction : passwordAction} className="mt-6 space-y-4" key={mode}>
        <input type="hidden" name="next" value={next} />
        <Field label="Email" htmlFor="email">
          <input id="email" name="email" type="email" required autoComplete="email" defaultValue={state?.email} className={inputClass} />
        </Field>
        {mode === "password" && (
          <Field label="Password" htmlFor="password">
            <input id="password" name="password" type="password" required autoComplete="current-password" className={inputClass} />
          </Field>
        )}
        <button type="submit" disabled={pending} className={cn(buttonClass("primary"), "w-full")}>
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {mode === "link" ? "Email me a sign-in link" : "Sign in"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-fg-muted">
        <button
          type="button"
          onClick={() => setMode(mode === "link" ? "password" : "link")}
          className="font-medium text-accent hover:underline"
        >
          {mode === "link" ? "Use a password instead" : "Email me a link instead"}
        </button>
      </p>
    </div>
  );
}
