# Verification results

The current source adds an eighth migration for expired cancellation retries and a compile-time boundary around the caller’s Supabase client. The release checks cover both. Historical benchmarks below refer to the earlier build on this machine.

**Environment.** Apple M2 Max (12 cores, 32 GB), macOS 26.6.2. Docker 29.5.2 in a Colima VM with 4 CPUs and 8 GiB. Node 22.22.0. Supabase CLI 3.2.0, PostgreSQL 17.12. Google Chrome 157 driven by Playwright 1.65.1.

## Requirements and where each is proven

| Brief | Implementation | Proof |
|---|---|---|
| Next.js App Router, TypeScript, Supabase (`supabase-js`, `@supabase/ssr`, PostgreSQL) | Next.js 16.4.6, TypeScript 5.9 in strict mode, both Supabase libraries | `npm run check` |
| Login, logout, sign up | `app/api/auth/login`, `signup` and `logout`, `features/auth/server/auth-repository.ts`, `features/auth/components/auth-form.tsx` | `tests/auth.spec.ts`, `tests/confirmation.spec.ts` |
| Dashboard lists the student's consultations | `app/dashboard/page.tsx`, `features/consultations/server/consultation-repository.ts` | `tests/bookings.spec.ts` (browser journey, paging) |
| Mark complete or incomplete | `PATCH /api/consultations/:id` with `completed` | browser journey, revision tests |
| Booking form: first name, last name, reason, date and time | `features/consultations/components/booking-form.tsx`, `POST /api/consultations` | browser journey, limits and Unicode test, three time zone tests |
| Reschedule | `PATCH /api/consultations/:id` with `scheduled_at` | browser journey, two-tab race |
| Cancel | `DELETE /api/consultations/:id` | browser journey, revision tests |
| Admin view of all consultations, and how roles are defined | `app/admin/page.tsx`, `public.admin_memberships`, RLS policy `list_consultations` | `supabase/tests/access.test.sql`, API ownership test |
| APIs preferred over Server Actions | Route Handlers only. The project contains no `"use server"` | `app/api/` |
| README: setup, justifications and assumptions, summary | `README.md` quick start, walkthrough, assumptions and code layout | followed from a clean extraction of the archive |
| Database migrations and schema | `supabase/migrations/` (nine files) | `npm run db:start`, `npm run test:upgrade` |

## Submission regressions

The cancellation regression books, cancels, waits until the original time has passed and resends the identical POST. It expects 409 and an empty list. SQL tests check trigger precedence. Type checking rejects the operator client at both repository constructors, and a config test rejects privileged and legacy keys.


The browser suite now retries a committed booking after whitespace edits and checks for a 200 replay and a single saved row. A dashboard regression ages a full page of bookings into history, checks both sort orders and paging, then reschedules a past booking back into Upcoming. Origin tests cover omitted and explicit default ports and the email-confirmation tests exercise both local hostnames.

## Checks and counts from the preceding build

| Command | Result |
|---|---|
| `npm ci` | 0 known vulnerabilities reported by npm |
| `npm run check` | Generated contract files match their source. Prettier, ESLint (strict, type-aware, 0 warnings) and TypeScript pass. 56 unit tests pass. Production build succeeds. |
| `npm run db:types:check` | Generated database types match the migrated schema |
| `npm run db:lint` | No schema lint findings, no advisor warnings |
| `npm run test:db` | 55 pgTAP assertions pass |
| `npm run test:e2e` | 19 scenarios pass, 3 skipped (they need the other Auth profiles) |
| `npm run test:auth-profiles` | The 3 remaining scenarios pass: a real access token expires after 90 seconds and is renewed, and signup waits for an emailed link read from the local mailbox, on both local hostnames |
| `npm run isolated -- npm run test:upgrade` | From the previous schema with an open, a completed and a cancelled booking: 2 surviving bookings and 3 request ids identical column for column after the migration, then 10 pgTAP assertions pass |
| `npm run isolated -- npm run test:recovery` | With the Data API stopped, four concurrent operations (list, book, change, cancel) all returned `503` with a reference id, in 5,026 ms in total. After restart the same session worked and the retried booking existed exactly once. |
| `npm run isolated -- npm run test:load` | See below |

