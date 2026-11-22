# Architecture decisions

A booking crosses four boundaries. The browser gathers the student's input, a Next.js Route Handler verifies the session and validates the request, a Supabase client forwards the student's identity, and PostgreSQL enforces ownership and writes the row. An admin reads through a server-rendered page backed by the same database policies.

## Layers

Inside the server, a request passes through a few small layers. Each has one job and each is one file per feature, so a reader can follow any operation from the route to the database.

| Layer | Job | Booking API | Auth forms |
|---|---|---|---|
| Route | Read the request, make one call, return the response. No rules, no queries, no error codes. | `app/api/consultations/` | `app/api/auth/login`, `signup`, `logout`, `app/auth/callback` |
| Request chain | The steps every request shares, in one fixed order: origin, session, handler, and one catch that turns a thrown error into a response. | `features/consultations/server/student-request.ts` | `features/auth/server/auth-form-post.ts` |
| HTTP mapping | Readers validate input (media type, size, schema, `If-Match`). Response functions map each outcome to a status, body and ETag. | `features/consultations/server/consultation-http.ts` | same file as the chain (redirect targets) |
| Use case | The one decision the app owns, as one function. | `features/consultations/server/book-consultation.ts` | none, Supabase Auth owns the rules |
| Repository | The only code that talks to Supabase. Knows table names, column lists, function names and PostgreSQL error codes. Returns domain types or named results, never a raw Supabase error. | `features/consultations/server/consultation-repository.ts` | `features/auth/server/auth-repository.ts` |

Server-rendered pages get the same repositories through `features/auth/server/page-user.ts`, so the dashboard, the admin list and the API share the same read path.

**Wiring.** Only the session factories can construct the client accepted by either repository. A compile-time regression checks that an operator client cannot be supplied. The request chain and `page-user.ts` build the repositories for one request around the caller's own session client. There is no container and no global instance, because a client that carries one student's session must not outlive that student's request.

**Expected outcomes are values. Failures are thrown.** "Not found", "changed since you read it" and "this request was already saved" are normal results. The repository and `bookConsultation` return them as discriminated unions, and each response function handles them in a `switch` that ends in a `never` check, so adding an outcome without deciding its HTTP answer is a compile error. A request that cannot be served as sent throws a `Refusal` with its status and message. An unreachable database or Auth service throws a `DataAccessError`. `lib/http/failure.ts` turns both into responses, and it is the only file that does.

**One use case, one function.** PostgreSQL enforces ownership, the revision check and the future-time rule, so listing, changing and cancelling go straight from the route to the repository. A service class for them would only forward calls. The decision the app owns is the booking retry, and it lives in one function, `bookConsultation`, which takes the repository methods it needs as a parameter: when the database refuses an insert, is this the same request again (return the saved booking), the same request id with different details (conflict), a request id whose booking was cancelled (conflict), or just an invalid booking. That decision is unit tested without a database.

**Types.** A user id, a consultation id and a booking revision are all UUID strings, and passing one for another would compile and fail at run time, so each has a branded type that only its Zod schema can produce. Domain types are inferred from the Zod schemas, and every query is typed by the generated database types. Nothing else is branded.

**What is deliberately absent.** No dependency injection container, no generic base repository, no service classes that only forward, no repository interfaces (`bookConsultation` names the two repository methods it uses so a test can pass a plain object, and that is the only seam), no event bus, no cache layer. Each would be code to read with nothing in this app that needs it.

## Decisions by area

| Area | Decision for this assessment | How to verify it |
|---|---|---|
| Workspace | One Next.js application, one lockfile and one release. The browser and server share typed contracts inside the application. A separate API deployment or workspace package would have no second consumer here. | `package.json`, `app/`, `features/`, `lib/` |
| UI | Server-render the dashboard and admin list. Client components render and handle interaction. Calls to the API go through one typed client module, and the pending, error and out-of-date state of a save lives in one hook. Styling is shadcn/ui components on Tailwind CSS 4, with the theme tokens in one stylesheet. The `radix-ui` package re-exports every Radix primitive, so `next.config.ts` lists it under `optimizePackageImports` to keep unused ones out of the bundle. | `features/consultations/components/`, `features/consultations/client/`, `components/ui/`, `app/globals.css`, `tests/bookings.spec.ts` |
| HTTP contracts | Route Handlers expose the booking operations. Zod validates inputs, OpenAPI describes the wire format, and the generated TypeScript paths type the browser client. Native auth forms use redirects. | `features/consultations/contracts.ts`, `scripts/contracts.ts`, `npm run contracts:check` |
| Data access | One repository per feature holds every query: the column list, pagination, the student and admin read scope, the insert and the two database functions for edits and cancellation. Both functions share one step that locks the row and checks the signed-in owner before it compares the revision. The repositories are concrete classes over the typed Supabase client. There is no generic base class. | `features/consultations/server/consultation-repository.ts`, `features/auth/server/auth-repository.ts` |
| Identity and permissions | A student owns each booking. Only an operator can assign admin membership. PostgreSQL checks row ownership and column grants even on direct Data API calls. Membership revocation applies to an existing session. | `supabase/migrations/`, `supabase/tests/access.test.sql`, `tests/bookings.spec.ts` |
| Persistence and retries | Migrations define constraints and indexes. A private request-key ledger makes booking retries safe after rescheduling or cancellation. The API exposes completion as an explicit boolean. | `supabase/migrations/`, `lib/database.types.ts`, `npm run db:types:check` |
| Configuration and failure handling | The Supabase URL, publishable key and app origin come from the environment, are validated once at server start and are server-only, so one build runs anywhere. Product settings (time zone, page size, text limits) live in one file. Database API calls use a five-second timeout. Unexpected booking API errors carry a reference for the server log. | `lib/env.ts`, `instrumentation.ts`, `features/consultations/policy.ts`, `lib/supabase/session-client.ts`, `lib/http/failure.ts`, `scripts/recovery.ts` |
| Verification and delivery | Unit tests sit next to the code they test and cover pure logic, the booking retry decision and the outcome-to-HTTP mapping. SQL exercises real database policies. Playwright covers browser and API journeys against real Auth and PostgreSQL. CI installs from the lockfile and builds the app. Tests that reset, stop or load a database only run on a second, disposable stack. | `features/**/*.test.ts`, `lib/**/*.test.ts`, `tests/`, `.github/workflows/verify.yml`, `scripts/isolated.ts`, `scripts/load.ts`, `scripts/upgrade.ts` |

