// Product decisions for consultations. Change one here and the form, the API
// contract, the generated OpenAPI document and the tests follow. PostgreSQL
// keeps its own copy of the text limits as CHECK constraints;
// tests/bookings.spec.ts proves the two agree at the boundary values.

// Consultations happen on campus, so every student and admin enters and reads
// times on the campus clock, wherever their browser is.
export const scheduleTimeZone = "Australia/Melbourne";
export const scheduleTimeZoneLabel = "Melbourne time";

export const pageSize = 20;
export const nameMaxLength = 100;
export const reasonMaxLength = 2000;

// The start-time dropdown suggests every half hour. Typing accepts any minute.
export const timeSuggestionStepMinutes = 30;