Of the 56 unit tests, 17 are new with the layering. 11 run the booking retry decision (`bookConsultation`) against a stand-in store. 5 pin the status, message and ETag for every outcome and for every thrown error. 1 covers the JSON body reader. None of them needs a database.

**Earlier layer refactor.** The reorganisation kept every status code, message, header and database call. The pgTAP and Playwright suites were not edited apart from import paths, and they pass. Three differences exist, none on a path a student can reach through the interface:

- A POST to an auth address that does not exist (for example `/api/auth/other`) from an untrusted origin used to answer 403 and now answers 404, because login, signup and logout are three explicit routes.
- An unexpected exception inside an auth form post now produces the same reference-id error as the booking API. Before, it fell through to the framework's default 500 response.
- The cancel route no longer maps a check-constraint error to "Choose a future time." Cancellation deletes a row and cannot raise that error, so the mapping was dead code.

The unit tests run every schedule-time case under five process time zones (Melbourne, Perth, Los Angeles, UTC, Kiritimati), including the hour that daylight saving skips and the hour it repeats. The browser tests run with the browser in Los Angeles time, and three more enter and read a booking from Perth, London and Kiritimati. One moves the browser clock two days back and confirms the database, not the browser, refuses a time that has passed.

## Concurrent edits

- **Two tabs, one booking.** Both `PATCH` requests are held in the browser until both are ready, then released together. Exactly one gets `204`, the other `412`, and a fresh read matches the winner.
- **Repeats.** The five race and retry scenarios passed 8 times in a row (40 runs): `npx playwright test -g "two open tabs|completing and rescheduling|double click|revision contracts|lost" --repeat-each 8`.
- **Do the tests detect a broken check?** On the disposable stack I removed the revision comparison from `private.lock_own_consultation` and reran those five scenarios. Four failed for the expected reason (for example `Expected: 412, Received: 204`). The fifth tests request ids, which the change does not touch. With the comparison restored all five passed again, as did the 55 database assertions.
- **64 writers.** The load script sends 64 different reschedules for one booking at once. 1 committed, 63 got `412`, and the stored time and revision were the winner's.

## Load

`npm run isolated -- npm run test:load` against `next start` (production build) on the disposable stack. Eight signed-in students each start with 2,000 bookings. One journey is eight requests: book, replay the same request, reschedule, complete, list page 1, list page 75, cancel, replay after cancel. The script checks every status and the final row counts. It is closed-loop: each client waits for its response before sending the next request.

| Clients | Journeys | Requests | Seconds | Requests/s | p50 ms | p95 ms | p99 ms | Failed journeys |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 4 | 20 | 160 | 0.33 | 482 | 7 | 12 | 22 | 0 |
| 16 | 80 | 640 | 0.98 | 654 | 24 | 35 | 40 | 0 |
| 48 | 240 | 1,920 | 2.58 | 744 | 64 | 96 | 117 | 0 |
| 96 | 480 | 3,840 | 4.62 | 831 | 113 | 173 | 221 | 0 |
| 64 (60 s) | 6,409 | 51,272 | 60.20 | 852 | 76 | 108 | 122 | 0 |

57,832 timed requests, none with an unexpected status.

**What the layers cost.** The code as it was before the layering was built and measured two minutes later, with the same script against the same disposable stack: 57,232 requests, 840 requests per second and a p95 of 110 ms in the 60-second stage. The layered code measured 57,712 requests, 848 requests per second and 109 ms. The difference is smaller than the variation between two runs of the same code, so the layers have no measurable cost here. The table above is the current code, where the booking rule is one function instead of a service class. Three runs of it gave 852 to 858 requests per second with a p95 of 106 to 108 ms. Three runs of the layered code on the same day gave 838 to 874 and 104 to 107 ms, so the two overlap. A request spends its time in Auth and PostgreSQL, not in a few extra function calls.

**Compared with earlier versions.** The same script on the same machine one day earlier measured 57,504 requests with a p95 of 108 ms for the previous reviewed build, and 57,400 requests with a p95 of 109 ms for the first working version.

