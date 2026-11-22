-- Membership is provisioned by a trusted database operator.
create table public.admin_memberships (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admin_memberships enable row level security;
revoke all on public.admin_memberships from public, anon, authenticated;
grant select on public.admin_memberships to authenticated;
create policy read_own_membership on public.admin_memberships
  for select to authenticated using (user_id = (select auth.uid()));

create table public.consultations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  first_name text not null check (length(trim(first_name)) between 1 and 100),
  last_name text not null check (length(trim(last_name)) between 1 and 100),
  reason text not null check (length(trim(reason)) between 1 and 2000),
  scheduled_at timestamptz not null check (isfinite(scheduled_at)),
  completed boolean not null default false
);
create index consultations_student_schedule on public.consultations(student_id, scheduled_at, id);
create index consultations_schedule on public.consultations(scheduled_at, id);

alter table public.consultations enable row level security;
revoke all on public.consultations from public, anon, authenticated;
grant select, delete on public.consultations to authenticated;
grant insert(first_name,last_name,reason,scheduled_at),
      update(scheduled_at,completed) on public.consultations to authenticated;

create policy list_consultations on public.consultations for select to authenticated
  using (student_id = (select auth.uid()) or exists (select 1 from public.admin_memberships));
create policy book_own on public.consultations for insert to authenticated
  with check (student_id = (select auth.uid()));
create policy edit_own on public.consultations for update to authenticated
  using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));
create policy cancel_own on public.consultations for delete to authenticated
  using (student_id = (select auth.uid()));