Booking success means the database transaction has committed. There is no separate email, billing or reporting workflow in the brief that needs a queue or event bus. Student ownership is sufficient for this one-school application. Organization tenancy would require a different permissions model.

The main product choices a reviewer may want to revisit are the Melbourne schedule time zone, the 20-row page size (both in `features/consultations/policy.ts`) and the choice to review conflicting edits at the whole-booking level. UUIDs identify records, and future-date validation uses the current time. The [verification report](verification.md) gives the measured local results and the operational work needed for a hosted deployment.

## Booking interaction

Students can jump from the dashboard heading to the booking form on a narrow screen. The calendar loads when opened and supports keyboard navigation. Start time is a separate editable combobox. It accepts 12- or 24-hour input and offers half-hour suggestions. The parser preserves any valid minute. Dates and times are Melbourne time whatever the browser's time zone is, and the form checks the chosen time before submission (`features/consultations/schedule-time.ts`). The same picker serves both workflows. The server and database still enforce the scheduling rules. The dialog is the native `<dialog>` element and the calendar is DayPicker, themed through its CSS variables to match the shadcn/ui tokens. [DayPicker documentation](https://daypicker.dev/docs/styling), [shadcn/ui theming](https://ui.shadcn.com/docs/theming), [Tailwind CSS with Next.js](https://nextjs.org/docs/app/getting-started/css#tailwind-css)

## Framework references

- Request handling and production deployment follow the [Next.js Route Handlers guide](https://nextjs.org/docs/app/getting-started/route-handlers) and [production checklist](https://nextjs.org/docs/app/guides/production-checklist).
- The identity and ownership decisions follow the [Supabase server-side authentication guide](https://supabase.com/docs/guides/auth/server-side/nextjs) and [PostgreSQL row-level security guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).
- The contract artifacts use the [OpenAPI 3.1 specification](https://spec.openapis.org/oas/v3.1.0) and [Zod JSON Schema support](https://zod.dev/json-schema).

The proxy forwards the cache headers supplied by Supabase when it rotates session cookies. Auth redirects explicitly set `private, no-store`. Access checks also run in the protected page or API and the database. [Supabase SSR caching](https://supabase.com/docs/guides/auth/server-side/advanced-guide) and [Next.js authorization guidance](https://nextjs.org/docs/app/guides/authentication).

## Two tabs editing one booking

The list includes a revision UUID per booking. Opening the reschedule form or the cancellation confirmation captures the revision the student saw. The browser supplies exactly one strong, quoted revision in `If-Match`. The API rejects a missing header with 428, and its contract rejects weak tags, wildcards and lists with 400. Create and replay return the current booking with its ETag. PATCH returns the resulting ETag. [HTTP conditional requests](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.1) and [HTTP 428](https://www.rfc-editor.org/rfc/rfc6585.html#section-3).

No lock is held while a student edits. At save time the database locks the owner's row, compares its current revision, applies one operation and commits. A concurrent writer then sees the committed revision, or an absent row after cancellation. The function uses a fixed empty search path, explicitly checks the authenticated owner and grants execution only to authenticated users. Direct student UPDATE and DELETE privileges are revoked. A trigger gives changed rows a fresh revision, even if values return to an earlier state. A current same-value request leaves the revision alone. [PostgreSQL row locks](https://www.postgresql.org/docs/17/explicit-locking.html#LOCKING-ROWS) and [Supabase database function permissions](https://supabase.com/docs/guides/database/functions#security-definer-vs-invoker).

A stale edit returns 412 and requires a fresh read. A missing or inaccessible row returns 404. A retry after an ambiguous network failure can therefore see 412 even if the student's first edit succeeded. The recovery action refreshes the dashboard so the student can see what was saved. Creating a booking continues to use a separate idempotency key.
