-- Also reject whitespace-only input through the direct Data API. Preserve
-- readability of legacy records when upgrading an existing installation.
alter table public.consultations add constraint consultation_text_present check (
  first_name ~ '[^[:space:]]' and last_name ~ '[^[:space:]]' and reason ~ '[^[:space:]]'
) not valid;
