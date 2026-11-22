-- Run by npm run test:upgrade after the newer migrations are applied on top
-- of the fixtures in submitted-schema.setup.sql. The script has already
-- compared every surviving row, column by column, with its state before the
-- upgrade. This checks that the upgraded database still behaves correctly for
-- bookings that existed before it. Rolled back, like every database test.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

select set_config('request.jwt.claim.sub',
  (select id::text from auth.users where email = 'upgrade-student@example.test'), true);
set local role authenticated;

select is(count(*), 2::bigint, 'the open and the completed booking survive; the cancelled one stays cancelled')
  from public.consultations;
select is(completed, true, 'the completed booking is still completed')
  from public.consultations where reason = 'Completed before the upgrade';
select is(scheduled_at, '2100-03-02 10:30+11'::timestamptz, 'and still at its original time')
  from public.consultations where reason = 'Completed before the upgrade';
select throws_ok($$ update public.consultations set completed = false $$,
  '42501', null, 'direct updates are still refused');
select throws_ok($$ insert into public.consultations (request_id, first_name, last_name, reason, scheduled_at)
  values ('00000000-0000-4000-8000-00000000000c', 'Cancelled', 'Before', 'Cancelled before the upgrade', '2100-03-03 12:00+11') $$,
  '23505', null, 'the cancelled booking''s request key is still spent');
select throws_ok($$ insert into public.consultations (request_id, first_name, last_name, reason, scheduled_at)
  values ('00000000-0000-4000-8000-00000000000a', 'Open', 'Before', 'Open before the upgrade', '2100-03-01 09:00+11') $$,
  '23505', null, 'the open booking''s request key still identifies it');
-- Revisions issued before the upgrade are accepted by the functions added in it.
select isnt(public.change_own_consultation(id, version, p_completed => false), version,
  'a revision issued before the upgrade edits the completed booking')
  from public.consultations where reason = 'Completed before the upgrade';
select is(completed, false, 'and the edit took effect')
  from public.consultations where reason = 'Completed before the upgrade';
select lives_ok($$ select public.cancel_own_consultation(id, version)
  from public.consultations where reason = 'Open before the upgrade' $$,
  'a revision issued before the upgrade cancels the open booking');
select is(count(*), 1::bigint, 'leaving one booking') from public.consultations;

select * from finish();
rollback;
