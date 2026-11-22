-- Fixtures for npm run test:upgrade. This runs while the database is still at
-- the schema that was originally submitted (migration 20261122000500), so it
-- uses that schema's single edit-or-cancel function. One student ends up with
-- an open booking, a completed booking and a cancelled booking.
do $$
declare
  student uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values (student, 'upgrade-student@example.test');
  perform set_config('request.jwt.claim.sub', student::text, true);
  set local role authenticated;
  insert into public.consultations (request_id, first_name, last_name, reason, scheduled_at) values
    ('00000000-0000-4000-8000-00000000000a', 'Open', 'Before', 'Open before the upgrade', '2100-03-01 09:00+11'),
    ('00000000-0000-4000-8000-00000000000b', 'Completed', 'Before', 'Completed before the upgrade', '2100-03-02 10:30+11'),
    ('00000000-0000-4000-8000-00000000000c', 'Cancelled', 'Before', 'Cancelled before the upgrade', '2100-03-03 12:00+11');
  perform public.change_own_consultation(id, version, p_completed => true)
    from public.consultations where reason = 'Completed before the upgrade';
  perform public.change_own_consultation(id, version, p_cancel => true)
    from public.consultations where reason = 'Cancelled before the upgrade';
end $$;
