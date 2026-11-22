-- original_schedule is supplied by the BEFORE INSERT trigger. A default also
-- marks it as optional in the generated PostgREST client insert types.
alter table public.consultations alter column original_schedule set default now();
