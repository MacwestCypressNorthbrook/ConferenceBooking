-- Conference space booking: one shared space, many requesters, a few admins.
--
-- Integrity rules live here, not in the UI:
--   * Confirmed bookings can never overlap (exclusion constraint — race-proof).
--   * Pending requests may overlap each other, but never a confirmed booking.
--   * Approving a request auto-declines the pending requests it overlaps.
--   * Opening hours, open days, duration, booking window and capacity are
--     validated against the single-row space_settings table.

create extension if not exists btree_gist;

create type public.user_role as enum ('member', 'admin');
create type public.booking_status as enum ('pending', 'confirmed', 'declined', 'cancelled');

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  department text,
  role public.user_role not null default 'member',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Space settings (exactly one row)
-- ---------------------------------------------------------------------------

create table public.space_settings (
  id smallint primary key default 1 check (id = 1),
  name text not null default 'Conference Hall',
  location text default 'Ground floor, open plan',
  description text default 'Open space for official gatherings, briefings and town halls.',
  capacity int not null default 40 check (capacity > 0),
  timezone text not null default 'Africa/Lagos',
  open_time time not null default '08:00',
  close_time time not null default '18:00',
  -- ISO weekdays: 1 = Monday … 7 = Sunday
  open_days smallint[] not null default '{1,2,3,4,5}',
  slot_minutes smallint not null default 30 check (slot_minutes in (15, 30, 60)),
  min_duration_minutes int not null default 30 check (min_duration_minutes > 0),
  max_duration_minutes int not null default 240,
  max_advance_days int not null default 60 check (max_advance_days > 0),
  requires_approval boolean not null default true,
  amenities text[] not null default '{"Projector & screen","Video conferencing","PA system & microphones","Whiteboard","Refreshments"}',
  updated_at timestamptz not null default now(),
  constraint space_settings_hours check (close_time > open_time),
  constraint space_settings_duration check (max_duration_minutes >= min_duration_minutes),
  constraint space_settings_days check (open_days <@ '{1,2,3,4,5,6,7}' and cardinality(open_days) > 0)
);

insert into public.space_settings default values;

create function public.space_settings_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown timezone "%"', new.timezone using detail = 'INVALID_TIMEZONE';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger space_settings_before_write
  before insert or update on public.space_settings
  for each row execute function public.space_settings_before_write();

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  purpose text,
  attendees int not null default 1 check (attendees > 0),
  needs text[] not null default '{}',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.booking_status not null default 'pending',
  decision_note text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  period tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,

  constraint bookings_user_id_fkey foreign key (user_id) references public.profiles (id) on delete cascade,
  constraint bookings_decided_by_fkey foreign key (decided_by) references public.profiles (id) on delete set null,
  constraint bookings_title_length check (char_length(btrim(title)) between 3 and 120),
  constraint bookings_purpose_length check (purpose is null or char_length(purpose) <= 1000),
  constraint bookings_time_order check (ends_at > starts_at),
  constraint bookings_no_confirmed_overlap exclude using gist (period with &&) where (status = 'confirmed')
);

