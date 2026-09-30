-- Public booking: requesters book without an account; only admins sign in.
--
--   * Requesters are identified by name + email on the booking itself and
--     manage it through a private link (manage_token) sent by email.
--   * Anonymous clients get NO access to bookings. The Next.js server reads
--     and writes them with the service role and exposes only anonymised
--     busy/free blocks to the public page.
--   * Rules still live in the trigger, which now also applies to the service
--     role (so the public server path is held to them) and adds per-email
--     rate limits and an optional email-domain allowlist.

-- ---------------------------------------------------------------------------
-- Requester details on the booking
-- ---------------------------------------------------------------------------

alter table public.bookings
  add column requester_name text,
  add column requester_email text,
  add column requester_phone text,
  add column requester_department text,
  add column manage_token uuid not null default gen_random_uuid();

update public.bookings b
set requester_name = p.full_name,
    requester_email = p.email,
    requester_department = p.department
from public.profiles p
where p.id = b.user_id;

alter table public.bookings
  alter column user_id drop not null,
  alter column requester_name set not null,
  alter column requester_email set not null,
  add constraint bookings_manage_token_key unique (manage_token),
  add constraint bookings_requester_name_length check (char_length(btrim(requester_name)) between 2 and 120),
  add constraint bookings_requester_email_format check (requester_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  add constraint bookings_requester_phone_length check (requester_phone is null or char_length(requester_phone) <= 40);

comment on column public.bookings.user_id is 'Admin who created the booking; null for public requests.';

create index bookings_requester_email_idx on public.bookings (lower(requester_email), created_at desc);

-- Empty = anyone may request. e.g. '{company.com}' limits requests to work emails.
alter table public.space_settings
  add column allowed_email_domains text[] not null default '{}';

-- ---------------------------------------------------------------------------
-- Validation trigger (replaces the account-based version)
-- ---------------------------------------------------------------------------

create or replace function public.bookings_before_write()
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
  -- Seeds and back-office fixes can opt out with: set local app.bypass_rules = 'on'
  bypass boolean := coalesce(current_setting('app.bypass_rules', true), '') = 'on';
  admin boolean := public.is_admin();
  times_changed boolean;
  domain text;
  n int;
begin
  new.updated_at := now();
  select * into s from public.space_settings where id = 1;

  if tg_op = 'INSERT' and not bypass then
    new.status := case when admin or not s.requires_approval
                       then 'confirmed' else 'pending' end::public.booking_status;
    new.user_id := case when admin then auth.uid() end;
    new.requester_email := lower(btrim(new.requester_email));
    new.requester_name := btrim(new.requester_name);
    new.decision_note := null;
    new.decided_by := null;
    new.decided_at := null;

    if not admin then
      domain := split_part(new.requester_email, '@', 2);
      if cardinality(s.allowed_email_domains) > 0
         and not (domain = any (s.allowed_email_domains)) then
        raise exception 'Please use your work email (%).',
          array_to_string(array(select '@' || d from unnest(s.allowed_email_domains) d), ' or ')
          using detail = 'EMAIL_DOMAIN';
      end if;

      select count(*) into n from public.bookings
      where lower(requester_email) = new.requester_email
        and status = 'pending' and starts_at > now();
      if n >= 3 then
        raise exception 'You already have 3 requests waiting for approval. Please wait for a decision before requesting more.'
          using detail = 'RATE_LIMITED';
      end if;

      select count(*) into n from public.bookings
      where lower(requester_email) = new.requester_email
        and created_at > now() - interval '24 hours';
      if n >= 10 then
        raise exception 'Too many requests from this email today. Please try again tomorrow.'
          using detail = 'RATE_LIMITED';
      end if;
    end if;
  end if;

  if new.status not in ('pending', 'confirmed') or bypass then
    return new;
  end if;

  times_changed := tg_op = 'INSERT'
    or new.starts_at is distinct from old.starts_at
    or new.ends_at is distinct from old.ends_at;

  if not times_changed and new.status = old.status then
    return new;
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

  select b.starts_at, b.ends_at into clash
  from public.bookings b
  where b.status = 'confirmed'
    and b.id <> new.id
    and b.period && tstzrange(new.starts_at, new.ends_at, '[)')
  order by b.starts_at
  limit 1;

  -- Deliberately no title here: this message can reach the public page.
  if found then
    raise exception 'The space is already booked from % to %.',
      to_char(clash.starts_at at time zone s.timezone, 'HH24:MI'),
      to_char(clash.ends_at at time zone s.timezone, 'HH24:MI')
      using detail = 'SLOT_TAKEN';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin RPCs
-- ---------------------------------------------------------------------------

drop function public.cancel_booking(uuid, text);

create function public.cancel_booking(p_id uuid, p_note text default null)
returns public.bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
begin
  if not public.is_admin() then
    raise exception 'Only space admins can cancel bookings here.' using detail = 'FORBIDDEN';
  end if;

  select * into b from public.bookings where id = p_id for update;
  if not found then
    raise exception 'Booking not found.' using detail = 'NOT_FOUND';
  end if;
  if b.status not in ('pending', 'confirmed') then
    raise exception 'This booking is already %.', b.status using detail = 'INVALID_STATE';
  end if;
  if b.ends_at <= now() then
    raise exception 'This booking has already ended.' using detail = 'INVALID_STATE';
  end if;

  update public.bookings
  set status = 'cancelled', decision_note = nullif(btrim(p_note), ''),
      decided_by = auth.uid(), decided_at = now()
  where id = p_id
  returning * into b;
  return b;
end;
$$;

create or replace function public.decide_booking(p_id uuid, p_approve boolean, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b public.bookings;
  declined uuid[] := '{}';
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

    with d as (
      update public.bookings
      set status = 'declined',
          decision_note = 'Another booking was approved for this time. Please pick another slot.',
          decided_by = auth.uid(), decided_at = now()
      where status = 'pending' and id <> b.id and period && b.period
      returning id
    )
    select coalesce(array_agg(id), '{}') into declined from d;
  else
    update public.bookings
    set status = 'declined', decision_note = nullif(btrim(p_note), ''),
        decided_by = auth.uid(), decided_at = now()
    where id = p_id
    returning * into b;
  end if;

  return jsonb_build_object(
    'booking_id', b.id,
    'auto_declined', cardinality(declined),
    'auto_declined_ids', to_jsonb(declined)
  );
end;
$$;

revoke execute on function public.cancel_booking(uuid, text) from public, anon;
grant execute on function public.cancel_booking(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security: bookings and profiles are admin-only now
-- ---------------------------------------------------------------------------

drop policy "Signed-in users can see bookings" on public.bookings;
drop policy "Users can request bookings for themselves" on public.bookings;

create policy "Admins can see bookings"
  on public.bookings for select to authenticated using (public.is_admin());

create policy "Admins can create bookings"
  on public.bookings for insert to authenticated with check (public.is_admin());

drop policy "Signed-in users can see profiles" on public.profiles;

create policy "Users see their own profile; admins see all"
  on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());

revoke all on public.bookings from anon;
