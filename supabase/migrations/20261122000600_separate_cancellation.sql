-- Give cancellation its own function. The combined function returned a
-- revision for an edit and NULL for a cancellation, which the generated
-- TypeScript types could not express: they promised a string either way.
-- After this migration an edit always returns the booking's current revision
-- and a cancellation returns nothing.

-- Shared first step of every versioned write: lock the caller's own booking,
-- then compare the revision the caller last read. Ownership is checked first,
-- so another student's booking is "not found" and never "changed".
create function private.lock_own_consultation(p_id uuid, p_version uuid)
returns public.consultations
language plpgsql set search_path = '' as $$
declare
  booking public.consultations%rowtype;
begin
  if p_version is null then
    raise sqlstate '22023' using message = 'Supply the booking revision';
  end if;
  select * into booking from public.consultations
    where id = p_id and student_id = (select auth.uid()) for update;
  if not found then raise sqlstate 'PT404' using message = 'Consultation not found'; end if;
  if booking.version <> p_version then
    raise sqlstate 'PT412' using message = 'Consultation changed';
  end if;
  return booking;
end;
$$;
revoke all on function private.lock_own_consultation(uuid,uuid) from public, anon, authenticated;

drop function public.change_own_consultation(uuid,uuid,timestamptz,boolean,boolean);

create function public.change_own_consultation(
  p_id uuid, p_version uuid,
  p_scheduled_at timestamptz default null, p_completed boolean default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  booking public.consultations%rowtype;
begin
  if num_nonnulls(p_scheduled_at, p_completed) <> 1 then
    raise sqlstate '22023' using message = 'Supply exactly one change';
  end if;
  booking := private.lock_own_consultation(p_id, p_version);
  -- A request that matches the stored value keeps the current revision.
  if p_completed is distinct from booking.completed and p_completed is not null then
    update public.consultations set completed = p_completed where id = booking.id
      returning version into booking.version;
  elsif p_scheduled_at is distinct from booking.scheduled_at and p_scheduled_at is not null then
    update public.consultations set scheduled_at = p_scheduled_at where id = booking.id
      returning version into booking.version;
  end if;
  return booking.version;
end;
$$;

create function public.cancel_own_consultation(p_id uuid, p_version uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  booking public.consultations%rowtype;
begin
  booking := private.lock_own_consultation(p_id, p_version);
  delete from public.consultations where id = booking.id;
end;
$$;

-- Supabase grants EXECUTE on new public functions to every API role by default.
revoke all on function public.change_own_consultation(uuid,uuid,timestamptz,boolean) from public, anon, authenticated;
revoke all on function public.cancel_own_consultation(uuid,uuid) from public, anon, authenticated;
grant execute on function public.change_own_consultation(uuid,uuid,timestamptz,boolean) to authenticated;
grant execute on function public.cancel_own_consultation(uuid,uuid) to authenticated;

-- Students lost direct UPDATE and DELETE privileges when revisions were
-- introduced, so these two policies can no longer be reached.
drop policy edit_own on public.consultations;
drop policy cancel_own on public.consultations;
