import { dayKeyOf, formatDay, formatDuration, formatRange } from "@/lib/schedule";
import type { Booking, SpaceSettings } from "@/lib/types";

export type EmailContent = { subject: string; html: string; text: string };
type Ctx = { settings: SpaceSettings; appUrl: string; manageUrl: string };

// Everything interpolated below comes from the public booking form.
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const tone = {
  ok: { fg: "#047857", bg: "#ECFDF5", line: "#A7F3D0" },
  warn: { fg: "#B45309", bg: "#FFFBEB", line: "#FDE68A" },
  bad: { fg: "#BE123C", bg: "#FFF1F2", line: "#FECDD3" },
  neutral: { fg: "#475569", bg: "#F1F5F9", line: "#E2E8F0" },
};

function when(b: Booking, s: SpaceSettings) {
  const start = Date.parse(b.starts_at);
  const end = Date.parse(b.ends_at);
  return {
    day: formatDay(dayKeyOf(start, s.timezone), "EEEE d MMMM yyyy"),
    short: formatDay(dayKeyOf(start, s.timezone), "EEE d MMM"),
    range: formatRange(start, end, s.timezone),
    duration: formatDuration((end - start) / 60_000),
  };
}

function layout({
  settings: s,
  preheader,
  badge,
  heading,
  intro,
  rows,
  note,
  cta,
  footer,
}: {
  settings: SpaceSettings;
  preheader: string;
  badge: { label: string; tone: keyof typeof tone };
  heading: string;
  intro: string;
  rows: [string, string][];
  note?: { label: string; body: string };
  cta?: { label: string; href: string };
  footer: string;
}) {
  const t = tone[badge.tone];
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
  const mono = "'SFMono-Regular',Menlo,Consolas,monospace";
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:${font};color:#0F172A">
<span style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8FAFC;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
  <tr><td style="padding:0 4px 16px">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="width:32px;height:32px;background:#4338CA;border-radius:6px;text-align:center;color:#fff;font-size:16px;font-weight:600">&#9635;</td>
      <td style="padding-left:10px;font-size:15px;font-weight:600;letter-spacing:-0.01em">${esc(s.name)}</td>
    </tr></table>
  </td></tr>
  <tr><td style="background:#FFFFFF;border:1px solid #E2E8F0;border-radius:10px;padding:28px">
    <span style="display:inline-block;padding:3px 8px;border:1px solid ${t.line};background:${t.bg};color:${t.fg};border-radius:4px;font-family:${mono};font-size:11px;letter-spacing:0.06em;text-transform:uppercase">${esc(badge.label)}</span>
    <h1 style="margin:14px 0 8px;font-size:22px;line-height:28px;letter-spacing:-0.02em">${esc(heading)}</h1>
    <p style="margin:0 0 20px;font-size:15px;line-height:22px;color:#475569">${intro}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #E2E8F0">
      ${rows
        .map(
          ([k, v]) => `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #E2E8F0;width:120px;font-size:13px;color:#64748B;vertical-align:top">${esc(k)}</td>
        <td style="padding:10px 0;border-bottom:1px solid #E2E8F0;font-size:14px;color:#0F172A">${v}</td></tr>`,
        )
        .join("")}
    </table>
    ${
      note
        ? `<div style="margin-top:20px;padding:12px 14px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;font-size:14px;line-height:20px;color:#334155"><strong style="color:#0F172A">${esc(note.label)}:</strong> ${esc(note.body)}</div>`
        : ""
    }
    ${
      cta
        ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px"><tr><td style="background:#4338CA;border-radius:6px">
      <a href="${esc(cta.href)}" style="display:inline-block;padding:11px 18px;color:#FFFFFF;font-size:14px;font-weight:600;text-decoration:none">${esc(cta.label)}</a>
    </td></tr></table>`
        : ""
    }
  </td></tr>
  <tr><td style="padding:16px 4px;font-size:12px;line-height:18px;color:#64748B">${footer}</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function detailRows(b: Booking, s: SpaceSettings, extra: [string, string][] = []): [string, string][] {
  const w = when(b, s);
  return [
    ["What", `<strong>${esc(b.title)}</strong>`],
    ["When", `${esc(w.day)}<br><span style="font-family:Menlo,Consolas,monospace;font-size:13px">${esc(w.range)} · ${esc(w.duration)}</span>`],
    ["Where", esc([s.name, s.location].filter(Boolean).join(" · "))],
    ["Attendees", String(b.attendees)],
    ...extra,
  ];
}

function textVersion(heading: string, intro: string, b: Booking, s: SpaceSettings, link?: { label: string; href: string }, note?: string) {
  const w = when(b, s);
  return [
    heading,
    "",
    intro.replace(/<[^>]+>/g, ""),
    "",
    `What: ${b.title}`,
    `When: ${w.day}, ${w.range} (${w.duration})`,
    `Where: ${[s.name, s.location].filter(Boolean).join(" · ")}`,
    `Attendees: ${b.attendees}`,
    note ? `\n${note}` : "",
    link ? `\n${link.label}: ${link.href}` : "",
  ].join("\n");
}

const requesterFooter = (c: Ctx) =>
  `You're receiving this because you requested ${esc(c.settings.name)}. <a href="${esc(c.manageUrl)}" style="color:#4338CA">Manage your booking</a>.`;

const firstName = (b: Booking) => esc(b.requester_name.split(/\s+/)[0]);

// ---------------------------------------------------------------------------
// To the requester
// ---------------------------------------------------------------------------

export function requestReceived(b: Booking, c: Ctx): EmailContent {
  const w = when(b, c.settings);
  const heading = "We've got your request";
  const intro = `Thanks ${firstName(b)}. Your request is waiting for an admin to approve it. We'll email you as soon as it's decided — until then, the time isn't guaranteed.`;
  const cta = { label: "View or cancel request", href: c.manageUrl };
  return {
    subject: `Request received: ${b.title} · ${w.short}`,
    html: layout({ settings: c.settings, preheader: `${w.short}, ${w.range} — awaiting approval`, badge: { label: "Awaiting approval", tone: "warn" }, heading, intro, rows: detailRows(b, c.settings), cta, footer: requesterFooter(c) }),
    text: textVersion(heading, intro, b, c.settings, cta),
  };
}

export function bookingConfirmed(b: Booking, c: Ctx): EmailContent {
  const w = when(b, c.settings);
  const heading = "You're booked";
  const intro = `${firstName(b)}, ${esc(c.settings.name)} is yours on <strong>${esc(w.short)}</strong>, ${esc(w.range)}. The calendar file attached adds it to your calendar.`;
  const cta = { label: "View booking", href: c.manageUrl };
  const note = b.decision_note ? { label: "Note from the admin", body: b.decision_note } : undefined;
  return {
    subject: `Confirmed: ${b.title} · ${w.short}, ${w.range}`,
    html: layout({ settings: c.settings, preheader: `${w.short}, ${w.range} is confirmed`, badge: { label: "Confirmed", tone: "ok" }, heading, intro, rows: detailRows(b, c.settings), note, cta, footer: requesterFooter(c) }),
    text: textVersion(heading, intro, b, c.settings, cta, note && `${note.label}: ${note.body}`),
  };
}

/** Planning notice for the person who prepares the space after an approval. */
export function approvalPlanningNotice(b: Booking, c: Ctx): EmailContent {
  const w = when(b, c.settings);
  const heading = "A booking was approved";
  const intro = `<strong>${esc(b.requester_name)}</strong>${b.requester_department ? ` (${esc(b.requester_department)})` : ""} has an approved booking for ${esc(c.settings.name)}. Please plan the space setup ahead of time.`;
  const contact = [`<a href="mailto:${esc(b.requester_email)}" style="color:#4338CA">${esc(b.requester_email)}</a>`, b.requester_phone ? esc(b.requester_phone) : ""].filter(Boolean).join("<br>");
  const rows = detailRows(b, c.settings, [
    ["Contact", contact],
    ...(b.needs.length ? [["Setup", esc(b.needs.join(", "))] as [string, string]] : []),
  ]);
  const cta = { label: "Open schedule", href: `${c.appUrl}/admin/schedule` };
  const note = b.purpose ? { label: "Purpose", body: b.purpose } : undefined;
  return {
    subject: `Approved booking: ${b.title} · ${w.short}, ${w.range}`,
    html: layout({ settings: c.settings, preheader: `${w.short}, ${w.range} needs planning`, badge: { label: "Approved", tone: "ok" }, heading, intro, rows, note, cta, footer: `Planning notice from ${esc(c.settings.name)}.` }),
    text: textVersion(heading, intro, b, c.settings, cta, [`From: ${b.requester_name} <${b.requester_email}>`, note && `Purpose: ${note.body}`].filter(Boolean).join("\n")),
  };
}

export function bookingDeclined(b: Booking, c: Ctx, { autoDeclined = false } = {}): EmailContent {
  const heading = autoDeclined ? "That time went to another booking" : "Your request wasn't approved";
  const intro = autoDeclined
    ? `Sorry ${firstName(b)} — another request for the same time was approved first. The space may be free at a time close to it.`
    : `Sorry ${firstName(b)} — the admin couldn't approve this request.`;
  const cta = { label: "Pick another time", href: `${c.appUrl}/?date=${dayKeyOf(Date.parse(b.starts_at), c.settings.timezone)}` };
  const note = b.decision_note ? { label: autoDeclined ? "Why" : "Reason", body: b.decision_note } : undefined;
  return {
    subject: `Not approved: ${b.title}`,
    html: layout({ settings: c.settings, preheader: "Your request wasn't approved", badge: { label: "Declined", tone: "bad" }, heading, intro, rows: detailRows(b, c.settings), note, cta, footer: requesterFooter(c) }),
    text: textVersion(heading, intro, b, c.settings, cta, note && `${note.label}: ${note.body}`),
  };
}

export function bookingCancelled(b: Booking, c: Ctx, { byRequester }: { byRequester: boolean }): EmailContent {
  const heading = byRequester ? "Your booking is cancelled" : "Your booking was cancelled";
  const intro = byRequester
    ? `Done — the time is free for others again. Remove it from your calendar if you'd added it.`
    : `Sorry ${firstName(b)} — an admin had to cancel this booking. Please remove it from your calendar.`;
  const cta = { label: "Book another time", href: c.appUrl };
  const note = !byRequester && b.decision_note ? { label: "Reason", body: b.decision_note } : undefined;
  return {
    subject: `Cancelled: ${b.title}`,
    html: layout({ settings: c.settings, preheader: "Booking cancelled", badge: { label: "Cancelled", tone: "neutral" }, heading, intro, rows: detailRows(b, c.settings), note, cta, footer: requesterFooter(c) }),
    text: textVersion(heading, intro, b, c.settings, cta, note && `${note.label}: ${note.body}`),
  };
}

// ---------------------------------------------------------------------------
// To the admins
// ---------------------------------------------------------------------------

export function adminNewRequest(b: Booking, c: Ctx): EmailContent {
  const w = when(b, c.settings);
  const pending = b.status === "pending";
  const heading = pending ? "New request to review" : "New booking";
  const intro = `<strong>${esc(b.requester_name)}</strong>${b.requester_department ? ` (${esc(b.requester_department)})` : ""} ${pending ? "is asking for" : "booked"} ${esc(c.settings.name)}.`;
  const contact = [`<a href="mailto:${esc(b.requester_email)}" style="color:#4338CA">${esc(b.requester_email)}</a>`, b.requester_phone ? esc(b.requester_phone) : ""].filter(Boolean).join("<br>");
  const rows = detailRows(b, c.settings, [
    ["Contact", contact],
    ...(b.needs.length ? [["Setup", esc(b.needs.join(", "))] as [string, string]] : []),
  ]);
  const cta = { label: pending ? "Review this request" : "Open schedule", href: pending ? `${c.appUrl}/admin?r=${b.id}` : `${c.appUrl}/admin/schedule` };
  const note = b.purpose ? { label: "Purpose", body: b.purpose } : undefined;
  return {
    subject: `${pending ? "Needs approval" : "New booking"}: ${b.title} · ${w.short}, ${w.range}`,
    html: layout({ settings: c.settings, preheader: `${b.requester_name} · ${w.short}, ${w.range}`, badge: pending ? { label: "Needs approval", tone: "warn" } : { label: "Confirmed", tone: "ok" }, heading, intro, rows, note, cta, footer: `Sent to ${esc(c.settings.name)} admins.` }),
    text: textVersion(heading, intro, b, c.settings, cta, [`From: ${b.requester_name} <${b.requester_email}>`, note && `Purpose: ${note.body}`].filter(Boolean).join("\n")),
  };
}

export function adminCancelledByRequester(b: Booking, c: Ctx): EmailContent {
  const w = when(b, c.settings);
  const heading = "A booking was cancelled";
  const intro = `<strong>${esc(b.requester_name)}</strong> cancelled their ${b.status === "cancelled" ? "booking" : "request"}. The time is free again.`;
  return {
    subject: `Cancelled by requester: ${b.title} · ${w.short}`,
    html: layout({ settings: c.settings, preheader: `${w.short}, ${w.range} is free again`, badge: { label: "Cancelled", tone: "neutral" }, heading, intro, rows: detailRows(b, c.settings), footer: `Sent to ${esc(c.settings.name)} admins.` }),
    text: textVersion(heading, intro, b, c.settings),
  };
}

// ---------------------------------------------------------------------------
// Admin access
// ---------------------------------------------------------------------------

function accessEmail(s: SpaceSettings, heading: string, intro: string, cta: { label: string; href: string }, preheader: string): EmailContent {
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#F8FAFC;font-family:${font};color:#0F172A">
<span style="display:none">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border:1px solid #E2E8F0;border-radius:10px">
<tr><td style="padding:28px">
  <p style="margin:0;font-size:13px;color:#64748B">${esc(s.name)} · Admin</p>
  <h1 style="margin:10px 0 8px;font-size:22px;letter-spacing:-0.02em">${esc(heading)}</h1>
  <p style="margin:0 0 22px;font-size:15px;line-height:22px;color:#475569">${intro}</p>
  <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#4338CA;border-radius:6px">
    <a href="${esc(cta.href)}" style="display:inline-block;padding:11px 18px;color:#fff;font-size:14px;font-weight:600;text-decoration:none">${esc(cta.label)}</a>
  </td></tr></table>
  <p style="margin:22px 0 0;font-size:12px;line-height:18px;color:#64748B">The link works once and expires in an hour. If you didn't ask for it, you can ignore this email.</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject: heading, html, text: `${heading}\n\n${intro.replace(/<[^>]+>/g, "")}\n\n${cta.label}: ${cta.href}` };
}

export function adminSignInLink(s: SpaceSettings, url: string) {
  return accessEmail(s, `Sign in to ${s.name} admin`, "Use this button to sign in. No password needed.", { label: "Sign in", href: url }, "Your sign-in link");
}

export function adminInvite(s: SpaceSettings, url: string, inviter: string) {
  return accessEmail(
    s,
    `You're now an admin for ${s.name}`,
    `${esc(inviter)} added you as an admin. You'll review booking requests and manage the space's schedule.`,
    { label: "Accept and sign in", href: url },
    "You've been made a space admin",
  );
}