create index bookings_period_idx on public.bookings using gist (period);
create index bookings_user_starts_idx on public.bookings (user_id, starts_at desc);
create index bookings_pending_idx on public.bookings (starts_at) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, department, role)
  values (
    new.id,
    new.email,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    nullif(btrim(new.raw_user_meta_data ->> 'department'), ''),
    -- Bootstrap: the very first account becomes the space admin.
    case when exists (select 1 from public.profiles where role = 'admin') then 'member' else 'admin' end::public.user_role
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Booking validation
-- ---------------------------------------------------------------------------

create function public.bookings_before_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.space_settings;
  local_start timestamp;
  local_end timestamp;
  duration_minutes int;
  clash record;
  -- Requests from signed-in users are held to the rules; service-role/SQL
  -- writes (seeding, back-office fixes) skip them but not the overlap constraint.
  enforce boolean := auth.uid() is not null;
  times_changed boolean;
begin
  new.updated_at := now();

  if tg_op = 'INSERT' and enforce then
    select * into s from public.space_settings where id = 1;
    new.status := case when public.is_admin() or not s.requires_approval
                       then 'confirmed' else 'pending' end::public.booking_status;
    new.decision_note := null;
    new.decided_by := null;
    new.decided_at := null;
  end if;

  if new.status not in ('pending', 'confirmed') or not enforce then
    return new;
  end if;

  times_changed := tg_op = 'INSERT'
    or new.starts_at is distinct from old.starts_at
    or new.ends_at is distinct from old.ends_at;

  if not times_changed and new.status = old.status then
    return new;
  end if;

  if s is null then
    select * into s from public.space_settings where id = 1;
  end if;

  if new.starts_at < now() then
    raise exception 'That time has already passed.' using detail = 'IN_PAST';
  end if;

  if times_changed then
    local_start := new.starts_at at time zone s.timezone;
    local_end := new.ends_at at time zone s.timezone;
    duration_minutes := extract(epoch from (new.ends_at - new.starts_at)) / 60;

    if not (extract(isodow from local_start)::smallint = any (s.open_days)) then
      raise exception 'The space is closed on %s.', trim(to_char(local_start, 'Day'))
        using detail = 'CLOSED_DAY';
    end if;

    if local_start::date <> local_end::date
       or local_start::time < s.open_time
       or local_end::time > s.close_time then
      raise exception 'Bookings must fall between % and %.',
        to_char(s.open_time, 'HH24:MI'), to_char(s.close_time, 'HH24:MI')
        using detail = 'OUTSIDE_HOURS';
    end if;

    if duration_minutes < s.min_duration_minutes or duration_minutes > s.max_duration_minutes then
      raise exception 'Bookings must be between % and % minutes long.',
        s.min_duration_minutes, s.max_duration_minutes
        using detail = 'INVALID_DURATION';
    end if;

    if new.starts_at > now() + make_interval(days => s.max_advance_days) then
      raise exception 'You can only book up to % days ahead.', s.max_advance_days
        using detail = 'TOO_FAR_AHEAD';
    end if;

    if new.attendees > s.capacity then
      raise exception 'The space holds at most % people.', s.capacity
        using detail = 'OVER_CAPACITY';
    end if;
  end if;

  select b.title, b.starts_at, b.ends_at into clash
  from public.bookings b
  where b.status = 'confirmed'
    and b.id <> new.id
    and b.period && tstzrange(new.starts_at, new.ends_at, '[)')
  order by b.starts_at
  limit 1;

  if found then
    raise exception 'The space is already booked for "%" (% – %).',
      clash.title,
      to_char(clash.starts_at at time zone coalesce(s.timezone, 'UTC'), 'HH24:MI'),
      to_char(clash.ends_at at time zone coalesce(s.timezone, 'UTC'), 'HH24:MI')
      using detail = 'SLOT_TAKEN';
  end if;

  return new;
end;
$$;

create trigger bookings_before_write
  before insert or update on public.bookings
  for each row execute function public.bookings_before_write();

-- ---------------------------------------------------------------------------
-- RPCs (the only way to change a booking after it is created)
-- ---------------------------------------------------------------------------

create function public.cancel_booking(p_id uuid, p_note text default null)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
  acting_as_admin boolean;
begin
  if auth.uid() is null then
    raise exception 'Sign in to manage bookings.' using detail = 'UNAUTHENTICATED';
  end if;

  select * into b from public.bookings where id = p_id for update;
  if not found then
    raise exception 'Booking not found.' using detail = 'NOT_FOUND';
  end if;

  acting_as_admin := b.user_id <> auth.uid();
  if acting_as_admin and not public.is_admin() then
    raise exception 'You can only cancel your own bookings.' using detail = 'FORBIDDEN';
  end if;

  if b.status not in ('pending', 'confirmed') then
    raise exception 'This booking is already %.', b.status using detail = 'INVALID_STATE';
  end if;

  if b.ends_at <= now() then
    raise exception 'This booking has already ended.' using detail = 'INVALID_STATE';
  end if;

  update public.bookings
  set status = 'cancelled',
      decision_note = case when acting_as_admin then nullif(btrim(p_note), '') else decision_note end,
      decided_by = case when acting_as_admin then auth.uid() else decided_by end,
      decided_at = case when acting_as_admin then now() else decided_at end
  where id = p_id
  returning * into b;

  return b;
end;
$$;

create function public.decide_booking(p_id uuid, p_approve boolean, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
  auto_declined int := 0;
begin
  if not public.is_admin() then
    raise exception 'Only space admins can approve or decline requests.' using detail = 'FORBIDDEN';
  end if;

  select * into b from public.bookings where id = p_id for update;
  if not found then
    raise exception 'Request not found.' using detail = 'NOT_FOUND';
  end if;

  if b.status <> 'pending' then
    raise exception 'This request was already %.', b.status using detail = 'INVALID_STATE';
  end if;

  if p_approve then
    update public.bookings
    set status = 'confirmed', decision_note = nullif(btrim(p_note), ''),
        decided_by = auth.uid(), decided_at = now()
    where id = p_id
    returning * into b;

    update public.bookings
    set status = 'declined',
        decision_note = format('The space was given to "%s" at this time. Please pick another slot.', b.title),
        decided_by = auth.uid(), decided_at = now()
    where status = 'pending'
      and id <> b.id
      and period && b.period;
    get diagnostics auto_declined = row_count;
  else
    update public.bookings
    set status = 'declined', decision_note = nullif(btrim(p_note), ''),
        decided_by = auth.uid(), decided_at = now()
    where id = p_id
    returning * into b;
  end if;

  return jsonb_build_object('booking', to_jsonb(b) - 'period', 'auto_declined', auto_declined);
end;
$$;

revoke execute on function public.cancel_booking(uuid, text) from public, anon;
revoke execute on function public.decide_booking(uuid, boolean, text) from public, anon;
grant execute on function public.cancel_booking(uuid, text) to authenticated;
grant execute on function public.decide_booking(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.space_settings enable row level security;
alter table public.bookings enable row level security;

create policy "Signed-in users can see profiles"
  on public.profiles for select to authenticated using (true);

create policy "Users can edit their own profile"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Users may change their name and department, never their role.
revoke update on public.profiles from authenticated, anon;
grant update (full_name, department) on public.profiles to authenticated;

-- Public so the sign-in page can show the space's name and hours.
create policy "Anyone can read space settings"
  on public.space_settings for select to anon, authenticated using (true);

create policy "Admins can update space settings"
  on public.space_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- The schedule is shared: everyone can see what the space is booked for.
create policy "Signed-in users can see bookings"
  on public.bookings for select to authenticated using (true);

create policy "Users can request bookings for themselves"
  on public.bookings for insert to authenticated
  with check (user_id = auth.uid());

revoke update, delete on public.bookings from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Realtime: push schedule changes to open browsers
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.bookings;
  end if;
end;
$$;
