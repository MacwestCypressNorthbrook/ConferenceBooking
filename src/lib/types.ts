export type BookingStatus = "pending" | "confirmed" | "declined" | "cancelled";
export type UserRole = "member" | "admin";

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  department: string | null;
  role: UserRole;
};

export type SpaceSettings = {
  name: string;
  location: string | null;
  description: string | null;
  capacity: number;
  timezone: string;
  open_time: string; // "HH:MM:SS"
  close_time: string;
  open_days: number[]; // ISO weekdays, 1 = Monday
  slot_minutes: number;
  min_duration_minutes: number;
  max_duration_minutes: number;
  max_advance_days: number;
  requires_approval: boolean;
  amenities: string[];
  allowed_email_domains: string[];
};

/**
 * What the public page is allowed to know about a booking: when, and whether
 * it's confirmed or only requested. Admins get the full Booking.
 */
export type Slot = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  title?: string;
};

export type Booking = Slot & {
  title: string;
  user_id: string | null;
  purpose: string | null;
  attendees: number;
  needs: string[];
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
  requester_name: string;
  requester_email: string;
  requester_phone: string | null;
  requester_department: string | null;
};

export const BOOKING_SELECT =
  "id, user_id, title, purpose, attendees, needs, starts_at, ends_at, status, decision_note, decided_at, created_at, requester_name, requester_email, requester_phone, requester_department";

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };
