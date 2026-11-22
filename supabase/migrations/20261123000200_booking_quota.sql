-- One counter per student. Cancelling a booking does not refund the quota.
create table private.booking_quota (
  student_id uuid primary key references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used integer not null check (used between 1 and 60)
);
revoke all on private.booking_quota from public, anon, authenticated;

create or replace function private.reserve_booking_request() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  at_time timestamptz := statement_timestamp();
begin
  -- A duplicate exits here, before consuming a slot. All writes roll back
  -- together if the booking later fails validation or ownership checks.
  insert into private.booking_requests values (new.student_id, new.request_id);
  -- Trusted operator imports have no student session. All student inserts,
  -- including direct Data API calls, are subject to the same quota.
  if (select auth.uid()) is not null then
    insert into private.booking_quota as q values (new.student_id, at_time + interval '1 hour', 1)
    on conflict (student_id) do update set
      used = case when q.expires_at <= at_time then 1 else q.used + 1 end,
      expires_at = case when q.expires_at <= at_time then excluded.expires_at else q.expires_at end
    where q.expires_at <= at_time or q.used < 60;
    if not found then
      raise sqlstate 'PT429' using message = 'Student booking limit reached';
    end if;
  end if;
  return new;
end;
$$;
