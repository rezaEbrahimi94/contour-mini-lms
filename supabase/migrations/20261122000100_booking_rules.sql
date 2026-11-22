alter policy list_consultations on public.consultations using (
  student_id = (select auth.uid()) or exists (
    select 1 from public.admin_memberships where user_id = (select auth.uid())
  )
);

alter table public.consultations
  add column request_id uuid not null default gen_random_uuid(),
  add column original_schedule timestamptz,
  add constraint consultations_student_request unique (student_id, request_id);
update public.consultations set original_schedule = scheduled_at;
alter table public.consultations alter column original_schedule set not null;
grant insert(request_id) on public.consultations to authenticated;

-- Preserve the original instant so a retried booking still matches after a reschedule.
create function public.check_consultation_schedule() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.scheduled_at <= statement_timestamp() then
    raise exception using errcode = '23514', message = 'Consultation time must be in the future';
  end if;
  if tg_op = 'INSERT' then
    new.original_schedule := new.scheduled_at;
  end if;
  return new;
end;
$$;
create trigger check_schedule before insert or update of scheduled_at on public.consultations
for each row execute function public.check_consultation_schedule();
