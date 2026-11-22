-- Every existing row receives its own opaque revision. A write to a different
-- booking never invalidates this one, even when their scheduled times match.
alter table public.consultations add column version uuid not null default gen_random_uuid();

create function private.advance_consultation_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.version := gen_random_uuid();
  return new;
end;
$$;
create trigger advance_consultation_version before update on public.consultations
for each row execute function private.advance_consultation_version();

-- Make a version check mandatory even for callers using the Supabase data API.
revoke update(scheduled_at,completed), delete on public.consultations from authenticated;
create function public.change_own_consultation(
  p_id uuid, p_version uuid, p_scheduled_at timestamptz default null,
  p_completed boolean default null, p_cancel boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  booking public.consultations%rowtype;
begin
  if p_version is null or p_cancel is null or
     num_nonnulls(p_scheduled_at, p_completed) + p_cancel::int <> 1 then
    raise sqlstate '22023' using message = 'Supply a revision and exactly one change';
  end if;

  -- Ownership precedes conflict reporting, including for an admin reading another student's booking.
  select * into booking from public.consultations
    where id = p_id and student_id = (select auth.uid()) for update;
  if not found then raise sqlstate 'PT404' using message = 'Consultation not found'; end if;
  if booking.version <> p_version then
    raise sqlstate 'PT412' using message = 'Consultation changed';
  end if;

  if p_cancel then
    delete from public.consultations where id = booking.id;
    return null;
  elsif p_completed is not null and p_completed is distinct from booking.completed then
    update public.consultations set completed = p_completed where id = booking.id
      returning version into booking.version;
  elsif p_scheduled_at is not null and p_scheduled_at is distinct from booking.scheduled_at then
    update public.consultations set scheduled_at = p_scheduled_at where id = booking.id
      returning version into booking.version;
  end if;
  return booking.version;
end;
$$;
revoke all on function public.change_own_consultation(uuid,uuid,timestamptz,boolean,boolean) from public, anon, authenticated;
grant execute on function public.change_own_consultation(uuid,uuid,timestamptz,boolean,boolean) to authenticated;