**Noise matters.** Another run of that first version, while a different program was using more than one full core, managed 12,704 requests with a p95 of 1,008 ms in the same stage. Treat any single run on a shared laptop with care.

## Query plans

`EXPLAIN ANALYZE` as an authenticated user under RLS, with 100,000 bookings across 50 students (2,000 each).

| Query | Plan | Execution |
|---|---|---|
| Student list, page 1 | Index-only scan on `(student_id, scheduled_at, id)` | 0.04 ms |
| Student list, page 75 | Bitmap scan of the student's 2,000 rows, in-memory sort | 1.2 ms |
| Admin list, page 1 | Index scan on `(scheduled_at, id)` | 0.03 ms |
| Admin list, page 2,500 (offset 49,980) | Sequential scan, sort spills to disk (3.3 MB) | 19.5 ms |
| Admin list, last page (offset 99,980) | Same | 23.2 ms |

This is the known cost of offset paging: the admin list gets slower the deeper the page and the larger the table. It is acceptable at this size, and keyset paging is the fix when it is not.

## Accessibility and layout

A Playwright script walked 19 screen states (login, signup, their errors, the confirmation notice, empty and full dashboards, the date dialog, the time list, validation errors, the pending state, reschedule, cancel confirmation, the stale-edit conflict, paging, not found, and the admin view) at 375, 768 and 1280 px wide, and ran axe-core 4.14.1 on each with the WCAG 2.0, 2.1 and 2.2 A and AA rules.

| Check | Result |
|---|---|
| axe-core, 57 screen states | 0 violations |
| Horizontal overflow, 57 screen states | none |
| Text contrast, 18 text and background pairs from the tokens in `app/globals.css` | all at least 4.5:1 (lowest is muted text on a muted background, 5.62:1) |
| Input border and focus ring, 5 pairs against page, card and banner | all at least 3:1 (lowest is the input border on the page, 3.80:1) |
| Focus indicator | every control shows a 2 px outline with a 2 px offset |
| Touch size | text buttons and inputs are at least 44 px high on touch screens |

axe-core and the screenshot script are not part of this project. They were run from outside it, so they are not in `package.json`. What the project's own tests assert is roles, labels, keyboard paths and focus return: the Playwright suite finds every control by role or label, never by CSS class.

## Page weight

Production build (`next build`), every script and stylesheet the page's HTML references, gzip level 9.

| Page | JavaScript | CSS | HTML |
|---|---:|---:|---:|
| `/login` | 591.6 kB (185.7 kB gzip) | 44.6 kB (9.0 kB gzip) | 20.2 kB |
| `/dashboard` | 714.7 kB (224.0 kB gzip) | 44.6 kB (9.0 kB gzip) | 34.5 kB |

**What the component library costs.** An earlier revision with hand-written CSS and no component library measured 557.0 kB of JavaScript (171.9 kB gzip) and 19.7 kB of CSS (4.9 kB gzip) on `/login`, and 665.7 kB (205.5 kB gzip) on `/dashboard`. So shadcn/ui and Tailwind add about 14 kB of gzipped JavaScript and 4 kB of gzipped CSS to the first load, and the HTML is larger because utility classes are written on each element. Without `optimizePackageImports` for `radix-ui` in `next.config.ts` the `/login` JavaScript was 849.3 kB (261.4 kB gzip), which is why that setting is there.

## Not covered

- **No hosted deployment.** HTTPS cookies, real SMTP, Supabase's hosted rate limits and network latency were not exercised.
- **The CI workflow has not run.** `.github/workflows/verify.yml` repeats the commands above, but this project was not pushed to a remote.
- **One browser engine.** Chrome only. Firefox and Safari were not run, and no screen reader was used. Automated accessibility rules find only part of what a person using assistive technology would.
- **Load from one machine.** Client, app and database share one laptop. No soak test, no distributed clients, no backup and restore drill.
- The earlier benchmark predates the per-student creation quota. Current load runs report throttled creates separately. No hosted abuse testing was performed.
