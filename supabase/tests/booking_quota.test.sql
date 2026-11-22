begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

select set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
insert into auth.users(id) values (auth.uid());
set local role authenticated;

select throws_ok($$insert into public.consultations(first_name,last_name,reason,scheduled_at)
  values ('Test','Student','Past',now() - interval '1 day')$$,
  '23514', null, 'a rejected booking rolls back');
reset role;
select is_empty($$select 1 from private.booking_quota where student_id=auth.uid()$$,
  'an invalid booking consumed no quota');
insert into private.booking_quota values (auth.uid(), now() + interval '1 hour', 60);
set local role authenticated;
select throws_ok($$insert into public.consultations(first_name,last_name,reason,scheduled_at)
  values ('Test','Student','Future',now() + interval '1 day')$$,
  'PT429', null, 'direct writes respect the limit');
select throws_ok($$update private.booking_quota set used=1$$, '42501', null,
  'a student cannot reset their counter');
reset role;
update private.booking_quota set expires_at=now() - interval '1 second' where student_id=auth.uid();
set local role authenticated;
select lives_ok($$insert into public.consultations(first_name,last_name,reason,scheduled_at)
  values ('Test','Student','Future',now() + interval '1 day')$$,
  'a new window permits a booking');
reset role;
select is(used,1,'the new window starts at one') from private.booking_quota where student_id=auth.uid();
select * from finish();
rollback;
