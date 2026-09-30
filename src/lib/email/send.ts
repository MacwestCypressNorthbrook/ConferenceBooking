import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

export type Email = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  attachments?: { filename: string; content: string; contentType: string }[];
};

export type EmailProvider = "resend" | "smtp" | "console";

/** Resend's HTTP API wins if both are configured; SMTP covers any other mail server (incl. smtp.resend.com). */
export function emailProvider(): EmailProvider {
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.SMTP_HOST) return "smtp";
  return "console";
}

const from = () => process.env.EMAIL_FROM ?? "Space Booking <onboarding@resend.dev>";

let smtp: Transporter | undefined;
function smtpTransport() {
  const port = Number(process.env.SMTP_PORT ?? 587);
  smtp ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
  });
  return smtp;
}

async function sendWithResend(email: Email) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: from(),
      to: Array.isArray(email.to) ? email.to : [email.to],
      subject: email.subject,
      html: email.html,
      text: email.text,
      reply_to: email.replyTo,
      attachments: email.attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content).toString("base64"),
        content_type: a.contentType,
      })),
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

/**
 * Never throws: a mail outage must not undo a booking. Failures are logged
 * and the booking's status is always visible on its manage page.
 */
export async function sendEmail(email: Email): Promise<boolean> {
  const to = Array.isArray(email.to) ? email.to.join(", ") : email.to;
  if (!to) return false;
  try {
    switch (emailProvider()) {
      case "resend":
        await sendWithResend(email);
        break;
      case "smtp":
        await smtpTransport().sendMail({ from: from(), ...email, to });
        break;
      case "console":
        console.info(`[email:not-configured] to=${to} subject="${email.subject}"\n${email.text}`);
        break;
    }
    return true;
  } catch (error) {
    console.error(`[email] failed to send "${email.subject}" to ${to}:`, error);
    return false;
  }
}
