-- Who may do what, asked of PostgreSQL itself: npm run test:db
-- Everything runs in one transaction that is rolled back. The three people in
-- it get fresh random identities on every run.
begin;
create extension if not exists pgtap with schema extensions;
select plan(57);

create schema test_support;
grant usage on schema test_support to authenticated, anon;
-- Become a signed-in person, the way the Data API does for a verified token.
create function test_support.sign_in(person text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', current_setting('test.' || person), true);
  perform set_config('role', 'authenticated', true);
end;
$$;
-- Remember a value under a name for later statements, whoever runs them.
create function test_support.remember(name text, value anyelement) returns void language plpgsql as $$
begin
  perform set_config('test.' || name, value::text, true);
end;
$$;
create function test_support.recall(name text) returns uuid language sql stable as $$
  select current_setting('test.' || name)::uuid;
$$;

select test_support.remember('student', gen_random_uuid());
select test_support.remember('other', gen_random_uuid());
select test_support.remember('admin', gen_random_uuid());
select test_support.remember('request', gen_random_uuid());
insert into auth.users (id)
  values (test_support.recall('student')), (test_support.recall('other')), (test_support.recall('admin'));
insert into public.admin_memberships values (test_support.recall('admin'));

-- What the schema grants, independent of any request.
select policies_are('public', 'consultations', array['list_consultations', 'book_own'],
  'consultations have a read policy and an insert policy, and no write policies');
select policies_are('public', 'admin_memberships', array['read_own_membership'],
  'a membership can only be read, and only by its owner');
select is(count(*), 2::bigint, 'row level security is on for both tables')
  from pg_class where oid in ('public.consultations'::regclass, 'public.admin_memberships'::regclass) and relrowsecurity;
select table_privs_are('public', 'consultations', 'authenticated', array['SELECT'],
  'a signed-in user has no table-wide insert, update or delete on consultations');
select table_privs_are('public', 'consultations', 'anon', array[]::text[],
  'a visitor has no privileges on consultations');
select table_privs_are('public', 'admin_memberships', 'authenticated', array['SELECT'],
  'a signed-in user can only read memberships');
select table_privs_are('private', 'booking_requests', 'authenticated', array[]::text[],
  'the request-key ledger is unreachable for signed-in users');
select column_privs_are('public', 'consultations', 'scheduled_at', 'authenticated', array['SELECT', 'INSERT'],
  'a student supplies the time when booking and cannot update it directly');
select column_privs_are('public', 'consultations', 'student_id', 'authenticated', array['SELECT'],
  'the ownership column is never writable');
select column_privs_are('public', 'consultations', 'completed', 'authenticated', array['SELECT'],
  'completion is never writable directly');
select column_privs_are('public', 'consultations', 'version', 'authenticated', array['SELECT'],
  'the revision is never writable');
select hasnt_function('public', 'change_own_consultation', array['uuid', 'uuid', 'timestamp with time zone', 'boolean', 'boolean'],
  'the combined edit-or-cancel function is gone');
select function_privs_are('public', 'change_own_consultation', array['uuid', 'uuid', 'timestamp with time zone', 'boolean'],
  'authenticated', array['EXECUTE'], 'a signed-in user may call the edit function');
select function_privs_are('public', 'cancel_own_consultation', array['uuid', 'uuid'],
  'authenticated', array['EXECUTE'], 'a signed-in user may call the cancel function');
select function_privs_are('public', 'change_own_consultation', array['uuid', 'uuid', 'timestamp with time zone', 'boolean'],
  'anon', array[]::text[], 'a visitor may not call the edit function');
select function_privs_are('public', 'cancel_own_consultation', array['uuid', 'uuid'],
  'anon', array[]::text[], 'a visitor may not call the cancel function');
select function_privs_are('private', 'lock_own_consultation', array['uuid', 'uuid'],
  'authenticated', array[]::text[], 'the locking helper cannot be called directly');
select is(count(*), 0::bigint, 'every function in the app schemas pins an empty search_path')
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and not coalesce(p.proconfig, '{}') @> array['search_path=""'];

-- A student books and manages their own consultation.
select test_support.sign_in('student');
select lives_ok($$
  insert into public.consultations (request_id, first_name, last_name, reason, scheduled_at)
  values (test_support.recall('request'), 'سارا', 'O’Connor', 'Algebra', now() + interval '1 day') $$,
  'a student can book');
select is(student_id, test_support.recall('student'), 'the database assigns the booking to the caller')
  from public.consultations;
select test_support.remember('booking', id), test_support.remember('first_revision', version)
  from public.consultations;

select throws_ok($$ insert into public.consultations (student_id, first_name, last_name, reason, scheduled_at)
  values (test_support.recall('other'), 'A', 'B', 'C', now() + interval '1 day') $$,
  '42501', null, 'a student cannot book on behalf of someone else');
select throws_ok($$ update public.consultations set student_id = auth.uid() $$,
  '42501', null, 'a student cannot write the ownership column');
select throws_ok($$ update public.consultations set completed = true $$,
  '42501', null, 'a direct update without a revision is refused');
select throws_ok($$ delete from public.consultations $$,
  '42501', null, 'a direct delete without a revision is refused');
select throws_ok($$ insert into public.consultations (first_name, last_name, reason, scheduled_at)
  values ('Test', 'Student', E'\t\n', now() + interval '1 day') $$,
  '23514', null, 'a blank reason is refused');
select throws_ok($$ insert into public.consultations (first_name, last_name, reason, scheduled_at)
  values ('Test', 'Student', 'Late', now() - interval '1 minute') $$,
  '23514', null, 'a booking in the past is refused');
select lives_ok($$ insert into public.consultations (first_name, last_name, reason, scheduled_at)
  values (repeat('é', 100), 'Limit', repeat('x', 2000), now() + interval '2 days') $$,
  'names of 100 characters and a reason of 2000 are accepted');
select throws_ok($$ insert into public.consultations (first_name, last_name, reason, scheduled_at)
  values (repeat('é', 101), 'Limit', 'One over', now() + interval '2 days') $$,
  '23514', null, 'a name of 101 characters is refused');
select throws_ok($$ insert into public.consultations (first_name, last_name, reason, scheduled_at)
  values ('Limit', 'Limit', repeat('x', 2001), now() + interval '2 days') $$,
  '23514', null, 'a reason of 2001 characters is refused');

select throws_ok($$ select public.change_own_consultation(test_support.recall('booking'),
  test_support.recall('first_revision'), p_scheduled_at => now() - interval '1 minute') $$,
  '23514', null, 'rescheduling into the past is refused');
select throws_ok($$ select public.change_own_consultation(test_support.recall('booking'), null, p_completed => true) $$,
  '22023', null, 'an edit without a revision is refused');
select throws_ok($$ select public.cancel_own_consultation(test_support.recall('booking'), null) $$,
  '22023', null, 'a cancellation without a revision is refused');
select throws_ok($$ select public.change_own_consultation(test_support.recall('booking'),
  test_support.recall('first_revision')) $$,
  '22023', null, 'an edit that changes nothing in particular is refused');
select throws_ok($$ select public.change_own_consultation(test_support.recall('booking'),
  test_support.recall('first_revision'), now() + interval '3 days', true) $$,
  '22023', null, 'an edit that changes two fields at once is refused');

-- A transaction that rolls back cannot advance the revision other clients hold.
select lives_ok($$ do $do$
  begin
    perform public.change_own_consultation(test_support.recall('booking'),
      test_support.recall('first_revision'), p_completed => true);
    raise exception using errcode = 'ZX001', message = 'roll back this edit';
  exception when sqlstate 'ZX001' then null;
  end $do$ $$, 'an edit is made and then rolled back');
select is(version, test_support.recall('first_revision'), 'the rolled-back edit left the revision as it was')
  from public.consultations where id = test_support.recall('booking') and not completed;

select is(public.change_own_consultation(test_support.recall('booking'),
    test_support.recall('first_revision'), p_completed => false),
  test_support.recall('first_revision'), 'a request that matches the stored value keeps the revision');
select test_support.remember('second_revision', public.change_own_consultation(
  test_support.recall('booking'), test_support.recall('first_revision'), p_completed => true));
select isnt(test_support.recall('second_revision'), test_support.recall('first_revision'),
  'a committed change issues a new revision');
select is(completed, true, 'the owner completed the booking') from public.consultations
  where id = test_support.recall('booking');
select throws_ok($$ select public.change_own_consultation(test_support.recall('booking'),
  test_support.recall('first_revision'), p_completed => false) $$,
  'PT412', null, 'an edit carrying a stale revision is refused');
select throws_ok($$ select public.cancel_own_consultation(test_support.recall('booking'),
  test_support.recall('first_revision')) $$,
  'PT412', null, 'a cancellation carrying a stale revision is refused');
select test_support.remember('third_revision', public.change_own_consultation(
  test_support.recall('booking'), test_support.recall('second_revision'), p_completed => false));
select throws_ok($$ select public.change_own_consultation(test_support.recall('booking'),
  test_support.recall('first_revision'), p_completed => true) $$,
  'PT412', null, 'returning to the original values does not revive the original revision');

-- Another student sees and changes nothing.
select test_support.sign_in('other');
select is_empty($$ select 1 from public.consultations $$, 'another student sees none of these bookings');
select throws_ok($$ select public.change_own_consultation(test_support.recall('booking'),
  test_support.recall('third_revision'), p_completed => true) $$,
  'PT404', null, 'another student cannot edit the booking, even with its current revision');
select throws_ok($$ select public.cancel_own_consultation(test_support.recall('booking'),
  test_support.recall('third_revision')) $$,
  'PT404', null, 'another student cannot cancel the booking');
select throws_ok($$ insert into public.admin_memberships values (auth.uid()) $$,
  '42501', null, 'a student cannot make themselves an admin');
select is_empty($$ select 1 from public.admin_memberships $$, 'a student cannot see who the admins are');

-- An admin reads everything and changes nothing.
select test_support.sign_in('admin');
select is(count(*), 2::bigint, 'an admin reads every student''s bookings') from public.consultations
  where student_id = test_support.recall('student');
select throws_ok($$ select public.change_own_consultation(test_support.recall('booking'),
  test_support.recall('third_revision'), p_completed => true) $$,
  'PT404', null, 'an admin cannot edit a student''s booking');
select throws_ok($$ select public.cancel_own_consultation(test_support.recall('booking'),
  test_support.recall('third_revision')) $$,
  'PT404', null, 'an admin cannot cancel a student''s booking');

-- A visitor without a session reaches nothing.
set local role anon;
select throws_ok($$ select 1 from public.consultations $$, '42501', null, 'a visitor cannot read consultations');
select throws_ok($$ select public.cancel_own_consultation(test_support.recall('booking'),
  test_support.recall('third_revision')) $$,
  '42501', null, 'a visitor cannot call the cancel function');

-- Cancelling removes the booking and keeps its request key spent.
select test_support.sign_in('student');
select lives_ok($$ select public.cancel_own_consultation(test_support.recall('booking'),
  test_support.recall('third_revision')) $$, 'the owner cancels with the current revision');
select is_empty($$ select 1 from public.consultations where id = test_support.recall('booking') $$,
  'the cancelled booking is gone');
select throws_ok($$ insert into public.consultations (request_id, first_name, last_name, reason, scheduled_at)
  values (test_support.recall('request'), 'سارا', 'O’Connor', 'Algebra', now() + interval '1 day') $$,
  '23505', null, 'a late retry of the cancelled booking cannot recreate it');

select throws_ok($$ insert into public.consultations (request_id, first_name, last_name, reason, scheduled_at)
  values (test_support.recall('request'), 'سارا', 'O’Connor', 'Algebra', now() - interval '1 day') $$,
  '23505', null, 'a spent key wins even when its payload is in the past');
select is_empty($$ select 1 from public.consultations where request_id = test_support.recall('request') $$,
  'an expired replay never restores the cancelled booking');

select * from finish();
rollback;
