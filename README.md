# Conference space booking

One shared open space for official gatherings. **Anyone can book it without an account:** they pick a free time, enter their name and email, and get email updates. **Only admins sign in**, to approve requests and manage the space. The database guarantees nobody double-books.

**Stack:** Next.js 16 (App Router), React 19, Tailwind CSS 4, Supabase (Postgres + Auth), Resend or any SMTP server, Bun.
**Design:** "Executive Precision" from the Stitch project. See [`designs/`](designs/).

## Set up

1. **Create a Supabase project** at [supabase.com/dashboard](https://supabase.com/dashboard).
2. **Run both migrations in order** in the SQL Editor:
   [`20260930000000_init.sql`](supabase/migrations/20260930000000_init.sql), then [`20260930120000_public_booking.sql`](supabase/migrations/20260930120000_public_booking.sql).
   (With the CLI: `supabase link` then `supabase db push`.)
3. **Environment:** `cp .env.example .env.local`, then fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and **`SUPABASE_SECRET_KEY`** (*Project Settings → API Keys*). The secret key stays on the server. The public page needs it because anonymous visitors get no direct database access.
   - `APP_URL`: the public address, used in email links.
   - **Email:** either `RESEND_API_KEY`, or `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD`. Also set `EMAIL_FROM` to an address on a domain your provider has verified.
4. **Lock down sign-ups:** in *Authentication → Sign In / Providers*, turn off **Allow new users to sign up**. Admins are added from inside the app.
5. **Create the first admin:** *Authentication → Users → Add user* (tick *Auto Confirm User*). The first account ever created becomes the admin.
6. `bun install && bun dev`, then open `/admin`. Add further admins in **Space settings → Admins**; they get an emailed sign-in link.
7. *(Optional)* Run [`supabase/seed.sql`](supabase/seed.sql) for a fortnight of demo bookings.

Then set the space's real name, capacity, hours, **timezone** (defaults to `Africa/Lagos`) and, if you like, **allowed email domains** in Space settings.

## How it works

| Who | Experience |
| --- | --- |
| **Anyone** (no login) | Sees when the space is free: a live status bar, the next free windows, and a week view. Busy times show only as *Booked* or *Requested*, with no titles or names. They click, drag or use "Book the space", and availability is checked as they type, with alternatives offered. They enter name and email, which are remembered on that device. |
| **Requester** | Gets an email for every change: received, confirmed (with a calendar file), declined with the reason, or cancelled. Each email includes a private link, `/b/<token>`, to check status, cancel, or add the booking to a calendar. |
| **Admin** | Signs in with an emailed link or a password. Sees an approvals queue that flags conflicts and gets an email for each new request. Also sees a full schedule with details and contacts, can book for someone (confirmed instantly), cancel with a reason, and manage settings and admins. |

**Email events:** request received (to requester and admins) · approved · declined · auto-declined (another request won the same time) · cancelled by admin · cancelled by requester (to requester and admins) · admin sign-in link · admin invite.
Emails are sent after the response via `after()` and never block or undo a booking. If sending fails, the error is logged and the manage page still shows the true status.
With neither Resend nor SMTP configured, emails are printed to the server console.

**Rules enforced in Postgres** (see the migrations):
- Confirmed bookings can never overlap. An exclusion constraint makes this race-proof.
- Pending requests may compete for the same time. Approving one declines the others automatically, and they get an email.
- Opening days and hours, duration limits, the booking window, capacity, no past bookings, the optional email-domain allowlist, and per-email rate limits (3 pending requests, 10 per day) all apply to every write, including the server's.
- The anonymous role has no access to `bookings`. Only admins can read bookings and profiles, and non-admin accounts see a "no access" page.

## Scripts

```bash
bun dev            # dev server
bun run build      # production build
bun test           # scheduling + email tests (timezones, clashes, escaping, .ics, provider routing)
bun run lint
bun run typecheck
```

## Project map

```
supabase/migrations/      schema, rules, RLS, RPCs (run in order)
src/proxy.ts              protects /admin; refreshes admin sessions
src/app/(public)/         public schedule + booking
src/app/b/[token]/        requester's private manage page (+ .ics download)
src/app/admin/            approvals, schedule, settings (+ admins)
src/app/actions.ts        server actions: request, cancel, approve/decline, settings, invites
src/lib/email/            Resend/SMTP transport, templates, .ics, notification rules
src/lib/schedule.ts       timezone-aware scheduling logic (mirrors the DB rules for instant feedback)
```
