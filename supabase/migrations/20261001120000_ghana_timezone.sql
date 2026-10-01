-- The space is in Ghana (GMT, no daylight saving), not Lagos (UTC+1).
alter table public.space_settings alter column timezone set default 'Africa/Accra';

update public.space_settings set timezone = 'Africa/Accra' where id = 1 and timezone = 'Africa/Lagos';
