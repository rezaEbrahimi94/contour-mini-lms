-- PostgreSQL runs BEFORE INSERT triggers in name order. Reserve the key before
-- the schedule check so even a retry after cancellation and expiry sees the
-- spent key. A failed new booking rolls the reservation back with the insert.
alter trigger reserve_booking_request on public.consultations
  rename to book_request_key;
