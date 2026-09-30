-- Optional demo data: a realistic fortnight of bookings from made-up
-- requesters (@example.com). Run in the Supabase SQL editor after both
-- migrations. Remove with:
--   delete from public.bookings where purpose like '[demo]%';

do $$
declare
  tz text;
  mon date;
  people text[][] := array[
    ['Ada Okafor', 'ada.okafor@example.com', 'Facilities'],
    ['Tunde Bello', 'tunde.bello@example.com', 'Finance'],
    ['Grace Mensah', 'grace.mensah@example.com', 'Operations'],
    ['Kofi Asante', 'kofi.asante@example.com', 'People & Culture']
  ];
begin
  -- Demo rows include past and pre-decided bookings, so skip the booking rules.
  perform set_config('app.bypass_rules', 'on', true);
  select timezone into tz from public.space_settings where id = 1;
  mon := date_trunc('week', now() at time zone tz)::date;

  insert into public.bookings (requester_name, requester_email, requester_department,
                               title, purpose, attendees, needs, starts_at, ends_at, status, decision_note)
  select people[k + 1][1], people[k + 1][2], people[k + 1][3], title, '[demo] ' || purpose, attendees, needs,
         (mon + day_offset + start_t) at time zone tz,
         (mon + day_offset + end_t) at time zone tz,
         status::public.booking_status, note
  from (values
    (0, 0, 'Leadership briefing', 'Weekly priorities with department heads.', 12, '{"Projector & screen"}'::text[], time '09:00', time '10:30', 'confirmed', null),
    (1, 0, 'Vendor presentation', 'New HR software demo.', 8, '{"Projector & screen","Video conferencing"}', '14:00', '15:00', 'confirmed', null),
    (2, 1, 'Quarterly planning workshop', 'Q4 goals and budget allocation.', 24, '{"Whiteboard","Refreshments"}', '10:00', '12:00', 'confirmed', null),
    (1, 1, 'Team social', 'Birthday celebration.', 30, '{"Refreshments"}', '15:00', '16:00', 'declined', 'The space is reserved for official gatherings only.'),
    (0, 2, 'Weekly all-hands', 'Company updates and Q&A.', 38, '{"PA system & microphones","Video conferencing"}', '09:30', '10:30', 'confirmed', null),
    (1, 2, 'Board review prep', 'Dry run of the board deck.', 6, '{"Projector & screen"}', '13:00', '14:30', 'confirmed', null),
    (2, 2, 'Client pitch rehearsal', 'Final rehearsal before Friday''s pitch.', 10, '{"Projector & screen"}', '15:00', '16:30', 'pending', null),
    (3, 2, 'Training: new finance system', 'Hands-on training for finance and ops.', 20, '{"Projector & screen","Whiteboard"}', '15:30', '17:00', 'pending', null),
    (1, 3, 'Partner onboarding session', 'Welcome session for three new partners.', 15, '{"Video conferencing"}', '11:00', '12:30', 'pending', null),
    (0, 3, 'Town hall', 'Open forum with the MD.', 40, '{"PA system & microphones","Refreshments"}', '14:00', '16:00', 'confirmed', null),
    (3, 4, 'Safety briefing', 'Mandatory fire and safety drill briefing.', 35, '{"PA system & microphones"}', '10:00', '11:00', 'confirmed', null),
    (2, 4, 'End-of-month review', 'Numbers and blockers.', 12, '{"Projector & screen"}', '16:00', '17:30', 'pending', null),
    (1, 7, 'Budget kickoff', '2027 budget cycle kickoff.', 18, '{"Projector & screen","Refreshments"}', '09:00', '11:00', 'confirmed', null),
    (2, 7, 'Interview panel', 'Final-round interviews, Head of Ops.', 5, '{}', '13:00', '14:00', 'pending', null),
    (0, 8, 'Strategy session', 'Half-day strategy session.', 16, '{"Whiteboard","Refreshments"}', '10:00', '13:00', 'confirmed', null)
  ) as t(k, day_offset, title, purpose, attendees, needs, start_t, end_t, status, note);
end;
$$;
