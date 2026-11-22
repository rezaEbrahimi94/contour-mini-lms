-- Remember used keys after cancellation so a delayed retry cannot recreate a booking.
-- Account deletion also removes its keys. No names, times or reasons are retained here.
create schema if not exists private;
create table private.booking_requests (
  student_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  primary key (student_id, request_id)
);
revoke all on private.booking_requests from public, anon, authenticated;
insert into private.booking_requests select student_id, request_id from public.consultations;

create function private.reserve_booking_request() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into private.booking_requests values (new.student_id, new.request_id);
  return new;
end;
$$;
revoke all on function private.reserve_booking_request() from public, anon, authenticated;
create trigger reserve_booking_request before insert on public.consultations
for each row execute function private.reserve_booking_request();
