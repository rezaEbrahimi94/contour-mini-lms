# Contour student portal

A mini-LMS for booking student consultations. Students manage their own bookings. Admins have a read-only view across students. Built with Next.js 16 App Router, TypeScript, Supabase Auth and PostgreSQL, with shadcn/ui and Tailwind for the interface.

[Watch the narrated browser demo](docs/consultation-demo.mp4) to follow a booking from signup through rescheduling, cancellation and staff review. The same MP4 is included in the submission ZIP.

## Run locally

Use Node 22.18+ (tested with 22.22), npm, and a running Docker engine. On macOS with Colima, start Colima and extract the project under your home directory so Docker can mount the SQL tests.

```sh
npm ci
cp .env.example .env.local
npm run db:start
npm run dev
```

Open [the portal](http://127.0.0.1:3000). Local Supabase supplies authentication and the database. The example environment contains its local publishable key. The first start downloads the Docker images and applies the [migrations](supabase/migrations). Stop Next.js with Ctrl+C and Supabase with `npm run db:stop` to keep your data.

## Try the assessment

1. **Sign up and book.** Enter a first name, last name, reason, date and start time. Type a time such as `2:30 pm` or choose a suggestion. Local signup signs you in immediately.
2. **Manage a booking.** Upcoming shows the next appointment first. History shows past consultations most recent first. Both views support rescheduling, cancellation and marking complete or incomplete. A past consultation rescheduled into the future moves to Upcoming. Log out and back in to check persistence.
3. **Check ownership.** Sign up as a second student in a private window. Their dashboard starts empty.
4. **Try admin.** Sign up a test account, substitute its email below, and run the command in the project directory. One returned row confirms the grant. Refresh that account’s dashboard and open **Admin view**.

```sh
npx supabase db query "insert into public.admin_memberships (user_id) select id from auth.users where email = 'admin@example.test' on conflict do nothing returning user_id"
```

## Implementation and assumptions

- **Access.** Next.js Route Handlers handle writes. Server-rendered pages use the signed-in student’s Supabase identity. PostgreSQL row-level security controls reads, and edits and cancellations check ownership inside the database. Only a database operator can grant admin access.
- **Scheduling.** Students enter and see Melbourne time. Bookings and reschedules must be in the future. Completion is independent of the scheduled time. Cancellation removes the booking. Students may book the same instant because the brief defines no shared tutor or room capacity.
- **Retries and conflicts.** Retrying the same normalized details in the open form reuses the request key. PostgreSQL remembers each student’s used request keys. Retrying a cancelled booking returns a conflict even after its original time has passed. A rejected new booking leaves its key free. Edits use a booking revision. If two tabs edit the same booking, the stale tab must reload before it can save.

## How the code is organised

To follow a booking, start at the POST route below. The student dashboard and admin page read directly through the repository.

| Layer | Its one job | File |
|---|---|---|
| Route | Read the request, make one call, return the response | `app/api/consultations/route.ts` |
| Request chain | Origin check, then session, then the handler, with one place that turns a thrown error into a response | `features/consultations/server/student-request.ts` |
| HTTP mapping | Validate the input. Turn each outcome into a status, a body and an ETag | `features/consultations/server/consultation-http.ts` |
| Use case | The one business rule the app owns: what a repeated booking request means | `features/consultations/server/book-consultation.ts` |
| Repository | The only code that knows tables, columns, database functions and PostgreSQL error codes | `features/consultations/server/consultation-repository.ts` |
| Database | Ownership, revisions and the future-time rule | `supabase/migrations/` |

Listing, rescheduling, completing and cancelling have no rule of their own in the app, because PostgreSQL enforces them, so those routes call the repository directly. A repository is built per request around the signed-in student's own Supabase client. Both repositories require a client created for the current request. Startup accepts a Supabase publishable key (`sb_publishable_…`). PostgreSQL applies row-level security to reads and checks the signed-in owner inside each edit or cancellation.

```text
app/                 pages and thin Route Handlers
features/
  auth/              credentials and user types
    server/          repository, form-post chain, page sign-in
    components/      login and signup form
  consultations/     contracts (Zod), policy, schedule time, revision
    server/          book-consultation, repository, HTTP mapping, request chain
    client/          typed API calls and hooks for the components
    components/      booking form, list, booking controls, date and time
components/          shared UI and shadcn/ui primitives
lib/                 HTTP helpers, session client, environment
supabase/            migrations and SQL tests
tests/, scripts/     browser journeys and maintenance scripts
```

Unit tests sit next to the file they test (`*.test.ts`).

## Verify

With the app and database running, run the following in another terminal. For an installed Chrome, set `PLAYWRIGHT_CHANNEL=chrome` instead of installing Chromium.

```sh
npm run check
npm run db:types:check
npm run db:lint
npm run test:db
npx playwright install chromium
npm run test:e2e
```

`npm run test:auth-profiles` separately tests email confirmation and session expiry. It restarts local Supabase and restores its settings. See [architecture and API decisions](docs/architecture.md) and [verification results and limitations](docs/verification.md) for the deeper review.

Each student can create 60 consultations in an hour starting with their first successful booking. The database enforces the limit even for direct writes. Replays and failed bookings consume no additional slots, and cancellation does not refund one. Hosted deployments require HTTPS for both the app and Supabase.
