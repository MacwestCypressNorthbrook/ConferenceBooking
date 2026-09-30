import { afterEach, describe, expect, mock, test } from "bun:test";
import type { Booking, SpaceSettings } from "@/lib/types";

mock.module("server-only", () => ({}));
const { sendEmail, emailProvider } = await import("./send");
const { bookingIcs } = await import("./ics");
const t = await import("./templates");

const settings: SpaceSettings = {
  name: "Conference Hall", location: "Ground floor", description: null, capacity: 40, timezone: "Africa/Lagos",
  open_time: "08:00:00", close_time: "18:00:00", open_days: [1, 2, 3, 4, 5], slot_minutes: 30,
  min_duration_minutes: 30, max_duration_minutes: 240, max_advance_days: 60, requires_approval: true,
  amenities: [], allowed_email_domains: [],
};
const booking: Booking = {
  id: "11111111-1111-1111-1111-111111111111", user_id: null,
  title: `<script>alert("x")</script> Board, review; prep`, purpose: "Agenda & <b>notes</b>", attendees: 12, needs: [],
  starts_at: "2026-10-05T09:00:00.000Z", ends_at: "2026-10-05T10:30:00.000Z", status: "pending",
  decision_note: null, decided_at: null, created_at: "", requester_name: "Ada <Okafor>",
  requester_email: "ada@example.com", requester_phone: null, requester_department: null,
};
const ctx = { settings, appUrl: "https://book.example.com", manageUrl: "https://book.example.com/b/tok" };

describe("templates", () => {
  test("escape everything that came from the public form", () => {
    for (const email of [t.requestReceived(booking, ctx), t.adminNewRequest(booking, ctx), t.bookingDeclined(booking, ctx)]) {
      expect(email.html).not.toContain("<script>");
      expect(email.html).not.toContain("<b>notes</b>");
      expect(email.html).not.toContain("Ada <Okafor>");
    }
    expect(t.adminNewRequest(booking, ctx).html).toContain("&lt;script&gt;");
  });
  test("times are in the space's timezone (Lagos, UTC+1)", () => {
    const e = t.bookingConfirmed({ ...booking, status: "confirmed" }, ctx);
    expect(e.text).toContain("10:00 AM – 11:30 AM");
    expect(e.subject).toContain("Mon 5 Oct");
  });
  test("links point at the manage page and the app", () => {
    expect(t.requestReceived(booking, ctx).html).toContain('href="https://book.example.com/b/tok"');
    expect(t.bookingDeclined(booking, ctx).text).toContain("https://book.example.com/?date=2026-10-05");
  });
});

describe("ics", () => {
  const ics = bookingIcs(booking, settings, "https://book.example.com/b/tok");
  test("valid, escaped, CRLF, folded", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261005T090000Z");
    expect(ics).toContain("SUMMARY:<script>alert(\"x\")</script> Board\\, review\; prep");
    expect(ics.split("\r\n").every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
  });
});

describe("sendEmail routing", () => {
  const env = { ...process.env };
  const realFetch = globalThis.fetch;
  afterEach(() => {
    process.env = { ...env };
    globalThis.fetch = realFetch;
  });

  test("Resend when RESEND_API_KEY is set, with base64 attachments", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.EMAIL_FROM = "Hall <hall@example.com>";
    let sent: { url: string; auth: string; body: Record<string, unknown> } | undefined;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      sent = { url, auth: (init.headers as Record<string, string>).Authorization, body: JSON.parse(String(init.body)) };
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    expect(emailProvider()).toBe("resend");
    const ok = await sendEmail({ to: "a@x.com", subject: "S", html: "<p>h</p>", text: "h", attachments: [{ filename: "b.ics", content: "ICS", contentType: "text/calendar" }] });
    expect(ok).toBe(true);
    expect(sent?.url).toBe("https://api.resend.com/emails");
    expect(sent?.auth).toBe("Bearer re_test");
    expect(sent?.body).toMatchObject({ from: "Hall <hall@example.com>", to: ["a@x.com"], subject: "S" });
    expect((sent?.body.attachments as { content: string }[])[0].content).toBe(Buffer.from("ICS").toString("base64"));
  });

  test("a failing provider never throws", async () => {
    process.env.RESEND_API_KEY = "re_test";
    globalThis.fetch = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    const errors = console.error;
    console.error = () => {};
    expect(await sendEmail({ to: "a@x.com", subject: "S", html: "", text: "" })).toBe(false);
    console.error = errors;
  });

  test("SMTP when only SMTP_HOST is set; console when neither", () => {
    delete process.env.RESEND_API_KEY;
    process.env.SMTP_HOST = "smtp.example.com";
    expect(emailProvider()).toBe("smtp");
    delete process.env.SMTP_HOST;
    expect(emailProvider()).toBe("console");
  });
});
