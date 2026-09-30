import type { Booking, SpaceSettings } from "@/lib/types";

const utc = (iso: string | number) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escapeText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// RFC 5545: lines longer than 75 octets are folded with CRLF + space.
function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut)) > 75) cut--;
    out.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  out.push(rest);
  return out.join("\r\n");
}

/** A standalone "add to calendar" event (METHOD:PUBLISH — no organiser/RSVP semantics). */
export function bookingIcs(b: Booking, s: SpaceSettings, manageUrl: string) {
  const location = [s.name, s.location].filter(Boolean).join(", ");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Space Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${b.id}@space-booking`,
    `DTSTAMP:${utc(Date.now())}`,
    `DTSTART:${utc(b.starts_at)}`,
    `DTEND:${utc(b.ends_at)}`,
    `SUMMARY:${escapeText(b.title)}`,
    `LOCATION:${escapeText(location)}`,
    `DESCRIPTION:${escapeText(`${b.attendees} attending. Manage this booking: ${manageUrl}`)}`,
    `URL:${manageUrl}`,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .map(fold)
    .join("\r\n");
}
